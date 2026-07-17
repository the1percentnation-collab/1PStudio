/**
 * The media pipeline as a durable Temporal workflow DAG.
 * One stage = one activity: idempotent, retryable, credit-metered at
 * completion. Workflow code is pure — every side effect lives in an activity.
 */
import { proxyActivities } from "@temporalio/workflow";
import type { PipelineStage, RenderClipInput, VideoPipelineInput } from "@onepct/shared";
import type * as activities from "../activities";

const act = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  retry: { maximumAttempts: 3, nonRetryableErrorTypes: ["ValidationError", "InsufficientCreditsError"] },
});

const heavy = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  heartbeatTimeout: "2 minutes",
  retry: { maximumAttempts: 3, nonRetryableErrorTypes: ["ValidationError", "UnsupportedOpError"] },
});

async function stage<T>(jobId: string, name: PipelineStage, fn: () => Promise<T>): Promise<T> {
  await act.updateStage({ jobId, stage: name, status: "RUNNING" });
  try {
    const result = await fn();
    await act.updateStage({ jobId, stage: name, status: "DONE" });
    return result;
  } catch (err) {
    await act.updateStage({ jobId, stage: name, status: "FAILED", error: String(err) });
    throw err;
  }
}

export async function videoPipeline(input: VideoPipelineInput): Promise<{ clipIds: string[] }> {
  const { sourceVideoId, projectId, workspaceId, jobId, options } = input;
  try {
    await act.markProject({ projectId, status: "PROCESSING" });

    const source = await stage(jobId, "INGEST", () => heavy.ingest({ sourceVideoId }));
    const srcMinutes = Math.max(1, Math.ceil(source.durationSec / 60));
    await act.meterCredits({ workspaceId, jobId, stage: "INGEST", units: srcMinutes });

    const [transcript] = await Promise.all([
      stage(jobId, "TRANSCRIBE", () => act.transcribe({ sourceVideoId })),
      stage(jobId, "ANALYZE", () => act.analyze({ sourceVideoId })),
    ]);
    await act.meterCredits({ workspaceId, jobId, stage: "TRANSCRIBE", units: srcMinutes });
    await act.meterCredits({ workspaceId, jobId, stage: "ANALYZE", units: srcMinutes });

    const { clips } = await stage(jobId, "SELECT", () =>
      act.selectClips({ sourceVideoId, projectId, options })
    );
    await act.meterCredits({ workspaceId, jobId, stage: "SELECT", units: srcMinutes });

    // Per-clip fan-out, bounded so the render pool isn't flooded.
    const BOUND = 3;
    const resolution = options.resolution ?? "R1080";
    for (let i = 0; i < clips.length; i += BOUND) {
      await Promise.all(
        clips.slice(i, i + BOUND).map(async (clip) => {
          const suffix = `:${clip.clipId}`;
          await stage(jobId, "REFRAME", () => act.reframe({ clipId: clip.clipId, options }));
          await act.meterCredits({ workspaceId, jobId, stage: "REFRAME", units: 1, idemSuffix: suffix });

          await stage(jobId, "CAPTION", () => act.caption({ clipId: clip.clipId, options }));

          const { editVersion, edited } = await stage(jobId, "EDIT", () =>
            act.aiEdit({ clipId: clip.clipId, options })
          );
          if (edited) await act.meterCredits({ workspaceId, jobId, stage: "EDIT", units: 1, idemSuffix: suffix });

          await stage(jobId, "BRAND", () => act.applyBrand({ clipId: clip.clipId, workspaceId, options }));

          const render = await stage(jobId, "RENDER", () =>
            heavy.render({ clipId: clip.clipId, editVersion, resolution })
          );
          await act.meterCredits({
            workspaceId, jobId, stage: "RENDER",
            units: Math.max(1, Math.ceil(render.durationSec / 60)),
            resolution, idemSuffix: suffix,
          });
        })
      );
    }

    await act.markProject({ projectId, status: "READY", jobId });
    return { clipIds: clips.map((c) => c.clipId) };
  } catch (err) {
    await act.markProject({ projectId, status: "FAILED", jobId, error: String(err) });
    throw err;
  }
}

/** Cheap re-render after an EDL edit: RENDER stage only, never the whole DAG. */
export async function renderClip(input: RenderClipInput): Promise<{ renderId: string }> {
  const { clipId, workspaceId, jobId, editVersion, resolution } = input;
  const render = await heavy.render({ clipId, editVersion, resolution });
  await act.meterCredits({
    workspaceId, jobId, stage: "RENDER",
    units: Math.max(1, Math.ceil(render.durationSec / 60)),
    resolution, idemSuffix: `:${clipId}:v${editVersion}`,
  });
  return { renderId: render.renderId };
}
