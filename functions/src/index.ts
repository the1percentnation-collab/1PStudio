import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import type { Request } from "firebase-functions/v2/https";

initializeApp();

// An error with an HTTP-ish status code, so shared pipeline helpers can be
// surfaced correctly by both the HTTP endpoints and the background worker.
class JobError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Per-user API keys. Each key is the caller's own, supplied in the Settings
// tab and stored at userConfig/{uid} in Firestore. HTTP endpoints identify
// the caller from a verified Firebase ID token; the background publish worker
// uses the job's ownerUid. Every key falls back to the server env var, so a
// user who hasn't set one (or an unauthenticated legacy call) still works if
// the server has that env configured.
// ---------------------------------------------------------------------------
interface ResolvedKeys {
  anthropic: string;
  zernio: string;
  zernioProfile: string;
  deepgram: string;
}

function keysFromDoc(data: Record<string, unknown> | undefined): ResolvedKeys {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    anthropic: s(data?.anthropicApiKey) || (process.env.ANTHROPIC_API_KEY ?? ""),
    zernio: s(data?.zernioApiKey) || (process.env.ZERNIO_API_KEY ?? ""),
    zernioProfile: s(data?.zernioProfileId) || (process.env.ZERNIO_PROFILE_ID ?? ""),
    deepgram: s(data?.deepgramApiKey) || (process.env.DEEPGRAM_API_KEY ?? ""),
  };
}

async function readUserConfig(uid: string): Promise<Record<string, unknown> | undefined> {
  try {
    const snap = await getFirestore().collection("userConfig").doc(uid).get();
    return snap.exists ? (snap.data() as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

// Resolve keys for an HTTP request: verify the Bearer ID token (if present),
// load that user's keys, env fallback per key. No/invalid token → env only.
async function resolveUserKeys(req: Request): Promise<ResolvedKeys> {
  const header = req.get("authorization") || req.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match) {
    try {
      const decoded = await getAuth().verifyIdToken(match[1]);
      return keysFromDoc(await readUserConfig(decoded.uid));
    } catch {
      // Invalid/expired token — fall through to env-only.
    }
  }
  return keysFromDoc(undefined);
}

// Resolve keys for the background worker, which already knows the job owner.
async function resolveUserKeysByUid(uid: string | undefined): Promise<ResolvedKeys> {
  return keysFromDoc(uid ? await readUserConfig(uid) : undefined);
}

// App-level admins. Keep in sync with ADMIN_EMAILS in src/services/admin.js.
const ADMIN_EMAILS = new Set(["the1percentnation@gmail.com"]);

// Verify the Bearer ID token belongs to an admin; throw JobError otherwise.
async function requireAdmin(req: Request): Promise<void> {
  const header = req.get("authorization") || req.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new JobError(401, "Sign in to continue.");
  let email = "";
  let verified = false;
  try {
    const decoded = await getAuth().verifyIdToken(match[1]);
    email = (decoded.email || "").toLowerCase();
    verified = decoded.email_verified === true;
  } catch {
    throw new JobError(401, "Your session expired — sign in again.");
  }
  if (!verified || !ADMIN_EMAILS.has(email)) {
    throw new JobError(403, "Admin access only.");
  }
}

function buildSystemPrompt(isPhoto: boolean): string {
  const media = isPhoto ? "TikTok photo post" : "TikTok video";
  const sourceLine = isPhoto
    ? "When a caption/notes text is provided, use it as the primary source for all fields. Otherwise infer from the still image."
    : "When a transcript is provided, use it as the primary source for all fields. When only frames are available, infer from visuals.";
  const summaryFrom = isPhoto ? "the image" : "frames";

  return `You are a TikTok content strategist for The One Percent Nation, a self-help and leadership coaching brand. The creator is Anthony Brown, a Black male leader, real estate broker turned full-time entrepreneur, faith-adjacent, direct communicator, Oklahoma-based. His content pillars are: limiting beliefs, self-accountability, identity and mindset, leadership and purpose. His hook style: second-person identity challenges, truth bombs, direct confrontation of excuses.

You are generating content for a ${media}. ${sourceLine}

Return ONLY valid JSON with no markdown, no backticks, no preamble. Fields:
- best_title (string): the single strongest ${isPhoto ? "post" : "video"} title — optimized for search and click-through, max 70 chars
- on_screen_text (string): bold text overlay shown on the ${isPhoto ? "photo" : "video"} — stop-scroll hook, max 8 words, all caps, punchy
- niche (string): specific content niche, 2-4 words (e.g. "Entrepreneur Mindset", "Real Estate Motivation", "Self-Discipline")
- thumbnail_text (string): text to print on the ${isPhoto ? "cover image" : "video thumbnail"} — max 6 words, high contrast, creates curiosity or urgency
- video_description (string): full ${isPhoto ? "post" : "video"} description — 200-400 chars, opens with a hook, body adds context, ends with soft CTA
- headline (string): punchy, all-caps title optimized for TikTok search — max 60 chars
- seo_opener (string): the first line of ${isPhoto ? "on-screen or caption text" : "spoken text or on-screen text"} that stops the scroll
- caption (string): full TikTok caption including opening line, body, and soft CTA — 150-300 chars
- hashtags (string): 12-15 hashtags, mix of niche, broad, and trending — space-separated
- content_pillar (string): one of "Self-Sabotage & Limiting Beliefs", "Accountability & Execution", "Identity & Mindset Shift", "Leadership & Purpose"
- hook_score (number 1-10): how strong the opening hook is
- hook_score_reason (string): one sentence explaining the score and one concrete tip to improve it
- titles (array of 3 strings): alternate ${isPhoto ? "post" : "video"} title options, each a different angle
- transcript_summary (string): 1-2 sentence summary of what the ${isPhoto ? "photo post" : "video"} is about (derive from provided text if given, otherwise from ${summaryFrom})`;
}

type Frame = string | null | undefined;

function imageBlock(base64: Frame, label: string): object[] {
  if (!base64) return [];
  return [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
    { type: "text", text: label },
  ];
}

export const analyzeVideo = onRequest(
  {
    cors: true,
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const apiKey = (await resolveUserKeys(req)).anthropic;
    if (!apiKey) {
      res.status(500).json({ error: "No Anthropic API key — add yours in Settings (or set the server key)." });
      return;
    }

    const { frames, transcript, filename, mediaType } = req.body as {
      frames?: { hookFrame?: Frame; midFrame?: Frame; endFrame?: Frame };
      transcript?: string;
      filename?: string;
      mediaType?: string;
    };

    const isPhoto = mediaType === "photo";

    const contentBlocks: object[] = isPhoto
      ? imageBlock(frames?.hookFrame, "[PHOTO — the still image being posted]")
      : [
          ...imageBlock(frames?.hookFrame, "[HOOK FRAME — opening shot]"),
          ...imageBlock(frames?.midFrame, "[MID FRAME — ~45% through video]"),
          ...imageBlock(frames?.endFrame, "[END FRAME — ~85% through video]"),
        ];

    const transcriptSection = transcript?.trim()
      ? `\n\n${isPhoto ? "CAPTION / NOTES" : "VIDEO TRANSCRIPT"}:\n"""\n${transcript.trim()}\n"""\n`
      : "";

    contentBlocks.push({
      type: "text",
      text: `${isPhoto ? "Photo" : "Video"} filename: "${filename ?? "unknown"}"${transcriptSection}\n\nGenerate the full content strategy JSON as instructed.`,
    });

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1800,
        system: buildSystemPrompt(isPhoto),
        messages: [{ role: "user", content: contentBlocks }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.json().catch(() => ({})) as { error?: { message?: string } };
      res.status(anthropicRes.status).json({ error: err?.error?.message ?? `API error ${anthropicRes.status}` });
      return;
    }

    const data = await anthropicRes.json() as { content?: { text?: string }[] };
    const text = data.content?.[0]?.text ?? "";

    let parsed: Record<string, unknown>;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : text);
    } catch {
      res.status(500).json({ error: "Failed to parse Claude response as JSON" });
      return;
    }

    res.json({
      best_title: parsed.best_title ?? "",
      on_screen_text: parsed.on_screen_text ?? "",
      niche: parsed.niche ?? "",
      thumbnail_text: parsed.thumbnail_text ?? "",
      video_description: parsed.video_description ?? "",
      headline: parsed.headline ?? "",
      seo_opener: parsed.seo_opener ?? "",
      caption: parsed.caption ?? "",
      hashtags: parsed.hashtags ?? "",
      content_pillar: parsed.content_pillar ?? "Identity & Mindset Shift",
      hook_score: typeof parsed.hook_score === "number" ? parsed.hook_score : 5,
      hook_score_reason: parsed.hook_score_reason ?? "",
      titles: Array.isArray(parsed.titles) ? parsed.titles : [],
      transcript_summary: parsed.transcript_summary ?? "",
    });
  }
);

