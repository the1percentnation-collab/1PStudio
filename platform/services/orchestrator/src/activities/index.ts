/**
 * Pipeline activities — the seam between the durable workflow and real work.
 * Each activity calls the ml or render service, persists output via Prisma,
 * and is safe to retry (upserts + idempotency keys everywhere).
 */
import { Context } from "@temporalio/activity";
import { appendLedgerEntry, getPrisma, type Prisma } from "@onepct/db";
import {
  PLANS,
  stageCharge,
  type CaptionLine,
  type CropKeyframe,
  type EditOp,
  type PipelineOptions,
  type PipelineStage,
  type PlanId,
  type Resolution,
  type StageStatus,
  type Transcript,
} from "@onepct/shared";
import { ML_URL, RENDER_URL, postJson } from "../lib/http";

const db = getPrisma();

// ---------- bookkeeping ----------

export async function updateStage(input: {
  jobId: string;
  stage: PipelineStage;
  status: StageStatus;
  error?: string;
}): Promise<void> {
  const job = await db.job.findUnique({ where: { id: input.jobId } });
  if (!job) return;
  const stageStatus = (job.stageStatus as Record<string, unknown>) ?? {};
  const prev = (stageStatus[input.stage] as Record<string, unknown>) ?? {};
  stageStatus[input.stage] = {
    ...prev,
    status: input.status,
    ...(input.status === "RUNNING" && !prev.startedAt ? { startedAt: new Date().toISOString() } : {}),
    ...(input.status === "DONE" || input.status === "FAILED" ? { finishedAt: new Date().toISOString() } : {}),
    ...(input.error ? { error: input.error.slice(0, 2000) } : {}),
  };
  await db.job.update({
    where: { id: input.jobId },
    data: { stage: input.stage, stageStatus: stageStatus as Prisma.InputJsonValue, status: "RUNNING" },
  });
}

export async function markProject(input: {
  projectId: string;
  status: "PROCESSING" | "READY" | "FAILED";
  jobId?: string;
  error?: string;
}): Promise<void> {
  await db.project.update({ where: { id: input.projectId }, data: { status: input.status } });
  if (input.jobId && (input.status === "READY" || input.status === "FAILED")) {
    await db.job.update({
      where: { id: input.jobId },
      data: { status: input.status === "READY" ? "DONE" : "FAILED", finishedAt: new Date() },
    });
  }
}

export async function meterCredits(input: {
  workspaceId: string;
  jobId: string;
  stage: PipelineStage;
  units: number;
  resolution?: Resolution;
  idemSuffix?: string;
}): Promise<void> {
  const charge = stageCharge(input.stage, input.units, input.resolution);
  if (charge <= 0) return;
  await appendLedgerEntry(db, {
    workspaceId: input.workspaceId,
    delta: -charge,
    reason: "STAGE_CHARGE",
    stage: input.stage,
    jobId: input.jobId,
    idempotencyKey: `${input.jobId}:${input.stage}${input.idemSuffix ?? ""}`,
  });
}

// ---------- stages ----------

export async function ingest(input: { sourceVideoId: string }): Promise<{ durationSec: number }> {
  const source = await db.sourceVideo.findUniqueOrThrow({ where: { id: input.sourceVideoId } });
  if (source.status === "READY" && source.contentHash && source.durationSec) {
    return { durationSec: source.durationSec }; // retry-safe: already ingested
  }
  await db.sourceVideo.update({ where: { id: source.id }, data: { status: "INGESTING" } });
  const result = await postJson<{
    contentHash: string;
    durationSec: number;
    width: number;
    height: number;
    fps: number;
    normalizedKey: string;
    thumbKeys: Record<string, string>;
  }>(RENDER_URL, "/ingest", {
    sourceVideoId: source.id,
    originUrl: source.originUrl ?? undefined,
    uploadKey: source.uploadKey ?? undefined,
  }, 30 * 60_000);
  await db.sourceVideo.update({
    where: { id: source.id },
    data: { ...result, thumbKeys: result.thumbKeys as Prisma.InputJsonValue, status: "READY" },
  });
  return { durationSec: result.durationSec };
}

