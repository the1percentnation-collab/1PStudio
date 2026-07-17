/** Typed client for the platform REST API (same contract the SDKs and MCP use). */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const KEY = process.env.NEXT_PUBLIC_API_KEY ?? "dev_sk_local";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KEY}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `${path} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export interface RenderInfo {
  id: string;
  editVersion: number;
  resolution: string;
  status: string;
  outputUrl: string | null;
  thumbUrl: string | null;
  error?: string | null;
}

export interface ClipInfo {
  id: string;
  projectId: string;
  startSec: number;
  endSec: number;
  title: string;
  hookText?: string;
  viralityScore: number;
  viralityBreakdown?: { hook: number; flow: number; value: number; trend: number };
  viralityReason?: string;
  status: string;
  editVersion: number;
  renders: RenderInfo[];
}

export interface CaptionLine {
  startSec: number;
  endSec: number;
  text: string;
  words?: { word: string; startSec: number; endSec: number }[];
  emphasis?: string[];
}

export interface ClipDetail extends Omit<ClipInfo, "editVersion"> {
  contentMetadata?: Record<string, unknown> | null;
  edl: { version: number; ops: EditOpLike[] } | null;
  captions: { language: string; lines: CaptionLine[]; style?: CaptionStyleLike | null } | null;
}

export type EditOpLike = { kind: string; [k: string]: unknown };

export interface CaptionStyleLike {
  fontFamily?: string;
  fontSizePx?: number;
  primaryColor?: string;
  highlightColor?: string;
  outlineColor?: string;
  outlinePx?: number;
  marginVPct?: number;
  allCaps?: boolean;
  karaoke?: boolean;
}

export interface ProjectInfo {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  clipCount?: number;
  durationSec?: number;
  job?: { id: string; stage: string | null; stageStatus: Record<string, { status: string }> };
}

export interface Publication {
  id: string;
  clipId: string;
  platform: string;
  title?: string | null;
  description?: string | null;
  hashtags?: string | null;
  scheduledAt?: string | null;
  status: string;
  createdAt: string;
  clip?: { title: string; projectId: string };
}

export interface LedgerEntry {
  id: string;
  delta: number;
  reason: string;
  stage?: string | null;
  createdAt: string;
}

export interface BrandTemplate {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface EstimateResult {
  estimate: number;
  rates: {
    stages: Record<string, number>;
    resolutionMultiplier: Record<string, number>;
    addons: Record<string, number>;
  };
}

export const api = {
  // reads
  projects: () => call<{ projects: ProjectInfo[] }>("/v1/projects"),
  project: (id: string) => call<ProjectInfo & { sourceVideo?: unknown }>(`/v1/projects/${id}`),
  projectClips: (id: string) => call<{ clips: ClipInfo[] }>(`/v1/projects/${id}/clips`),
  clip: (id: string) => call<ClipDetail>(`/v1/clips/${id}`),
  balance: () => call<{ balance: number; plan: { id: string; monthlyCredits: number | null } }>("/v1/credits/balance"),
  ledger: () => call<{ entries: LedgerEntry[] }>("/v1/credits/ledger"),
  estimate: (durationSec: number, clipCount: number, resolution: string) =>
    call<EstimateResult>(`/v1/credits/estimate?durationSec=${durationSec}&clipCount=${clipCount}&resolution=${resolution}`),
  brandTemplates: () => call<{ templates: BrandTemplate[] }>("/v1/brand-templates"),
  publications: (opts?: { clipId?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (opts?.clipId) q.set("clipId", opts.clipId);
    if (opts?.status) q.set("status", opts.status);
    const qs = q.toString();
    return call<{ publications: Publication[] }>(`/v1/publications${qs ? `?${qs}` : ""}`);
  },

  // writes
  presignUpload: (filename: string, contentType: string) =>
    call<{ uploadKey: string; url: string }>("/v1/uploads", {
      method: "POST",
      body: JSON.stringify({ filename, contentType }),
    }),
  startVideo: (body: Record<string, unknown>) =>
    call<{ projectId: string }>("/v1/videos", { method: "POST", body: JSON.stringify(body) }),
  patchEdl: (clipId: string, body: Record<string, unknown>) =>
    call<{ editVersion: number }>(`/v1/clips/${clipId}/edl`, { method: "PATCH", body: JSON.stringify(body) }),
  generateMetadata: (clipId: string) =>
    call<Record<string, unknown>>(`/v1/clips/${clipId}/metadata`, { method: "POST" }),
  generateRawMetadata: (body: { filename: string; transcript?: string }) =>
    call<Record<string, unknown>>("/v1/metadata/generate", { method: "POST", body: JSON.stringify(body) }),
  publish: (clipId: string, body: Record<string, unknown>) =>
    call<{ publication: { id: string; status: string }; note?: string }>(`/v1/clips/${clipId}/publish`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  premiereXmlUrl: (clipId: string) => `${BASE}/v1/clips/${clipId}/exports/premiere-xml`,
  apiKey: KEY,
};
