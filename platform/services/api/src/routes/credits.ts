import type { FastifyInstance } from "fastify";
import { creditBalance } from "@onepct/db";
import { ADDON_COST, PLANS, RESOLUTION_MULTIPLIER, STAGE_CREDIT_COST, estimateVideoCost } from "@onepct/shared";
import { requireAuth } from "../auth";
import { db } from "../lib/db";

export function registerCreditRoutes(app: FastifyInstance): void {
  app.get("/v1/credits/balance", { preHandler: requireAuth }, async (req) => {
    const workspace = await db.workspace.findUnique({ where: { id: req.auth.workspaceId } });
    return {
      balance: await creditBalance(db, req.auth.workspaceId),
      plan: PLANS[(workspace?.planId as keyof typeof PLANS) ?? "FREE"],
    };
  });

  app.get("/v1/credits/ledger", { preHandler: requireAuth }, async (req) => {
    const entries = await db.creditLedger.findMany({
      where: { workspaceId: req.auth.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { entries };
  });

  /** ROI / cost calculator — reads the same credits.ts the pipeline meters against. */
  app.get("/v1/credits/estimate", { preHandler: requireAuth }, async (req) => {
    const q = req.query as { durationSec?: string; clipCount?: string; resolution?: string };
    const estimate = estimateVideoCost({
      sourceDurationSec: Number(q.durationSec ?? 600),
      clipCount: Number(q.clipCount ?? 5),
      resolution: (q.resolution as "R720" | "R1080" | "R4K") ?? "R1080",
    });
    return { estimate, rates: { stages: STAGE_CREDIT_COST, resolutionMultiplier: RESOLUTION_MULTIPLIER, addons: ADDON_COST } };
  });
}