// ---------------------------------------------------------------------------
// Social publishing via Zernio (https://zernio.com)
//
// Zernio is a single API that fans a post out to every connected social
// account (TikTok, Instagram Reels, YouTube Shorts, Facebook, X, LinkedIn).
// You connect each platform once inside the Zernio dashboard; these functions
// only need the Zernio API key (set as the ZERNIO_API_KEY env var / secret).
//
// Zernio groups connected accounts under a "profile", and a post targets
// specific account ids. So publishing = resolve profile -> list its accounts
// -> match the requested platforms to their account ids -> POST /posts. Pin a
// profile with ZERNIO_PROFILE_ID; otherwise the first profile on the key wins.
//
// Flow: the browser uploads the video DIRECTLY to Firebase Storage (no size
// cap from this function) and POSTs the resulting download URL + caption +
// selected platforms here as JSON. We hand that URL to Zernio, which pulls the
// media and posts it. No per-platform OAuth or app review is needed on our side.
// ---------------------------------------------------------------------------

const ZERNIO_API = "https://zernio.com/api/v1";

// App platform id -> Zernio platform id. Note: X is "twitter" in Zernio's API.
const TO_ZERNIO: Record<string, string> = {
  tiktok: "tiktok",
  instagram: "instagram",
  youtube: "youtube",
  facebook: "facebook",
  x: "twitter",
  twitter: "twitter",
  linkedin: "linkedin",
};

// Zernio platform id -> app platform id.
const FROM_ZERNIO: Record<string, string> = {
  tiktok: "tiktok",
  instagram: "instagram",
  youtube: "youtube",
  facebook: "facebook",
  twitter: "x",
  linkedin: "linkedin",
};

interface PublishBody {
  mediaUrl?: string;
  post?: string;
  title?: string;
  platforms?: string[];
  scheduleDate?: string;
  mediaType?: string;
  // The publisher's own Zernio credentials, threaded in by the caller
  // (resolveUserKeys for the endpoint, resolveUserKeysByUid for the worker).
  apiKey?: string;
  profileId?: string;
}

interface ZernioAccount {
  id: string;
  platform: string;    // normalized to our app's id
  displayName: string; // handle / name, without a leading "@"
  connected: boolean;
}