export async function transcribe(input: { sourceVideoId: string }): Promise<{ wordCount: number }> {
  const source = await db.sourceVideo.findUniqueOrThrow({ where: { id: input.sourceVideoId } });
  const transcript = await postJson<Transcript>(ML_URL, "/transcribe", {
    sourceKey: source.normalizedKey,
    contentHash: source.contentHash,
    durationSec: source.durationSec,
  });
  await db.timelineMetadata.upsert({
    where: { sourceVideoId: source.id },
    create: { sourceVideoId: source.id, transcript: transcript as unknown as Prisma.InputJsonValue, language: transcript.language },
    update: { transcript: transcript as unknown as Prisma.InputJsonValue, language: transcript.language },
  });
  return { wordCount: transcript.words.length };
}

export async function analyze(input: { sourceVideoId: string }): Promise<{ sceneCount: number }> {
  const source = await db.sourceVideo.findUniqueOrThrow({ where: { id: input.sourceVideoId } });
  const analysis = await postJson<{ scenes: unknown[]; faceTracks: unknown[]; audioEnergy: unknown[] }>(
    ML_URL, "/analyze",
    {
      sourceKey: source.normalizedKey,
      contentHash: source.contentHash,
      durationSec: source.durationSec,
      width: source.width,
      height: source.height,
      fps: source.fps,
    }
  );
  await db.timelineMetadata.upsert({
    where: { sourceVideoId: source.id },
    create: { sourceVideoId: source.id, ...jsonify(analysis) },
    update: jsonify(analysis),
  });
  return { sceneCount: analysis.scenes.length };
}

function jsonify(a: { scenes: unknown[]; faceTracks: unknown[]; audioEnergy: unknown[] }) {
  return {
    scenes: a.scenes as Prisma.InputJsonValue,
    faceTracks: a.faceTracks as Prisma.InputJsonValue,
    audioEnergy: a.audioEnergy as Prisma.InputJsonValue,
  };
}

export interface SelectedClip {
  clipId: string;
  startSec: number;
  endSec: number;
}

export async function selectClips(input: {
  sourceVideoId: string;
  projectId: string;
  options: PipelineOptions;
}): Promise<{ clips: SelectedClip[] }> {
  const existing = await db.clip.findMany({ where: { projectId: input.projectId } });
  if (existing.length > 0) {
    return { clips: existing.map((c) => ({ clipId: c.id, startSec: c.startSec, endSec: c.endSec })) };
  }
  const source = await db.sourceVideo.findUniqueOrThrow({
    where: { id: input.sourceVideoId },
    include: { timeline: true },
  });
  const { candidates } = await postJson<{ candidates: Array<{
    startSec: number; endSec: number; title: string; hookText: string; transcriptText: string;
    virality: { total: number; breakdown: Record<string, number>; reason: string };
  }> }>(ML_URL, "/select", {
    contentHash: source.contentHash,
    durationSec: source.durationSec,
    transcript: source.timeline?.transcript ?? {},
    analysis: { scenes: source.timeline?.scenes ?? [] },
    options: {
      clipCount: input.options.clipCount ?? 5,
      lengthBucket: input.options.lengthBucket,
      clipWindow: input.options.clipWindow,
      prompt: input.options.prompt,
    },
  });
  const clips: SelectedClip[] = [];
  for (const c of candidates) {
    const clip = await db.clip.create({
      data: {
        projectId: input.projectId,
        startSec: c.startSec,
        endSec: c.endSec,
        title: c.title,
        hookText: c.hookText,
        viralityScore: c.virality.total,
        viralityBreakdown: c.virality.breakdown as Prisma.InputJsonValue,
        viralityReason: c.virality.reason,
        transcriptSlice: { text: c.transcriptText } as Prisma.InputJsonValue,
        status: "PROCESSING",
      },
    });
    clips.push({ clipId: clip.id, startSec: clip.startSec, endSec: clip.endSec });
  }
  return { clips };
}

