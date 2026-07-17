import type { PipelineStage, Resolution } from "./pipeline";

/**
 * Single source of truth for credit economics.
 * The pipeline meters against it, billing charges against it, the ROI
 * calculator reads it, and the pricing page renders from it.
 *
 * Units: TRANSCRIBE/ANALYZE/SELECT are charged per source-minute (rounded up);
 * RENDER is charged per output-minute per render; the rest are flat per unit.
 */
export const STAGE_CREDIT_COST: Record<PipelineStage, number> = {
  INGEST: 0,
  TRANSCRIBE: 1,
  ANALYZE: 1,
  SELECT: 2,
  REFRAME: 1,
  CAPTION: 0,
  EDIT: 2,
  BRAND: 0,
  RENDER: 3,
  PUBLISH: 0,
};

export const RESOLUTION_MULTIPLIER: Record<Resolution, number> = {
  R720: 1,
  R1080: 1.5,
  R4K: 4,
};

/** Priced but stubbed add-ons — clean seams exist, vendors don't yet. */
export const ADDON_COST = {
  AI_VIDEO_BROLL: 10,
  DUBBING: 4,
  VOICEOVER: 1,
  UPSCALE: 3,
  SPEECH_ENHANCE: 1,
} as const;

export type PlanId = "FREE" | "STARTER" | "PRO" | "BUSINESS";

export interface PlanDef {
  id: PlanId;
  monthlyCredits: number | null; // null = custom/unlimited
  watermark: boolean;
  clipTtlDays: number | null; // null = never expires
  maxResolution: Resolution;
  seats: number | null;
  api: boolean;
}

export const PLANS: Record<PlanId, PlanDef> = {
  FREE: { id: "FREE", monthlyCredits: 60, watermark: true, clipTtlDays: 3, maxResolution: "R1080", seats: 1, api: false },
  STARTER: { id: "STARTER", monthlyCredits: 300, watermark: false, clipTtlDays: 30, maxResolution: "R1080", seats: 1, api: false },
  PRO: { id: "PRO", monthlyCredits: 1200, watermark: false, clipTtlDays: null, maxResolution: "R4K", seats: 2, api: true },
  BUSINESS: { id: "BUSINESS", monthlyCredits: null, watermark: false, clipTtlDays: null, maxResolution: "R4K", seats: null, api: true },
};

export interface CostEstimateInput {
  sourceDurationSec: number;
  clipCount: number;
  avgClipDurationSec?: number; // default 45
  resolution?: Resolution; // default R1080
  removeFillers?: boolean;
}

/** Preflight estimate used by POST /v1/videos to refuse jobs a workspace can't cover. */
export function estimateVideoCost(input: CostEstimateInput): number {
  const srcMin = Math.max(1, Math.ceil(input.sourceDurationSec / 60));
  const clipMin = Math.max(1, Math.ceil((input.avgClipDurationSec ?? 45) / 60));
  const resMult = RESOLUTION_MULTIPLIER[input.resolution ?? "R1080"];
  let cost = 0;
  cost += STAGE_CREDIT_COST.TRANSCRIBE * srcMin;
  cost += STAGE_CREDIT_COST.ANALYZE * srcMin;
  cost += STAGE_CREDIT_COST.SELECT * srcMin;
  cost += STAGE_CREDIT_COST.REFRAME * input.clipCount;
  if (input.removeFillers) cost += STAGE_CREDIT_COST.EDIT * input.clipCount;
  cost += Math.ceil(STAGE_CREDIT_COST.RENDER * clipMin * resMult) * input.clipCount;
  return cost;
}

/** Per-stage charge at completion time. `units` is stage-specific (minutes or count). */
export function stageCharge(stage: PipelineStage, units: number, resolution?: Resolution): number {
  const base = STAGE_CREDIT_COST[stage] * Math.max(0, units);
  if (stage === "RENDER" && resolution) return Math.ceil(base * RESOLUTION_MULTIPLIER[resolution]);
  return Math.ceil(base);
}
