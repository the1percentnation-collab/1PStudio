import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth";
import { generateMetadata } from "../metadata/service";

/** Raw metadata generation — same request shape as the original 1P Studio tool. */
export function registerMetadataRoutes(app: FastifyInstance): void {
  app.post("/v1/metadata/generate", { preHandler: requireAuth }, async (req) => {
    const body = (req.body ?? {}) as {
      filename?: string;
      transcript?: string;
      frames?: { hookFrame?: string; midFrame?: string; endFrame?: string };
    };
    return generateMetadata({
      filename: body.filename ?? "unknown",
      transcript: body.transcript,
      frames: body.frames ?? {},
    });
  });
}