export async function reframe(input: { clipId: string; options: PipelineOptions }): Promise<void> {
  const clip = await db.clip.findUniqueOrThrow({
    where: { id: input.clipId },
    include: { project: { include: { sourceVideo: { include: { timeline: true } } } } },
  });
  const source = clip.project.sourceVideo!;
  const aspect = input.options.aspectRatios?.[0] ?? "9:16";
  const plan = await postJson<{ mode: string; keyframes: CropKeyframe[]; aspect: string }>(ML_URL, "/reframe-plan", {
    clipStartSec: clip.startSec,
    clipEndSec: clip.endSec,
    faceTracks: source.timeline?.faceTracks ?? [],
    scenes: source.timeline?.scenes ?? [],
    width: source.width,
    height: source.height,
    aspect,
  });
  await db.reframePlan.upsert({
    where: { clipId: clip.id },
    create: {
      clipId: clip.id,
      mode: plan.mode as "FACE_TRACK" | "CENTER" | "SPLIT",
      aspect,
      keyframes: plan.keyframes as unknown as Prisma.InputJsonValue,
    },
    update: { mode: plan.mode as "FACE_TRACK" | "CENTER" | "SPLIT", aspect, keyframes: plan.keyframes as unknown as Prisma.InputJsonValue },
  });
}

export async function caption(input: { clipId: string; options: PipelineOptions }): Promise<void> {
  const clip = await db.clip.findUniqueOrThrow({
    where: { id: input.clipId },
    include: { project: { include: { sourceVideo: { include: { timeline: true } } } } },
  });
  const timeline = clip.project.sourceVideo?.timeline;
  const result = await postJson<{ language: string; lines: CaptionLine[] }>(ML_URL, "/caption", {
    clipStartSec: clip.startSec,
    clipEndSec: clip.endSec,
    transcript: timeline?.transcript ?? {},
    language: input.options.language,
  });
  await db.captionSet.upsert({
    where: { clipId: clip.id },
    create: { clipId: clip.id, language: result.language, lines: result.lines as unknown as Prisma.InputJsonValue },
    update: { language: result.language, lines: result.lines as unknown as Prisma.InputJsonValue },
  });
}

export async function aiEdit(input: { clipId: string; options: PipelineOptions }): Promise<{ editVersion: number; edited: boolean }> {
  const clip = await db.clip.findUniqueOrThrow({
    where: { id: input.clipId },
    include: {
      captionSet: true,
      reframePlan: true,
      project: { include: { sourceVideo: { include: { timeline: true } } } },
    },
  });
  const timeline = clip.project.sourceVideo?.timeline;

  let captionLines = (clip.captionSet?.lines ?? []) as unknown as CaptionLine[];
  let extraOps: EditOp[] = [];
  const wantsEdit = Boolean(input.options.removeFillers);
  if (wantsEdit) {
    const result = await postJson<{ ops: EditOp[]; captionLines: CaptionLine[] }>(ML_URL, "/edit", {
      clipStartSec: clip.startSec,
      clipEndSec: clip.endSec,
      transcript: timeline?.transcript ?? {},
      captionLines,
      removeFillers: true,
    });
    extraOps = result.ops;
    captionLines = result.captionLines;
    await db.captionSet.update({
      where: { clipId: clip.id },
      data: { lines: captionLines as unknown as Prisma.InputJsonValue },
    });
  }

  const aspect = (clip.reframePlan?.aspect ?? "9:16") as "9:16" | "1:1" | "16:9";
  const ops: EditOp[] = [
    { kind: "trim", startSec: clip.startSec, endSec: clip.endSec },
    { kind: "cropPath", aspect, keyframes: (clip.reframePlan?.keyframes ?? []) as unknown as CropKeyframe[] },
    ...extraOps,
    { kind: "captionBurn", captionSetId: clip.captionSet?.id ?? "" },
    { kind: "transition", atSec: 0, style: "fade" },
  ];

  const existing = await db.editDecision.findUnique({ where: { clipId: clip.id } });
  const decision = await db.editDecision.upsert({
    where: { clipId: clip.id },
    create: { clipId: clip.id, version: 1, ops: ops as unknown as Prisma.InputJsonValue },
    // Pipeline re-runs refresh v1; user edits (via API) bump the version.
    update: existing && existing.version > 1 ? {} : { ops: ops as unknown as Prisma.InputJsonValue },
  });
  return { editVersion: decision.version, edited: wantsEdit && extraOps.length > 0 };
}

