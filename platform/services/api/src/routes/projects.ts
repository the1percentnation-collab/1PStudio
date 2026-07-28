import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth";
import { db } from "../lib/db";
import { presignDownload } from "../lib/storage";

export function registerProjectRoutes(app: FastifyInstance): void {
  app.get("/v1/projects", { preHandler: requireAuth }, async (req) => {
    const projects = await db.project.findMany({
      where: { workspaceId: req.auth.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { sourceVideo: true, jobs: { where: { kind: "videoPipeline" }, orderBy: { startedAt: "desc" }, take: 1 }, _count: { select: { clips: true } } },
    });
    return {
      projects: projects.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        createdAt: p.createdAt,
        clipCount: p._count.clips,
        durationSec: p.sourceVideo?.durationSec,
        job: p.jobs[0] ? { id: p.jobs[0].id, stage: p.jobs[0].stage, stageStatus: p.jobs[0].stageStatus } : undefined,
      })),
    };
  });

  app.get("/v1/projects/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await db.project.findFirst({
      where: { id, workspaceId: req.auth.workspaceId },
      include: { sourceVideo: true, jobs: { where: { kind: "videoPipeline" }, orderBy: { startedAt: "desc" }, take: 1 } },
    });
    if (!project) return reply.code(404).send({ error: "not found" });
    const job = project.jobs[0];
    return {
      id: project.id,
      title: project.title,
      status: project.status,
      createdAt: project.createdAt,
      sourceVideo: project.sourceVideo && {
        id: project.sourceVideo.id,
        originUrl: project.sourceVideo.originUrl,
        contentHash: project.sourceVideo.contentHash,
        durationSec: project.sourceVideo.durationSec,
        width: project.sourceVideo.width,
        height: project.sourceVideo.height,
        status: project.sourceVideo.status,
      },
      job: job ? { id: job.id, stage: job.stage, status: job.status, stageStatus: job.stageStatus } : undefined,
    };
  });

  app.get("/v1/projects/:id/clips", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await db.project.findFirst({ where: { id, workspaceId: req.auth.workspaceId } });
    if (!project) return reply.code(404).send({ error: "not found" });
    const clips = await db.clip.findMany({
      where: { projectId: id },
      orderBy: { viralityScore: "desc" },
      include: { renders: { orderBy: { createdAt: "desc" } }, editDecision: true },
    });
    return {
      clips: await Promise.all(
        clips.map(async (c) => ({
          id: c.id,
          projectId: c.projectId,
          startSec: c.startSec,
          endSec: c.endSec,
          title: c.title,
          hookText: c.hookText,
          viralityScore: c.viralityScore,
          viralityBreakdown: c.viralityBreakdown,
          viralityReason: c.viralityReason,
          status: c.status,
          editVersion: c.editDecision?.version ?? 1,
          renders: await Promise.all(
            c.renders.map(async (r) => ({
              id: r.id,
              editVersion: r.editVersion,
              resolution: r.resolution,
              status: r.status,
              outputKey: r.outputKey,
              outputUrl: r.outputKey ? await presignDownload(r.outputKey) : null,
              thumbUrl: r.thumbKey ? await presignDownload(r.thumbKey) : null,
              error: r.error,
            }))
          ),
        }))
      ),
    };
  });
}
