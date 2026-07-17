import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { creditBalance } from "@onepct/db";
import { estimateVideoCost, type PipelineOptions, type VideoPipelineInput } from "@onepct/shared";
import { requireAuth } from "../auth";
import { db } from "../lib/db";
import { presignUpload } from "../lib/storage";
import { TASK_QUEUE, temporal } from "../lib/temporal";

export function registerVideoRoutes(app: FastifyInstance): void {
  /** Direct-upload flow: get a presigned PUT, upload, then POST /v1/videos with the key. */
  app.post("/v1/uploads", { preHandler: requireAuth }, async (req) => {
    const { filename, contentType } = (req.body ?? {}) as { filename?: string; contentType?: string };
    const safe = (filename ?? "upload.mp4").replace(/[^\w.\-]/g, "_");
    const key = `${req.auth.workspaceId}/${randomUUID()}/${safe}`;
    const url = await presignUpload(key, contentType ?? "video/mp4");
    return { uploadKey: `sources/${key}`, url, method: "PUT" };
  });

  /** The front door of the pipeline. Preflights credits, then starts the durable workflow. */
  app.post("/v1/videos", { preHandler: requireAuth }, async (req, reply) => {
    const body = (req.body ?? {}) as {
      url?: string;
      uploadKey?: string;
      title?: string;
      options?: PipelineOptions;
      estimatedDurationSec?: number;
    };
    if (!body.url && !body.uploadKey) {
      return reply.code(400).send({ error: "url or uploadKey required" });
    }
    const options: PipelineOptions = {
      clipCount: 5,
      lengthBucket: "30-60s",
      resolution: "R1080",
      aspectRatios: ["9:16"],
      ...body.options,
    };

    const estimate = estimateVideoCost({
      sourceDurationSec: body.estimatedDurationSec ?? 600,
      clipCount: options.clipCount ?? 5,
      resolution: options.resolution,
      removeFillers: options.removeFillers,
    });
    const balance = await creditBalance(db, req.auth.workspaceId);
    if (balance < estimate) {
      return reply.code(402).send({ error: "insufficient credits", estimate, balance });
    }

    const project = await db.project.create({
      data: {
        workspaceId: req.auth.workspaceId,
        title: body.title ?? body.url ?? body.uploadKey ?? "Untitled",
        sourceVideo: { create: { originUrl: body.url, uploadKey: body.uploadKey } },
      },
      include: { sourceVideo: true },
    });
    const workflowId = `video-${project.sourceVideo!.id}`;
    const job = await db.job.create({ data: { projectId: project.id, workflowId, kind: "videoPipeline" } });

    const input: VideoPipelineInput = {
      sourceVideoId: project.sourceVideo!.id,
      projectId: project.id,
      workspaceId: req.auth.workspaceId,
      jobId: job.id,
      options,
    };
    const client = await temporal();
    await client.workflow.start("videoPipeline", { taskQueue: TASK_QUEUE, workflowId, args: [input] });

    return reply.code(202).send({ projectId: project.id, jobId: job.id, workflowId, estimate, balance });
  });
}