// Thin Zernio fetch wrapper: attaches auth + JSON headers, parses the body.
async function zernioFetch(
  path: string,
  apiKey: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const r = await fetch(`${ZERNIO_API}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return {ok: r.ok, status: r.status, data};
}

// Pull an array out of a response that may be bare or wrapped in a key.
function asArray(data: unknown, ...keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  const obj = (data ?? {}) as Record<string, unknown>;
  for (const k of keys) {
    if (Array.isArray(obj[k])) return obj[k] as Record<string, unknown>[];
  }
  return [];
}

// Best-effort human-readable error out of Zernio's response envelope.
function zernioError(data: Record<string, unknown>): string | null {
  const d = data as {
    message?: string;
    error?: string | {message?: string};
    errors?: (string | {message?: string; platform?: string})[];
  };
  if (typeof d.error === "string" && d.error.trim()) return d.error.trim();
  if (d.error && typeof d.error === "object" && d.error.message) {
    return d.error.message;
  }
  if (typeof d.message === "string" && d.message.trim()) return d.message.trim();
  if (Array.isArray(d.errors)) {
    const parts = d.errors
      .map((e) =>
        typeof e === "string" ?
          e :
          `${e.platform ? e.platform + ": " : ""}${e.message ?? ""}`)
      .filter((s) => s.trim());
    if (parts.length) return parts.join("; ");
  }
  return null;
}

// Which Zernio profile to operate on. Pinned via the caller's profile id
// (Settings / ZERNIO_PROFILE_ID), else the first profile on the account.
// Returns null if the key has no profiles.
async function resolveProfileId(apiKey: string, pinnedProfileId?: string): Promise<string | null> {
  const pinned = (pinnedProfileId ?? "").trim();
  if (pinned) return pinned;
  const {ok, data} = await zernioFetch("/profiles", apiKey);
  if (!ok) return null;
  const first = asArray(data, "profiles", "data", "items")[0];
  const id = first?.id ?? first?.profileId ?? first?._id;
  return id ? String(id) : null;
}

// List a profile's connected accounts, normalized to our app's platform ids.
async function listZernioAccounts(
  apiKey: string,
  profileId: string,
): Promise<ZernioAccount[]> {
  const {ok, data} = await zernioFetch(
    `/accounts?profileId=${encodeURIComponent(profileId)}`,
    apiKey,
  );
  if (!ok) return [];
  return asArray(data, "accounts", "data", "items")
    .map((a): ZernioAccount | null => {
      const rawId = a.id ?? a.accountId ?? a._id;
      const rawPlatform = String(a.platform ?? a.provider ?? "").toLowerCase();
      const platform = FROM_ZERNIO[rawPlatform] ?? rawPlatform;
      if (!rawId || !platform) return null;
      const status = String(a.status ?? a.health ?? "").toLowerCase();
      // A status field must read healthy; if absent, presence implies linked.
      const connected = status ?
        ["connected", "active", "healthy", "ok", "valid", "ready"]
          .includes(status) :
        true;
      const displayName = String(
        a.username ?? a.handle ?? a.displayName ?? a.name ?? "",
      ).replace(/^@/, "");
      return {id: String(rawId), platform, displayName, connected};
    })
    .filter((a): a is ZernioAccount => a !== null);
}

// The Zernio publish itself, shared by the publishPost endpoint (legacy
// clients) and the background publish worker. Throws JobError on anything
// that should stop the publish.
async function performZernioPublish(input: PublishBody): Promise<{ mediaUrl: string; skipped: string[]; ayrshare: unknown }> {
  const apiKey = (input.apiKey ?? "").trim() || (process.env.ZERNIO_API_KEY ?? "");
  if (!apiKey) throw new JobError(400, "No Zernio API key — add yours in Settings to post.");

  const { mediaUrl, post, title: rawTitle, platforms: rawPlatforms, scheduleDate, mediaType } = input;
  const isPhoto = mediaType === "photo";

  const requested = Array.from(new Set(
    (rawPlatforms ?? []).map((p) => p.toLowerCase()).filter((p) => TO_ZERNIO[p])
  ));

  if (requested.length === 0) throw new JobError(400, "Select at least one supported platform to post to.");
  if (isPhoto && requested.includes("youtube")) {
    throw new JobError(400, "YouTube only supports video — deselect YouTube to post this photo.");
  }
  if (!mediaUrl || !/^https?:\/\//.test(mediaUrl)) {
    throw new JobError(400, "A valid media URL is required (upload the file first).");
  }

  const postText = (post ?? "").trim();
  if (!postText) throw new JobError(400, "Caption text is required to publish.");

  try {
    // Resolve the profile, then map each requested platform to its account.
    const profileId = await resolveProfileId(apiKey, input.profileId);
    if (!profileId) {
      throw new JobError(400, "No Zernio profile is set up for this API key. Create one and connect accounts in the Zernio dashboard.");
    }

    const accounts = await listZernioAccounts(apiKey, profileId);
    const targets = requested
      .map((p) => accounts.find((a) => a.platform === p && a.connected))
      .filter((a): a is ZernioAccount => Boolean(a));
    const skipped = requested.filter((p) => !targets.some((t) => t.platform === p));

    if (targets.length === 0) {
      throw new JobError(400,
        `None of the selected platforms are connected in Zernio${skipped.length ? ` (${skipped.join(", ")})` : ""}. Connect them in the Zernio dashboard, then try again.`);
    }

    // Build the Zernio request, including platform-specific options.
    const title = (rawTitle ?? postText).slice(0, 99);
    const body: Record<string, unknown> = {
      content: postText,
      platforms: targets.map((t) => {
        const platform = TO_ZERNIO[t.platform] ?? t.platform;
        const entry: Record<string, unknown> = { platform, accountId: t.id };
        if (platform === "youtube") {
          entry.platformSpecificData = { title, privacyStatus: "public" };
        }
        if (platform === "instagram" && !isPhoto) {
          // Instagram video publishes as a Reel; photos post to the feed.
          entry.platformSpecificData = { mediaType: "REELS" };
        }
        return entry;
      }),
      mediaItems: [{ type: isPhoto ? "image" : "video", url: mediaUrl }],
    };

    // Optional scheduling — Zernio accepts an ISO 8601 date in the future.
    if (scheduleDate && !Number.isNaN(Date.parse(scheduleDate))) {
      body.scheduledFor = new Date(scheduleDate).toISOString();
      body.timezone = "UTC";
    } else {
      body.publishNow = true;
    }

    const { ok, status, data } = await zernioFetch("/posts", apiKey, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!ok) {
      // Surface Zernio's real reason instead of hiding it behind a status.
      throw new JobError(status, zernioError(data) || `Zernio error ${status}`);
    }

    // `ayrshare` key kept for client/reconciler back-compat; it carries the
    // provider's post id (postId) used to match against post history later.
    return { mediaUrl, skipped, ayrshare: data };
  } catch (e) {
    if (e instanceof JobError) throw e;
    throw new JobError(502, `Failed to reach Zernio: ${e instanceof Error ? e.message : "unknown error"}`);
  }
}

export const publishPost = onRequest(
  {
    cors: true,
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    try {
      const keys = await resolveUserKeys(req);
      const body = { ...((req.body ?? {}) as PublishBody), apiKey: keys.zernio, profileId: keys.zernioProfile };
      const result = await performZernioPublish(body);
      res.json({ status: "ok", ...result });
    } catch (e) {
      const code = e instanceof JobError ? e.code : 500;
      res.status(code).json({ error: e instanceof Error ? e.message : "Publish failed." });
    }
  }
);

// ---------------------------------------------------------------------------
// Connected-account status — reads which social accounts are linked in
// Zernio so the app can show live connection state. Accounts are linked in
// the Zernio dashboard; this just reports their status.
// ---------------------------------------------------------------------------

export const accountsStatus = onRequest(
  {
    cors: true,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (req, res) => {
    const keys = await resolveUserKeys(req);
    const apiKey = keys.zernio;
    if (!apiKey) {
      res.status(200).json({ configured: false, connected: [], displayNames: [] });
      return;
    }

    try {
      const profileId = await resolveProfileId(apiKey, keys.zernioProfile);
      if (!profileId) {
        res.status(200).json({ configured: true, connected: [], displayNames: [], error: "No Zernio profile found for this API key." });
        return;
      }

      const accounts = await listZernioAccounts(apiKey, profileId);
      const connected = Array.from(
        new Set(accounts.filter((a) => a.connected).map((a) => a.platform))
      );
      const displayNames = accounts
        .filter((a) => a.connected && a.displayName)
        .map((a) => ({ platform: a.platform, displayName: a.displayName }));

      res.json({ configured: true, connected, displayNames });
    } catch (e) {
      res.status(200).json({ configured: true, connected: [], displayNames: [], error: e instanceof Error ? e.message : "unknown error" });
    }
  }
);

// ---------------------------------------------------------------------------
// Post history — proxies Zernio's GET /posts so the app can show REAL post
// outcomes (published / still scheduled / failed at fire time) instead of the
// optimistic local record written when a post was queued. Fields in Zernio's
// response aren't contractually stable, so everything is normalized defensively
// here and the client only sees one clean shape.
// ---------------------------------------------------------------------------

type NormStatus = "published" | "scheduled" | "failed";

function normStatus(raw: unknown, dateIso: string | null): NormStatus {
  const s = String(raw ?? "").toLowerCase();
  if (["error", "failed", "failure"].includes(s)) return "failed";
  if (s.startsWith("awaiting") || ["scheduled", "pending", "processing", "queued", "draft", "publishing"].includes(s)) return "scheduled";
  if (["success", "posted", "sent", "published", "completed"].includes(s)) return "published";
  // Unknown status: a future date means it hasn't fired yet.
  return dateIso && Date.parse(dateIso) > Date.now() ? "scheduled" : "published";
}

function toIso(v: unknown): string | null {
  if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
  const obj = v as { _seconds?: number; seconds?: number; utc?: string } | null | undefined;
  const secs = obj?._seconds ?? obj?.seconds;
  if (typeof secs === "number") return new Date(secs * 1000).toISOString();
  if (typeof obj?.utc === "string" && !Number.isNaN(Date.parse(obj.utc))) return new Date(obj.utc).toISOString();
  return null;
}

function normErrors(item: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (e: unknown) => {
    if (typeof e === "string" && e.trim()) out.push(e.trim());
    else if (e && typeof e === "object") {
      const msg = (e as { message?: unknown; error?: unknown }).message ?? (e as { error?: unknown }).error;
      const platform = (e as { platform?: unknown }).platform;
      if (typeof msg === "string" && msg.trim()) out.push(platform ? `${platform}: ${msg.trim()}` : msg.trim());
    }
  };
  if (Array.isArray(item.errors)) item.errors.forEach(push);
  if (Array.isArray(item.posts)) {
    for (const p of item.posts as Record<string, unknown>[]) {
      if (Array.isArray(p?.errors)) p.errors.forEach(push);
    }
  }
  if (out.length === 0 && String(item.status ?? "").toLowerCase() === "error" && typeof item.message === "string") {
    push(item.message);
  }
  return out;
}

export const postHistory = onRequest(
  {
    cors: true,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (req, res) => {
    const keys = await resolveUserKeys(req);
    const apiKey = keys.zernio;
    if (!apiKey) {
      res.status(200).json({ configured: false, posts: [] });
      return;
    }

    try {
      const profileId = await resolveProfileId(apiKey, keys.zernioProfile);
      const path = profileId ? `/posts?profileId=${encodeURIComponent(profileId)}` : "/posts";
      const { ok, status, data } = await zernioFetch(path, apiKey);

      if (!ok) {
        res.status(200).json({ configured: true, posts: [], error: `Zernio error ${status}` });
        return;
      }

      // The history envelope may be a bare array or wrapped in a key.
      const items = asArray(data, "posts", "data", "items", "history");

      const posts = items
        .map((item) => {
          const rawId = item.id ?? item.postId ?? item._id;
          if (!rawId) return null;
          const date =
            toIso(item.scheduledFor) ?? toIso(item.publishedAt) ?? toIso(item.createdAt) ?? toIso(item.created) ?? toIso(item.date);
          // Platforms may be strings or {platform,...} objects, or live on an
          // `accounts`/`targets` array of per-account results.
          const rawPlatforms = Array.isArray(item.platforms) ? item.platforms
            : Array.isArray(item.accounts) ? item.accounts
              : Array.isArray(item.targets) ? item.targets
                : [];
          const platforms = Array.from(new Set(rawPlatforms
            .map((p) => {
              const s = typeof p === "string" ? p : String((p as Record<string, unknown>)?.platform ?? "");
              return FROM_ZERNIO[s.toLowerCase()] ?? s.toLowerCase();
            })
            .filter(Boolean)));
          // Media may be strings or {url,...} objects under a few keys.
          const rawMedia = Array.isArray(item.mediaItems) ? item.mediaItems
            : Array.isArray(item.mediaUrls) ? item.mediaUrls
              : Array.isArray(item.media) ? item.media
                : [];
          const mediaUrls = rawMedia
            .map((m) => (typeof m === "string" ? m : String((m as Record<string, unknown>)?.url ?? "")))
            .filter((u): u is string => typeof u === "string" && u.length > 0);
          return {
            id: String(rawId),
            status: normStatus(item.status, date),
            caption: String(item.content ?? item.post ?? item.caption ?? item.message ?? ""),
            platforms,
            mediaUrls,
            date,
            errors: normErrors(item),
          };
        })
        .filter(Boolean);

      res.json({ configured: true, posts });
    } catch (e) {
      res.status(200).json({ configured: true, posts: [], error: e instanceof Error ? e.message : "unknown error" });
    }
  }
);

// ---------------------------------------------------------------------------
// Captions — auto-transcribe a video (Deepgram) and burn word-synced captions
// into the video with ffmpeg. Additive: independent of Claude/Anthropic.
//
// Flow: the browser uploads the video to Storage and POSTs its URL here.
// We transcribe via Deepgram (word timestamps), build a styled .ass subtitle
// file, burn it in with ffmpeg, and upload the captioned MP4 back to Storage.
// ---------------------------------------------------------------------------

// ffmpeg/ffprobe binaries bundled as npm deps (no system install needed).
const ffmpegPath: string = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath: string = require("@ffprobe-installer/ffprobe").path;

// Fonts bundled with the deploy (functions/fonts). libass exits 0 and draws
// NOTHING when it can't find a usable font, so subtitle burns must never
// depend on the runtime image shipping fonts. __dirname is functions/lib at
// runtime (compiled output), so the fonts dir is one level up.
const fontsDir = path.join(__dirname, "..", "fonts");
const ASS_FONT = "Liberation Sans";

interface DGWord {
  word: string;
  start: number;
  end: number;
  punctuated_word?: string;
}

type CaptionStyle = "bold" | "classic" | "minimal";

const STYLE_PRESETS: Record<CaptionStyle, { fontFactor: number; outline: number; uppercase: boolean; marginFactor: number }> = {
  bold: { fontFactor: 0.075, outline: 3, uppercase: true, marginFactor: 0.14 },
  classic: { fontFactor: 0.06, outline: 2.2, uppercase: false, marginFactor: 0.12 },
  minimal: { fontFactor: 0.05, outline: 1.6, uppercase: false, marginFactor: 0.10 },
};

function run(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(bin)} exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

function assTime(t: number): string {
  const cs = Math.round(t * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${h}:${p2(m)}:${p2(s)}.${p2(c)}`;
}

// Group words into short caption chunks (the punchy short-form look).
function chunkWords(words: DGWord[]): { start: number; end: number; text: string }[] {
  const chunks: { start: number; end: number; text: string }[] = [];
  let cur: DGWord[] = [];
  const flush = () => {
    if (cur.length === 0) return;
    chunks.push({
      start: cur[0].start,
      end: cur[cur.length - 1].end,
      text: cur.map((w) => w.punctuated_word ?? w.word).join(" "),
    });
    cur = [];
  };
  for (const w of words) {
    if (cur.length > 0) {
      const gap = w.start - cur[cur.length - 1].end;
      const dur = w.end - cur[0].start;
      if (cur.length >= 4 || dur > 2.2 || gap > 0.6) flush();
    }
    cur.push(w);
  }
  flush();
  return chunks;
}

function buildAss(words: DGWord[], width: number, height: number, style: CaptionStyle): string {
  const preset = STYLE_PRESETS[style];
  const fontSize = Math.round(height * preset.fontFactor);
  const marginV = Math.round(height * preset.marginFactor);
  const chunks = chunkWords(words);

  const events = chunks
    .map((c) => {
      let text = c.text.replace(/[{}]/g, "").replace(/\\/g, "");
      if (preset.uppercase) text = text.toUpperCase();
      return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${text}`;
    })
    .join("\n");

  // ASS colours are &HAABBGGRR. White text, black outline.
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${ASS_FONT},${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,${preset.outline},1,2,60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;
}

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download source video (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
}

export const captionVideo = onRequest(
  {
    cors: true,
    timeoutSeconds: 540,
    memory: "2GiB",
    // ffmpeg is CPU-bound: 2 vCPUs roughly halve the encode, and one render
    // per instance keeps parallel renders from starving each other.
    cpu: 2,
    concurrency: 1,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const deepgramKey = (await resolveUserKeys(req)).deepgram;
    if (!deepgramKey) {
      res.status(500).json({ error: "No Deepgram API key — add yours in Settings (or set the server key)." });
      return;
    }

    const { mediaUrl, style: rawStyle } = (req.body ?? {}) as { mediaUrl?: string; style?: string };
    if (!mediaUrl || !/^https?:\/\//.test(mediaUrl)) {
      res.status(400).json({ error: "A valid video URL is required (upload the video first)." });
      return;
    }
    const style: CaptionStyle = (["bold", "classic", "minimal"].includes(rawStyle ?? "") ? rawStyle : "bold") as CaptionStyle;

    const work = path.join(os.tmpdir(), randomUUID());
    const inputPath = `${work}-in.mp4`;
    const assPath = `${work}-subs.ass`;
    const outputPath = `${work}-out.mp4`;

    try {
      // 1) Transcribe with word-level timestamps.
      const dgRes = await fetch(
        "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true",
        {
          method: "POST",
          headers: { Authorization: `Token ${deepgramKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url: mediaUrl }),
        }
      );
      const dg = (await dgRes.json().catch(() => ({}))) as {
        results?: { channels?: { alternatives?: { words?: DGWord[] }[] }[] };
        err_msg?: string;
      };
      if (!dgRes.ok) {
        res.status(502).json({ error: `Transcription failed: ${dg.err_msg ?? dgRes.status}` });
        return;
      }
      const words = dg.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];
      if (words.length === 0) {
        res.status(422).json({ error: "No speech was detected in this video, so there's nothing to caption." });
        return;
      }

      // 2) Download source + probe dimensions + build subtitles.
      await downloadTo(mediaUrl, inputPath);
      const meta = await probeMeta(inputPath);
      if (meta.undecodableAudioOnly) {
        res.status(422).json({ error: UNDECODABLE_AUDIO_ERROR });
        return;
      }
      const { width, height } = meta;
      await fs.writeFile(assPath, buildAss(words, width, height, style));

      // 3) Burn captions in.
      await run(ffmpegPath, [
        "-y",
        "-i", inputPath,
        ...mapArgs(meta),
        "-vf", `subtitles=${assPath}:fontsdir=${fontsDir}`,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        outputPath,
      ]);

      // 4) Upload the captioned video back to Storage with a public token.
      const bucket = getStorage().bucket();
      const token = randomUUID();
      const objectPath = `captioned/${Date.now()}-${randomUUID()}.mp4`;
      await bucket.upload(outputPath, {
        destination: objectPath,
        resumable: false,
        metadata: { contentType: "video/mp4", metadata: { firebaseStorageDownloadTokens: token } },
      });
      const videoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
        objectPath
      )}?alt=media&token=${token}`;

      res.json({ status: "ok", videoUrl, wordCount: words.length });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Caption render failed." });
    } finally {
      await Promise.all(
        [inputPath, assPath, outputPath].map((f) => fs.unlink(f).catch(() => undefined))
      );
    }
  }
);

// ---------------------------------------------------------------------------
// Overlay render — burns the editor's on-screen text + word-synced captions
// into the video with ffmpeg, so a published post carries the branded text on
// the video pixels (not just as caption/description text).
//
// The client sends the same serializable overlay spec the in-browser editor
// uses (texts[] + captions{} + optional clip{}); we translate it to an ASS
// subtitle file and burn it in. Positions/sizes in the spec are video-relative
// fractions, matching the canvas preview.
// ---------------------------------------------------------------------------

interface SpecText {
  text?: string; x?: number; y?: number; size?: number;
  color?: string; weight?: number;
  outline?: { color?: string; width?: number } | null;
  start?: number; end?: number | null;
}
interface SpecCaptionLine { text?: string; start?: number; end?: number }
interface SpecCaptions {
  enabled?: boolean; size?: number; y?: number; lines?: SpecCaptionLine[];
}
interface OverlaySpec {
  texts?: SpecText[];
  captions?: SpecCaptions;
  clip?: { start?: number; end?: number } | null;
}

// #RRGGBB -> ASS &H00BBGGRR (opaque). Falls back to white.
function assColor(hex?: string): string {
  const h = (hex ?? "").replace("#", "");
  if (h.length < 6) return "&H00FFFFFF";
  return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
}

function assEsc(s: string): string {
  return String(s).replace(/\\/g, "").replace(/[{}]/g, "").replace(/\r?\n/g, "\\N");
}

// Greedy word-wrap to a target line width (in characters), honoring explicit
// newlines. Mirrors the editor's canvas wrapping so long on-screen text doesn't
// run off the frame. Returns lines joined with the ASS newline (\N).
function wrapAss(text: string, maxChars: number): string {
  const lines: string[] = [];
  for (const para of String(text).split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) { lines.push(""); continue; }
    let line = "";
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (line && cand.length > maxChars) { lines.push(line); line = w; } else { line = cand; }
    }
    if (line) lines.push(line);
  }
  return assEsc(lines.join("\n"));
}

// Returns the ASS document plus how many burn events it produced (0 = nothing
// to render, caller can skip ffmpeg and post the original).
function buildOverlayAss(
  spec: OverlaySpec, width: number, height: number, duration: number, clipStart: number
): { ass: string; count: number } {
  const events: string[] = [];

  for (const el of spec.texts ?? []) {
    if (!el.text || !el.text.trim()) continue;
    const start = Math.max(0, (el.start ?? 0) - clipStart);
    const end = Math.max(start, (el.end == null ? duration : el.end) - clipStart);
    const fs = Math.max(8, Math.round((el.size ?? 0.05) * height));
    const cx = Math.round((el.x ?? 0.5) * width);
    const cy = Math.round((el.y ?? 0.5) * height);
    const bord = el.outline === null ? 0 : Math.max(1, Math.round((el.outline?.width ?? 0.12) * fs));
    const bold = (el.weight ?? 400) >= 600 ? 1 : 0;
    const tags = `\\an5\\pos(${cx},${cy})\\fs${fs}\\c${assColor(el.color ?? "#FFFFFF")}` +
      `\\3c${assColor(el.outline?.color ?? "#000000")}\\bord${bord}\\shad0\\b${bold}`;
    // Wrap to ~90% of frame width. 0.62·fontsize approximates the average
    // glyph advance for bold ALL-CAPS hooks (lowercase averages ~0.52); with
    // WrapStyle 0, libass re-wraps with real glyph metrics if a line is still
    // too wide for the frame.
    const maxChars = Math.max(6, Math.floor((0.9 * width) / (fs * 0.62)));
    events.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Txt,,0,0,0,,{${tags}}${wrapAss(el.text, maxChars)}`);
  }

  const caps = spec.captions;
  if (caps?.enabled && Array.isArray(caps.lines)) {
    const fs = Math.max(8, Math.round((caps.size ?? 0.042) * height));
    const cx = Math.round(width / 2);
    const cy = Math.round((caps.y ?? 0.72) * height);
    const bord = Math.max(2, Math.round(fs * 0.16));
    for (const line of caps.lines) {
      const text = String(line.text ?? "").toUpperCase();
      if (!text.trim()) continue;
      const start = Math.max(0, (line.start ?? 0) - clipStart);
      const end = Math.max(start, (line.end ?? start) - clipStart);
      const tags = `\\an5\\pos(${cx},${cy})\\fs${fs}\\c&H00FFFFFF&\\3c&H00000000&\\bord${bord}\\shad0\\b1`;
      const maxChars = Math.max(6, Math.floor((0.9 * width) / (fs * 0.62)));
      events.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Cap,,0,0,0,,{${tags}}${wrapAss(text, maxChars)}`);
    }
  }

  const styleLine = (name: string) =>
    `Style: ${name},${ASS_FONT},48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,3,0,5,40,40,40,1`;
  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styleLine("Txt")}
${styleLine("Cap")}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;
  return { ass, count: events.length };
}

interface ProbeStream {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  tags?: { rotate?: string };
  side_data_list?: { rotation?: number }[];
}

// Audio codecs the bundled ffmpeg can decode. Newer iPhones add a Spatial
// Audio track (Apple's APAC codec) plus mebx metadata streams; ffmpeg's
// default stream selection can pick the undecodable track and the whole
// render dies with "Decoder (codec none) not found". Streams are therefore
// mapped explicitly, and only audio from this list is eligible.
const DECODABLE_AUDIO = new Set([
  "aac", "mp3", "mp2", "alac", "opus", "vorbis", "flac", "ac3", "eac3",
  "amr_nb", "amr_wb", "wmav2", "pcm_s16le", "pcm_s16be", "pcm_s24le",
  "pcm_f32le", "pcm_u8", "pcm_mulaw", "pcm_alaw",
]);

// Phone videos are stored sideways (e.g. 1920x1080) with a 90°/270° rotation
// flag; ffmpeg autorotates the frames before the subtitles filter runs, so
// the burn canvas is the DISPLAY orientation. Using the stored dimensions
// builds the overlay for a landscape frame that gets drawn on a portrait one —
// centered text bleeds off both edges. Swap when the rotation is sideways.
function displayDimensions(v: ProbeStream): { width: number; height: number } | null {
  if (!v.width || !v.height) return null;
  const side = (v.side_data_list ?? []).find((s) => typeof s.rotation === "number");
  const raw = side?.rotation ?? Number(v.tags?.rotate ?? 0);
  const rot = ((Math.round((Number.isFinite(raw) ? raw : 0) / 90) * 90) % 360 + 360) % 360;
  return rot === 90 || rot === 270
    ? { width: v.height, height: v.width }
    : { width: v.width, height: v.height };
}

interface ProbedMedia {
  width: number;
  height: number;
  duration: number;
  videoIndex: number | null; // null = probe failed; let ffmpeg's defaults run
  audioIndex: number | null; // null = no eligible audio track
  undecodableAudioOnly: boolean; // audio exists but none of it is decodable
}

async function probeMeta(file: string): Promise<ProbedMedia> {
  try {
    const { stdout } = await run(ffprobePath, [
      "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", file,
    ]);
    const data = JSON.parse(stdout) as {
      streams?: ProbeStream[];
      format?: { duration?: string };
    };
    const streams = data.streams ?? [];
    const v = streams.find((s) => s.codec_type === "video");
    const duration = Number(data.format?.duration ?? v?.duration ?? 0) || 0;
    const dims = v && displayDimensions(v);
    if (dims && typeof v.index === "number") {
      const audio = streams.filter((s) => s.codec_type === "audio");
      const decodable = audio.find(
        (s) => typeof s.index === "number" && DECODABLE_AUDIO.has((s.codec_name ?? "").toLowerCase())
      );
      return {
        ...dims,
        duration,
        videoIndex: v.index,
        audioIndex: decodable?.index ?? null,
        undecodableAudioOnly: audio.length > 0 && !decodable,
      };
    }
  } catch {
    /* fall through */
  }
  return { width: 1080, height: 1920, duration: 0, videoIndex: null, audioIndex: null, undecodableAudioOnly: false };
}

// -map arguments for the probed streams: just the video and one decodable
// audio track, skipping Apple's Spatial Audio / mebx metadata streams that
// default selection would otherwise drag in (and die on). An empty result
// (failed probe) leaves ffmpeg's default selection in place.
function mapArgs(meta: ProbedMedia): string[] {
  if (meta.videoIndex == null) return [];
  return meta.audioIndex != null
    ? ["-map", `0:${meta.videoIndex}`, "-map", `0:${meta.audioIndex}`]
    : ["-map", `0:${meta.videoIndex}`, "-an"];
}

const UNDECODABLE_AUDIO_ERROR =
  "This video's audio track uses a codec the renderer can't read (usually iPhone Spatial Audio). " +
  "Turn off Spatial Audio in Settings → Camera → Record Sound and re-record, or trim the video by a " +
  "second in the Photos app (which re-exports it with standard audio) and upload that copy.";

export const renderOverlays = onRequest(
  {
    cors: true,
    timeoutSeconds: 540,
    memory: "2GiB",
    // ffmpeg is CPU-bound: 2 vCPUs roughly halve the encode, and one render
    // per instance keeps parallel renders from starving each other.
    cpu: 2,
    concurrency: 1,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { videoUrl, spec, jobId } = (req.body ?? {}) as { videoUrl?: string; spec?: OverlaySpec; jobId?: string };
    if (!videoUrl || !/^https?:\/\//.test(videoUrl)) {
      res.status(400).json({ error: "A valid video URL is required." });
      return;
    }
    // A client-supplied job id fixes the output path (rendered/<jobId>.mp4) so
    // the browser can poll Storage for the result — hosting caps this response
    // at 60s, but the render keeps running and lands at a known location.
    const safeJobId = typeof jobId === "string" && /^[A-Za-z0-9-]{8,64}$/.test(jobId) ? jobId : null;

    try {
      const out = await performOverlayRender(videoUrl, spec ?? null, safeJobId);
      res.json({ status: "ok", ...out });
    } catch (e) {
      const code = e instanceof JobError ? e.code : 500;
      res.status(code).json({ error: e instanceof Error ? e.message : "Overlay render failed." });
    }
  }
);

// The burn-in itself, shared by the renderOverlays endpoint (legacy clients)
// and the background publish worker. rendered:false means the spec had
// nothing to draw, so the original URL is handed back. Throws JobError on
// anything that should stop the publish.
async function performOverlayRender(
  videoUrl: string, spec: OverlaySpec | null, outputName: string | null
): Promise<{ videoUrl: string; rendered: boolean }> {
  const hasText = (spec?.texts ?? []).some((t) => t.text && t.text.trim());
  const hasCaptions = Boolean(spec?.captions?.enabled && (spec?.captions?.lines ?? []).length);
  if (!spec || (!hasText && !hasCaptions)) return { videoUrl, rendered: false };

  const work = path.join(os.tmpdir(), randomUUID());
  const inputPath = `${work}-in.mp4`;
  const assPath = `${work}-ov.ass`;
  const outputPath = `${work}-out.mp4`;

  try {
    await downloadTo(videoUrl, inputPath);
    const meta = await probeMeta(inputPath);
    const { width, height, duration } = meta;
    if (meta.undecodableAudioOnly) throw new JobError(422, UNDECODABLE_AUDIO_ERROR);

    const clip = spec.clip && Number.isFinite(Number(spec.clip.start)) ? spec.clip : null;
    const clipStart = clip ? Number(clip.start) : 0;
    const clipDur = clip ? Math.max(0, Number(clip.end) - clipStart) : 0;

    const { ass, count } = buildOverlayAss(spec, width, height, duration || 3600, clipStart);
    if (count === 0) return { videoUrl, rendered: false };
    await fs.writeFile(assPath, ass);

    const args = ["-y"];
    if (clip && clipDur > 0) args.push("-ss", String(clipStart), "-t", String(clipDur));
    args.push(
      "-i", inputPath,
      ...mapArgs(meta),
      "-vf", `subtitles=${assPath}:fontsdir=${fontsDir}`,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outputPath,
    );
    await run(ffmpegPath, args);

    const bucket = getStorage().bucket();
    const token = randomUUID();
    const objectPath = outputName ? `rendered/${outputName}.mp4` : `rendered/${Date.now()}-${randomUUID()}.mp4`;
    await bucket.upload(outputPath, {
      destination: objectPath,
      resumable: false,
      metadata: { contentType: "video/mp4", metadata: { firebaseStorageDownloadTokens: token } },
    });
    const outUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
      objectPath
    )}?alt=media&token=${token}`;

    return { videoUrl: outUrl, rendered: true };
  } finally {
    await Promise.all(
      [inputPath, assPath, outputPath].map((f) => fs.unlink(f).catch(() => undefined))
    );
  }
}