export async function applyBrand(input: {
  clipId: string;
  workspaceId: string;
  options: PipelineOptions;
}): Promise<void> {
  const workspace = await db.workspace.findUniqueOrThrow({ where: { id: input.workspaceId } });
  const plan = PLANS[(workspace.planId as PlanId) ?? "FREE"] ?? PLANS.FREE;
  const template = input.options.brandTemplateId
    ? await db.brandTemplate.findUnique({ where: { id: input.options.brandTemplateId } })
    : await db.brandTemplate.findFirst({ where: { workspaceId: input.workspaceId, isDefault: true } });

  if (template?.captionStyle) {
    await db.captionSet.update({
      where: { clipId: input.clipId },
      data: { style: template.captionStyle as Prisma.InputJsonValue },
    }).catch(() => undefined); // clip may have no captions
  }

  const needsWatermark = plan.watermark || input.options.watermark === true;
  const decision = await db.editDecision.findUnique({ where: { clipId: input.clipId } });
  if (!decision) return;
  const ops: EditOp[] = (decision.ops as unknown as EditOp[]).filter((o) => o.kind !== "watermark");
  if (needsWatermark) {
    let assetKey: string | undefined;
    if (template?.watermarkAssetId) {
      const asset = await db.asset.findUnique({ where: { id: template.watermarkAssetId } });
      assetKey = asset?.fileKey;
    }
    ops.push({ kind: "watermark", assetKey, position: "br" });
  }
  await db.editDecision.update({
    where: { clipId: input.clipId },
    data: { ops: ops as unknown as Prisma.InputJsonValue },
  });
}

export async function render(input: {
  clipId: string;
  editVersion: number;
  resolution: Resolution;
}): Promise<{ renderId: string; durationSec: number }> {
  const clip = await db.clip.findUniqueOrThrow({
    where: { id: input.clipId },
    include: { captionSet: true, editDecision: true, project: { include: { sourceVideo: true } } },
  });
  const existing = await db.render.findFirst({
    where: { clipId: clip.id, editVersion: input.editVersion, resolution: input.resolution, status: "DONE" },
  });
  if (existing) return { renderId: existing.id, durationSec: existing.durationSec ?? 0 }; // retry-safe

  const row = await db.render.create({
    data: { clipId: clip.id, editVersion: input.editVersion, resolution: input.resolution, status: "RENDERING" },
  });

  // Keep the activity heartbeating while ffmpeg runs in the render service.
  const ctx = Context.current();
  const beat = setInterval(() => ctx.heartbeat(), 15_000);
  try {
    const result = await postJson<{ outputKey: string; thumbKey: string; durationSec: number }>(
      RENDER_URL, "/render",
      {
        renderId: row.id,
        clipId: clip.id,
        sourceKey: clip.project.sourceVideo!.normalizedKey,
        clip: { startSec: clip.startSec, endSec: clip.endSec },
        edl: { version: input.editVersion, ops: clip.editDecision?.ops ?? [] },
        captions: clip.captionSet
          ? { lines: clip.captionSet.lines, style: clip.captionSet.style ?? undefined }
          : undefined,
        resolution: input.resolution,
      },
      30 * 60_000
    );
    await db.render.update({
      where: { id: row.id },
      data: { status: "DONE", outputKey: result.outputKey, thumbKey: result.thumbKey, durationSec: result.durationSec },
    });
    await db.clip.update({ where: { id: clip.id }, data: { status: "READY" } });
    return { renderId: row.id, durationSec: result.durationSec };
  } catch (err) {
    await db.render.update({
      where: { id: row.id },
      data: { status: "FAILED", error: String(err).slice(0, 2000) },
    });
    await db.clip.update({ where: { id: clip.id }, data: { status: "FAILED" } });
    throw err;
  } finally {
    clearInterval(beat);
  }
}
