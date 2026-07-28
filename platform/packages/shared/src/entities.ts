import type { JobStageStatus, PipelineStage, Resolution } from "./pipeline";
import type { ViralityBreakdown } from "./virality";

/** API-facing DTOs (mirrors of DB entities, serialization-safe). */

export type ProjectStatus = "QUEUED" | "PROCESSING" | "READY" | "FAILED";
export type ClipStatus = "SELECTED" | "PROCESSING" | "READY" | "FAILED";
export type RenderStatus = "QUEUED" | "RENDERING" | "DONE" | "FAILED";
export type Platform = "TIKTOK" | "YOUTUBE" | "INSTAGRAM" | "X";
export type PublicationStatus = "DRAFT" | "SCHEDULED" | "POSTED" | "FAILED";

export interface ProjectDto {
  id: string;
  workspaceId: string;
  title: string;
  status: ProjectStatus;
  createdAt: string;
  sourceVideo?: SourceVideoDto;
  job?: { id: string; stage: PipelineStage | null; stageStatus: JobStageStatus };
  clipCount?: number;
}

export interface SourceVideoDto {
  id: string;
  originUrl?: string | null;
  contentHash?: string | null;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  thumbKeys?: { hook?: string; mid?: string; end?: string };
}

export interface ClipDto {
  id: string;
  projectId: string;
  startSec: number;
  endSec: number;
  title: string;
  viralityScore: number;
  viralityBreakdown?: ViralityBreakdown;
  viralityReason?: string;
  status: ClipStatus;
  editVersion?: number;
  renders: RenderDto[];
}

export interface RenderDto {
  id: string;
  editVersion: number;
  resolution: Resolution;
  status: RenderStatus;
  outputKey?: string | null;
  outputUrl?: string | null;
  thumbKey?: string | null;
  error?: string | null;
}

export interface CreditLedgerEntryDto {
  id: string;
  delta: number;
  reason: string;
  stage?: PipelineStage | null;
  jobId?: string | null;
  createdAt: string;
}