// ---------------------------------------------------------------------------
// Background publish worker — the server-side pipeline. The app uploads the
// media to Storage, writes a publishJobs/{jobId} doc, and is DONE: this
// worker picks the doc up, burns in overlays if requested, publishes via
// Zernio, and records every state change on the doc. The app (any session,
// any time) just watches the doc — closing the tab no longer kills a post.
// ---------------------------------------------------------------------------

interface PublishJobDoc {
  status?: string;
  mediaUrl?: string;
  post?: string;
  title?: string;
  platforms?: string[];
  scheduleDate?: string | null;
  mediaType?: string;
  burnIn?: boolean;
  spec?: OverlaySpec | null;
  // The publisher's uid — the worker looks up their Zernio key from
  // userConfig/{ownerUid}. The key itself is never stored on the job doc.
  ownerUid?: string;
}

export const publishJobWorker = onDocumentCreated(
  {
    document: "publishJobs/{jobId}",
    timeoutSeconds: 540,
    memory: "2GiB",
    cpu: 2,
    concurrency: 1,
    retry: false,
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const job = snap.data() as PublishJobDoc;
    // Eventarc delivers at-least-once — a redelivered event for a job that
    // already started must not publish twice.
    if (job.status && job.status !== "queued") return;

    const patch = (p: Record<string, unknown>) =>
      snap.ref.set({ ...p, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    try {
      let mediaUrl = String(job.mediaUrl ?? "");
      if (!/^https?:\/\//.test(mediaUrl)) throw new JobError(400, "Job has no valid media URL.");

      if (job.burnIn && job.spec && job.mediaType !== "photo") {
        await patch({ status: "rendering" });
        const r = await performOverlayRender(mediaUrl, job.spec, event.params.jobId);
        // Burn-in was requested: a no-op render means the text would be
        // missing from the published video — stop rather than post bare.
        if (!r.rendered) throw new JobError(422, "The render produced no burned-in text — nothing was posted.");
        mediaUrl = r.videoUrl;
      }

      await patch({ status: "publishing", finalMediaUrl: mediaUrl });
      const keys = await resolveUserKeysByUid(job.ownerUid);
      const out = await performZernioPublish({
        mediaUrl,
        post: job.post,
        title: job.title,
        platforms: job.platforms,
        scheduleDate: job.scheduleDate ?? undefined,
        mediaType: job.mediaType,
        apiKey: keys.zernio,
        profileId: keys.zernioProfile,
      });

      // Only Firestore-safe scalars go on the doc (the raw Zernio payload can
      // contain nested arrays, which Firestore rejects — and a failed success-
      // write would mislabel a completed publish as failed).
      const az = out.ayrshare as { id?: unknown; postId?: unknown; posts?: { id?: unknown }[] } | null;
      const ayrshareId = az?.id ?? az?.postId ?? az?.posts?.[0]?.id ?? null;
      await patch({
        status: job.scheduleDate ? "scheduled" : "published",
        ayrshareId: ayrshareId != null ? String(ayrshareId) : null,
        skippedPlatforms: out.skipped ?? [],
        completedAt: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      await patch({
        status: "failed",
        error: e instanceof Error ? e.message : "Publish job failed.",
        completedAt: FieldValue.serverTimestamp(),
      }).catch(() => undefined);
    }
  }
);

// ---------------------------------------------------------------------------
// Admin — recent publish activity across all users. Admin-only (verified
// server-side); reads publishJobs via the Admin SDK (bypasses owner-scoped
// rules). Returns lightweight status rows only — never any API keys (those
// live in userConfig, which this does not touch).
// ---------------------------------------------------------------------------
export const adminRecentJobs = onRequest(
  {
    cors: true,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (req, res) => {
    try {
      await requireAdmin(req);
    } catch (e) {
      const code = e instanceof JobError ? e.code : 500;
      res.status(code).json({ error: e instanceof Error ? e.message : "Not authorized." });
      return;
    }
    try {
      const snap = await getFirestore()
        .collection("publishJobs")
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();
      const jobs = snap.docs.map((d) => {
        const j = d.data() as PublishJobDoc & { createdAt?: { toMillis?: () => number }; error?: string };
        return {
          id: d.id,
          ownerUid: j.ownerUid ?? null,
          filename: (j as { filename?: string }).filename ?? "",
          status: j.status ?? "queued",
          platforms: Array.isArray(j.platforms) ? j.platforms : [],
          error: j.error ?? null,
          createdAt: j.createdAt?.toMillis ? j.createdAt.toMillis() : null,
        };
      });
      res.json({ jobs });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load activity." });
    }
  }
);

// ---------------------------------------------------------------------------
// Transcription — returns the spoken text of a video (Deepgram). Used by the
// Composer flow so Claude grades the actual content, not just still frames.
// Best-effort: returns an empty transcript (not an error) when unconfigured,
// so generation can gracefully fall back to frame-only analysis.
// ---------------------------------------------------------------------------
export const transcribeAudio = onRequest(
  {
    cors: true,
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const deepgramKey = (await resolveUserKeys(req)).deepgram;
    if (!deepgramKey) {
      res.status(200).json({ transcript: "", words: [], configured: false });
      return;
    }

    const { mediaUrl } = (req.body ?? {}) as { mediaUrl?: string };
    if (!mediaUrl || !/^https?:\/\//.test(mediaUrl)) {
      res.status(400).json({ error: "A valid video URL is required." });
      return;
    }

    try {
      const dgRes = await fetch(
        "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true",
        {
          method: "POST",
          headers: { Authorization: `Token ${deepgramKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url: mediaUrl }),
        }
      );
      const dg = (await dgRes.json().catch(() => ({}))) as {
        results?: { channels?: { alternatives?: { transcript?: string; words?: DGWord[] }[] }[] };
        err_msg?: string;
      };
      if (!dgRes.ok) {
        res.status(502).json({ error: `Transcription failed: ${dg.err_msg ?? dgRes.status}` });
        return;
      }
      const alt = dg.results?.channels?.[0]?.alternatives?.[0];
      const transcript = alt?.transcript ?? "";
      // word-level timings power the synced-caption editor in the browser
      const words = (alt?.words ?? [])
        .filter((w) => typeof w.start === "number" && typeof w.end === "number")
        .map((w) => ({ w: w.punctuated_word ?? w.word, s: w.start, e: w.end }));
      res.json({ transcript, words, configured: true });
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : "Transcription failed." });
    }
  }
);

// ---------------------------------------------------------------------------
// Clip selection — turns ONE long video into several short, ranked clips.
// Given the word-timed transcript, Claude picks the strongest self-contained
// moments (start/end + title + hook score + brand-voice caption/hashtags).
// Best-effort: when ANTHROPIC_API_KEY is unset OR the model call fails, it
// falls back to a deterministic even-split so the Clips flow always works.
// ---------------------------------------------------------------------------

interface TWord { w: string; s: number; e: number }
interface Clip {
  startSec: number;
  endSec: number;
  title: string;
  hookScore: number;
  reason: string;
  onScreenText: string;
  caption: string;
  hashtags: string;
}

// Group words into timestamped sentence-ish segments for the selection prompt.
function segmentsForPrompt(words: TWord[]): { start: number; end: number; text: string }[] {
  const segs: { start: number; end: number; text: string }[] = [];
  let cur: TWord[] = [];
  const flush = () => {
    if (!cur.length) return;
    segs.push({ start: cur[0].s, end: cur[cur.length - 1].e, text: cur.map((w) => w.w).join(" ") });
    cur = [];
  };
  for (const w of words) {
    cur.push(w);
    const dur = w.e - cur[0].s;
    if (/[.!?]$/.test(w.w) || cur.length >= 40 || dur > 14) flush();
  }
  flush();
  return segs;
}

// Deterministic fallback: evenly-spaced, boundary-snapped windows.
function fallbackClips(words: TWord[], clipCount: number, minSec: number, maxSec: number): Clip[] {
  if (!words.length) return [];
  const total = words[words.length - 1].e;
  const target = Math.min(maxSec, Math.max(minSec, (minSec + maxSec) / 2));
  const n = Math.max(1, Math.min(clipCount, Math.floor(total / target) || 1));
  const clips: Clip[] = [];
  for (let i = 0; i < n; i++) {
    const center = (total * (i + 0.5)) / n;
    const start = Math.max(0, center - target / 2);
    const end = Math.min(total, start + target);
    const win = words.filter((w) => w.s >= start && w.e <= end);
    const snapStart = win[0]?.s ?? start;
    const snapEnd = win[win.length - 1]?.e ?? end;
    const text = win.slice(0, 12).map((w) => w.w).join(" ");
    const title = (text.replace(/[.!?,]+$/, "").slice(0, 60) || `Clip ${i + 1}`).replace(/^\w/, (c) => c.toUpperCase());
    clips.push({
      startSec: Math.round(snapStart * 100) / 100,
      endSec: Math.round(snapEnd * 100) / 100,
      title,
      hookScore: 5,
      reason: "Auto-selected by even split (AI selection unavailable).",
      onScreenText: title.toUpperCase().split(" ").slice(0, 6).join(" "),
      caption: `${title} #1PNation`,
      hashtags: "#mindset #discipline #accountability #entrepreneur #motivation #1percent #fyp",
    });
  }
  return clips;
}

const CLIP_SYSTEM_PROMPT = `You are a short-form video clip producer for The One Percent Nation (creator Anthony Brown — self-help/leadership, direct second-person hooks, truth bombs, confronting excuses). You are given a long video's transcript with per-segment timestamps. Select the strongest self-contained CLIPS for TikTok/Reels/Shorts.

Rules:
- Each clip must start and end at the given segment boundaries (use the timestamps), be self-contained, and open with a strong hook.
- Respect the requested clip count and the min/max length window; clips must NOT overlap.
- Rank by viral potential.

Return ONLY valid JSON, no markdown/backticks, shaped exactly:
{ "clips": [ {
  "startSec": number, "endSec": number,
  "title": string (max 70 chars),
  "hookScore": number (1-10),
  "reason": string (one sentence: why it works + one improvement tip),
  "onScreenText": string (bold stop-scroll overlay, max 8 words, ALL CAPS),
  "caption": string (full TikTok caption, 150-300 chars, soft CTA),
  "hashtags": string (12-15 space-separated hashtags)
} ] }`;

function normalizeClips(raw: unknown, words: TWord[], clipCount: number): Clip[] {
  const total = words.length ? words[words.length - 1].e : 0;
  const arr = Array.isArray((raw as { clips?: unknown[] })?.clips) ? (raw as { clips: Record<string, unknown>[] }).clips : [];
  const clips = arr
    .map((c): Clip | null => {
      const startSec = Number(c.startSec);
      const endSec = Number(c.endSec);
      if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) return null;
      return {
        startSec: Math.max(0, startSec),
        endSec: Math.min(total || endSec, endSec),
        title: String(c.title ?? "Clip").slice(0, 70),
        hookScore: typeof c.hookScore === "number" ? Math.max(1, Math.min(10, c.hookScore)) : 5,
        reason: String(c.reason ?? ""),
        onScreenText: String(c.onScreenText ?? c.title ?? "").slice(0, 60),
        caption: String(c.caption ?? ""),
        hashtags: String(c.hashtags ?? ""),
      };
    })
    .filter((c): c is Clip => c !== null)
    .sort((a, b) => b.hookScore - a.hookScore)
    .slice(0, clipCount);
  return clips;
}

export const selectClips = onRequest(
  {
    cors: true,
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { words: rawWords, clipCount: rawCount, minSec: rawMin, maxSec: rawMax, filename } =
      (req.body ?? {}) as {
        words?: TWord[];
        clipCount?: number;
        minSec?: number;
        maxSec?: number;
        filename?: string;
      };

    const words = (Array.isArray(rawWords) ? rawWords : []).filter(
      (w) => w && typeof w.s === "number" && typeof w.e === "number" && typeof w.w === "string"
    );
    const clipCount = Math.max(1, Math.min(10, Math.round(rawCount ?? 5)));
    const minSec = Math.max(5, rawMin ?? 15);
    const maxSec = Math.max(minSec + 5, rawMax ?? 60);

    const apiKey = (await resolveUserKeys(req)).anthropic;

    if (words.length === 0) {
      // Nothing to clip without speech timings.
      res.status(200).json({ clips: [], configured: !!apiKey, reason: "no-speech" });
      return;
    }

    if (!apiKey) {
      res.status(200).json({ clips: fallbackClips(words, clipCount, minSec, maxSec), configured: false });
      return;
    }

    try {
      const segs = segmentsForPrompt(words);
      const segLines = segs.map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`).join("\n");
      const total = words[words.length - 1].e;
      const userText = `Video: "${filename ?? "video"}" (${total.toFixed(0)}s). Produce ${clipCount} clips, each ${minSec}-${maxSec}s.\n\nTranscript segments:\n${segLines}`;

      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 3000,
          system: CLIP_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userText }],
        }),
      });

      if (!anthropicRes.ok) {
        res.status(200).json({ clips: fallbackClips(words, clipCount, minSec, maxSec), configured: true, degraded: true });
        return;
      }
      const data = (await anthropicRes.json()) as { content?: { text?: string }[] };
      const text = data.content?.[0]?.text ?? "";
      const match = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : text);
      const clips = normalizeClips(parsed, words, clipCount);
      res.json({ clips: clips.length ? clips : fallbackClips(words, clipCount, minSec, maxSec), configured: true });
    } catch {
      res.status(200).json({ clips: fallbackClips(words, clipCount, minSec, maxSec), configured: true, degraded: true });
    }
  }
);
