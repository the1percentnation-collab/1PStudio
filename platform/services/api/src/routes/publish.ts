import type { FastifyInstance } from "fastify";
import type { Platform } from "@onepct/db";
import type { ContentMetadata } from "@onepct/shared";
import { requireAuth } from "../auth";
import { db } from "../lib/db";
import { generateClipMetadata } from "../metadata/service";
import { PUBLISHERS } from "../publish/publisher";

export function registerPublishRoutes(app: FastifyInstance): void {
  /**
   * Schedule (or draft) a post for a clip. Titles/descriptions/hashtags are
   * prefilled by the ported 1P Studio generator when not provided. Without a
   * platform OAuth connection the Publication stays SCHEDULED — the publisher
   * seam (publish/publisher.ts) is where real posting plugs in.
   */
  app.post("/v1/clips/:id/publish", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      platform?: Platform;
      title?: string;
      description?: string;
      hashtags?: string;
      scheduledAt?: string;
    };
    if (!body.platform) return reply.code(400).send({ error: "platform required" });
    const clip = await db.clip.findFirst({
      where: { id, project: { workspaceId: req.auth.workspaceId } },
      include: { project: { include: { sourceVideo: true } } },
    });
    if (!clip) return reply.code(404).send({ error: "not found" });

    let meta = clip.contentMetadata as ContentMetadata | null;
    if (!meta && (!body.title || !body.description || !body.hashtags)) {
      meta = await generateClipMetadata(clip);
      await db.clip.update({ where: { id: clip.id }, data: { contentMetadata: meta as object } });
    }

    const publication = await db.publication.create({
      data: {
        clipId: clip.id,
        platform: body.platform,
        title: body.title ?? meta?.best_title ?? clip.title,
        description: body.description ?? meta?.video_description ?? "",
        hashtags: body.hashtags ?? meta?.hashtags ?? "",
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        status: "SCHEDULED",
      },
    });

    const publisher = PUBLISHERS[body.platform];
    return reply.code(201).send({
      publication,
      note: publisher
        ? undefined
        : `no ${body.platform} OAuth connection wired yet — post stays SCHEDULED (seam: services/api/src/publish/publisher.ts)`,
    });
  });

  app.get("/v1/publications", { preHandler: requireAuth }, async (req) => {
    const { clipId, status } = req.query as { clipId?: string; status?: string };
    const publications = await db.publication.findMany({
      where: {
        clip: { project: { workspaceId: req.auth.workspaceId } },
        ...(clipId ? { clipId } : {}),
        ...(status ? { status: status as "DRAFT" | "SCHEDULED" | "POSTED" | "FAILED" } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { clip: { select: { title: true, projectId: true } } },
    });
    return { publications };
  });
}
