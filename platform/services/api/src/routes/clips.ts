import type { FastifyInstance } from "fastify";
import { isStubbedOp, type EditOp, type RenderClipInput, type Resolution } from "@onepct/shared";
import { requireAuth } from "../auth";
import { db } from "../lib/db";
import { presignDownload } from "../lib/storage";
import { TASK_QUEUE, temporal } from "../lib/temporal";
import { generateClipMetadata } from "../metadata/service";

const RENDER_URL = process.env.RENDER_URL ?? "http://localhost:8080";

async function ownedClip(clipId: string, workspaceId: string) {
  return db.clip.findFirst({
    where: { id: clipId, project: { workspaceId } },
    include: {
      editDecision: true,
      captionSet: true,
      renders: { orderBy: { createdAt: "desc" } },
      project: { include: { sourceVideo: true } },
    },
  });
}

export function registerClipRoutes(app: FastifyInstance): void {
  app.get("/v1/clips/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const clip = await ownedClip(id, req.auth.workspaceId);
    if (!clip) return reply.code(404).send({ error: "not found" });
    return {
      id: clip.id,
      projectId: clip.projectId,
      startSec: clip.startSec,
      endSec: clip.endSec,
      title: clip.title,
      hookText: clip.hookText,
      viralityScore: clip.viralityScore,
      viralityBreakdown: clip.viralityBreakdown,
      viralityReason: clip.viralityReason,
      status: clip.status,
      contentMetadata: clip.contentMetadata,
      edl: clip.editDecision ? { version: clip.editDecision.version, ops: clip.editDecision.ops } : null,
      captions: clip.captionSet ? { language: clip.captionSet.language, lines: clip.captionSet.lines, style: clip.captionSet.style } : null,
      renders: await Promise.all(
        clip.renders.map(async (r) => ({
          id: r.id,
          editVersion: r.editVersion,
          resolution: r.resolution,
          status: r.status,
          outputUrl: r.outputKey ? await presignDownload(r.outputKey) : null,
          thumbUrl: r.thumbKey ? await presignDownload(r.thumbKey) : null,
          error: r.error,
        }))
      ),
    };
  });

  /**
   * The EDL is declarative: editing mutates it and re-triggers RENDER only.
   * Bumps EditDecision.version and starts the lightweight renderClip workflow.
   */
  app.patch("/v1/clips/:id/edl", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      ops?: EditOp[];
      captionLines?: unknown[];
      captionStyle?: unknown;
      resolution?: Resolution;
    };
    const clip = await ownedClip(id, req.auth.workspaceId);
    if (!clip) return reply.code(404).send({ error: "not found" });
    if (!clip.editDecision) return reply.code(409).send({ error: "clip has no edit decision yet" });

    const stubbed = (body.ops ?? []).filter(isStubbedOp);
    if (stubbed.length > 0) {
      return reply.code(422).send({
        error: `ops not yet supported: ${stubbed.map((o) => o.kind).join(", ")}`,
        code: "UNSUPPORTED_OP",
      });
    }

    const version = clip.editDecision.version + 1;
    await db.editDecision.update({
      where: { clipId: clip.id },
      data: { version, ops: (body.ops ?? clip.editDecision.ops) as object, updatedBy: req.auth.userId },
    });
    if ((body.captionLines || body.captionStyle) && clip.captionSet) {
      await db.captionSet.update({
        where: { clipId: clip.id },
        data: {
          ...(body.captionLines ? { lines: body.captionLines as object } : {}),
          ...(body.captionStyle ? { style: body.captionStyle as object } : {}),
        },
      });
    }

    const job = await db.job.create({
      data: { projectId: clip.projectId, workflowId: `render-${clip.id}-v${version}`, kind: "renderClip" },
    });
    const input: RenderClipInput = {
      clipId: clip.id,
      workspaceId: req.auth.workspaceId,
      jobId: job.id,
      editVersion: version,
      resolution: body.resolution ?? "R1080",
    };
    const client = await temporal();
    await client.workflow.start("renderClip", {
      taskQueue: TASK_QUEUE,
      workflowId: job.workflowId,
      args: [input],
    });
    return reply.code(202).send({ clipId: clip.id, editVersion: version, jobId: job.id });
  });

  /** NLE timeline export (Premiere / Resolve) — exports the decision, not pixels. */
  app.get("/v1/clips/:id/exports/premiere-xml", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const clip = await ownedClip(id, req.auth.workspaceId);
    if (!clip?.project.sourceVideo) return reply.code(404).send({ error: "not found" });
    const source = clip.project.sourceVideo;
    const res = await fetch(`${RENDER_URL}/nle/premiere-xml`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectTitle: clip.project.title,
        clipTitle: clip.title,
        sourceFileName: "normalized.mp4",
        fps: source.fps ?? 30,
        sourceWidth: source.width ?? 1920,
        sourceHeight: source.height ?? 1080,
        startSec: clip.startSec,
        endSec: clip.endSec,
      }),
    });
    const { xml } = (await res.json()) as { xml: string };
    reply.header("Content-Type", "application/xml");
    reply.header("Content-Disposition", `attachment; filename="${clip.id}.xml"`);
    return reply.send(xml);
  });

  /** AI title/description/hashtags — the ported 1P Studio generator. */
  app.post("/v1/clips/:id/metadata", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const clip = await ownedClip(id, req.auth.workspaceId);
    if (!clip) return reply.code(404).send({ error: "not found" });
    const metadata = await generateClipMetadata(clip);
    await db.clip.update({ where: { id: clip.id }, data: { contentMetadata: metadata as object } });
    return metadata;
  });
}
