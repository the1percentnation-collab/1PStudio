import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth";
import { db } from "../lib/db";

/** Read-only brand-template list — feeds the intake page's template picker. */
export function registerBrandRoutes(app: FastifyInstance): void {
  app.get("/v1/brand-templates", { preHandler: requireAuth }, async (req) => {
    const templates = await db.brandTemplate.findMany({
      where: { workspaceId: req.auth.workspaceId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    return {
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        isDefault: t.isDefault,
        captionStyle: t.captionStyle,
        colors: t.colors,
      })),
    };
  });
}
