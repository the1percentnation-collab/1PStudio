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

export interface ClipDetail extends Omit<ClipInfo, "editVersion"> {
  contentMetadata?: Record<string, unknown> | null;
  edl: { version: number; ops: unknown[] } | null;
  captions: { language: string; lines: { startSec: number; endSec: number; text: string }[]; style?: unknown } | null;
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

export const api = {
  projects: () => call<{ projects: ProjectInfo[] }>("/v1/projects"),
  project: (id: string) => call<ProjectInfo & { sourceVideo?: unknown }>(`/v1/projects/${id}`),
  projectClips: (id: string) => call<{ clips: ClipInfo[] }>(`/v1/projects/${id}/clips`),
  clip: (id: string) => call<ClipDetail>(`/v1/clips/${id}`),
  balance: () => call<{ balance: number; plan: { id: string } }>("/v1/credits/balance"),
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
  publish: (clipId: string, body: Record<string, unknown>) =>
    call<{ publication: { id: string; status: string }; note?: string }>(`/v1/clips/${clipId}/publish`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  premiereXmlUrl: (clipId: string) => `${BASE}/v1/clips/${clipId}/exports/premiere-xml`,
  apiKey: KEY,
};
