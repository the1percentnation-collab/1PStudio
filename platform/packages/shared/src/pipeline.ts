/** Pipeline stages, in execution order. One stage = one Temporal activity. */
export const PIPELINE_STAGES = [
  "INGEST",
  "TRANSCRIBE",
  "ANALYZE",
  "SELECT",
  "REFRAME",
  "CAPTION",
  "EDIT",
  "BRAND",
  "RENDER",
  "PUBLISH",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type StageStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED";

export interface StageState {
  status: StageStatus;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export type JobStageStatus = Partial<Record<PipelineStage, StageState>>;

export type Resolution = "R720" | "R1080" | "R4K";

export type AspectRatio = "9:16" | "1:1" | "16:9";

export type ClipLengthBucket = "0-30s" | "30-60s" | "1-3m" | "3-5m";

/** Options accepted by POST /v1/videos and threaded through the whole pipeline. */
export interface PipelineOptions {
  clipCount?: number; // target number of clips (default 5)
  aspectRatios?: AspectRatio[]; // default ["9:16"]
  resolution?: Resolution; // default R1080
  lengthBucket?: ClipLengthBucket; // default "30-60s"
  clipWindow?: { startSec: number; endSec: number }; // only clip within this window
  prompt?: string; // prompt-to-clip: natural-language guidance for selection
  removeFillers?: boolean;
  brandTemplateId?: string;
  watermark?: boolean; // forced true on FREE plan
  language?: string; // caption language override
}

export interface VideoPipelineInput {
  sourceVideoId: string;
  projectId: string;
  workspaceId: string;
  jobId: string;
  options: PipelineOptions;
}

export interface RenderClipInput {
  clipId: string;
  workspaceId: string;
  jobId: string;
  editVersion: number;
  resolution: Resolution;
}
