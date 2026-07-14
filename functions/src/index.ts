import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { onRequest } from "firebase-functions/v2/https";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { Readable } from "stream";

initializeApp();

// ---------------------------------------------------------------------------
// Media proxy — streams a Firebase Storage download URL back through this same
// origin so the browser editor can read/export it without a bucket CORS policy.
// Restricted to this project's Storage URLs to avoid being an open proxy.
// ---------------------------------------------------------------------------
export const mediaProxy = onRequest(
  { cors: true, timeoutSeconds: 300, memory: "512MiB" },
  async (req, res) => {
    const url = (req.query.url as string) || "";
    if (!/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\//.test(url)) {
      res.status(400).send("Only this project's Storage URLs are allowed.");
      return;
    }
    try {
      const upstream = await fetch(url);
      if (!upstream.ok || !upstream.body) {
        res.status(upstream.status || 502).send("Could not fetch media.");
        return;
      }
      res.set("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Cache-Control", "private, max-age=600");
      const len = upstream.headers.get("content-length");
      if (len) res.set("Content-Length", len);
      // stream the body through (no full-buffer, so large videos are fine)
      Readable.fromWeb(upstream.body as unknown as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
    } catch (e) {
      res.status(502).send("Proxy error.");
    }
  }
);

const SYSTEM_PROMPT = `You are a TikTok content strategist for The One Percent Nation, a self-help and leadership coaching brand. The creator is Anthony Brown, a Black male leader, real estate broker turned full-time entrepreneur, faith-adjacent, direct communicator, Oklahoma-based. His content pillars are: limiting beliefs, self-accountability, identity and mindset, leadership and purpose. His hook style: second-person identity challenges, truth bombs, direct confrontation of excuses.

When a transcript is provided, use it as the primary source for all fields. When only frames are available, infer from visuals.

Return ONLY valid JSON with no markdown, no backticks, no preamble. Fields:
- best_title (string): the single strongest video title — optimized for search and click-through, max 70 chars
- on_screen_text (string): bold text overlay shown visually in the video — stop-scroll hook, max 8 words, all caps, punchy
- niche (string): specific content niche, 2-4 words (e.g. "Entrepreneur Mindset", "Real Estate Motivation", "Self-Discipline")
- thumbnail_text (string): text to print on the video thumbnail — max 6 words, high contrast, creates curiosity or urgency
- video_description (string): full video description — 200-400 chars, opens with a hook, body adds context, ends with soft CTA
- headline (string): punchy, all-caps title optimized for TikTok search — max 60 chars
- seo_opener (string): first 3 seconds of spoken text or on-screen text that stops the scroll
- caption (string): full TikTok caption including opening line, body, and soft CTA — 150-300 chars
- hashtags (string): 12-15 hashtags, mix of niche, broad, and trending — space-separated
- content_pillar (string): one of "Self-Sabotage & Limiting Beliefs", "Accountability & Execution", "Identity & Mindset Shift", "Leadership & Purpose"
- hook_score (number 1-10): how strong the opening hook is
- hook_score_reason (string): one sentence explaining the score and one concrete tip to improve it
- titles (array of 3 strings): alternate video title options, each a different angle
- transcript_summary (string): 1-2 sentence summary of what the video is about (derive from transcript if provided, otherwise from frames)`;

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

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Server configuration error: ANTHROPIC_API_KEY is not set" });
      return;
    }

    const { frames, transcript, filename } = req.body as {
      frames?: { hookFrame?: Frame; midFrame?: Frame; endFrame?: Frame };
      transcript?: string;
      filename?: string;
    };

    const contentBlocks: object[] = [
      ...imageBlock(frames?.hookFrame, "[HOOK FRAME — opening shot]"),
      ...imageBlock(frames?.midFrame, "[MID FRAME — ~45% through video]"),
      ...imageBlock(frames?.endFrame, "[END FRAME — ~85% through video]"),
    ];

    const transcriptSection = transcript?.trim()
      ? `\n\nVIDEO TRANSCRIPT:\n"""\n${transcript.trim()}\n"""\n`
      : "";

    contentBlocks.push({
      type: "text",
      text: `Video filename: "${filename ?? "unknown"}"${transcriptSection}\n\nGenerate the full content strategy JSON as instructed.`,
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
        system: SYSTEM_PROMPT,
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
// Social publishing via Zernio
//
// Zernio (formerly Late / getlate.dev) is a single API that fans a post out to
// every connected social account (TikTok, Instagram Reels, YouTube Shorts,
// Facebook, X, LinkedIn). You connect each platform once in the Zernio
// dashboard; this function only needs the Zernio API key (Secret Manager
// secret ZERNIO_API_KEY, bound below).
//
// Zernio replaces Ayrshare specifically because it supports video on every
// plan — Ayrshare gated video behind "Premium or Business Plan", which is the
// error this fixes. The first two connected accounts are free.
//
// Flow: the browser uploads the video DIRECTLY to Firebase Storage (no size
// cap from this function) and POSTs the resulting download URL + caption +
// selected platforms here as JSON. We look up the caller's connected Zernio
// accounts to resolve an accountId per platform, then create one post that
// Zernio publishes to every selected platform. No per-platform OAuth or app
// review is needed on our side.
// ---------------------------------------------------------------------------

const ZERNIO_BASE = "https://zernio.com/api/v1";

// App platform id -> Zernio platform name. Note: X is "twitter" in Zernio.
const TO_ZERNIO: Record<string, string> = {
  tiktok: "tiktok",
  instagram: "instagram",
  youtube: "youtube",
  facebook: "facebook",
  x: "twitter",
  twitter: "twitter",
  linkedin: "linkedin",
};

// Map Zernio platform names back to our app's ids (twitter -> x).
const FROM_ZERNIO: Record<string, string> = {
  tiktok: "tiktok",
  instagram: "instagram",
  youtube: "youtube",
  facebook: "facebook",
  twitter: "x",
  linkedin: "linkedin",
};

interface ZernioAccount {
  _id?: string;
  accountId?: string;
  id?: string;
  platform?: string;
  username?: string;
  name?: string;
}

// Fetch the connected Zernio accounts. Returns [] on any non-OK response.
async function fetchZernioAccounts(apiKey: string): Promise<ZernioAccount[]> {
  const r = await fetch(`${ZERNIO_BASE}/accounts`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = (await r.json().catch(() => ({}))) as
    | { accounts?: ZernioAccount[]; data?: ZernioAccount[] }
    | ZernioAccount[];
  if (!r.ok) {
    const msg = (data as { message?: string; error?: string })?.message ||
      (data as { error?: string })?.error ||
      `Zernio error ${r.status}`;
    throw new Error(msg);
  }
  if (Array.isArray(data)) return data;
  return data.accounts || data.data || [];
}

const accountIdOf = (a: ZernioAccount): string | undefined => a._id || a.accountId || a.id;

interface PublishBody {
  mediaUrl?: string;
  post?: string;
  title?: string;
  platforms?: string[];
  scheduleDate?: string;
}

export const publishPost = onRequest(
  {
    cors: true,
    secrets: ["ZERNIO_API_KEY"],
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "ZERNIO_API_KEY is not configured on the server." });
      return;
    }

    const { mediaUrl, post, title: rawTitle, platforms: rawPlatforms, scheduleDate } = (req.body ?? {}) as PublishBody;

    const requested = Array.from(new Set((rawPlatforms ?? []).map((p) => p.toLowerCase())));
    if (requested.length === 0) {
      res.status(400).json({ error: "Select at least one supported platform to post to." });
      return;
    }
    if (!mediaUrl || !/^https?:\/\//.test(mediaUrl)) {
      res.status(400).json({ error: "A valid video URL is required (upload the video first)." });
      return;
    }

    const postText = (post ?? "").trim();
    if (!postText) {
      res.status(400).json({ error: "Caption text is required to publish." });
      return;
    }

    // Resolve each selected platform to a connected Zernio accountId.
    let accounts: ZernioAccount[];
    try {
      accounts = await fetchZernioAccounts(apiKey);
    } catch (e) {
      res.status(502).json({ error: `Couldn't reach Zernio to load your accounts: ${e instanceof Error ? e.message : "unknown error"}` });
      return;
    }
    const idByPlatform: Record<string, string> = {};
    for (const a of accounts) {
      const id = accountIdOf(a);
      if (a.platform && id) idByPlatform[a.platform] = id;
    }

    const title = (rawTitle ?? postText).slice(0, 99);
    const zPlatforms: Array<Record<string, unknown>> = [];
    const notConnected: string[] = [];

    for (const appId of requested) {
      const platform = TO_ZERNIO[appId];
      if (!platform) continue; // ignore unknown ids
      const accountId = idByPlatform[platform];
      if (!accountId) {
        notConnected.push(appId);
        continue;
      }
      const entry: Record<string, unknown> = { platform, accountId };
      if (platform === "youtube") {
        entry.platformSpecificData = { title, visibility: "public" };
      } else if (platform === "tiktok") {
        entry.platformSpecificData = {
          privacyLevel: "PUBLIC_TO_EVERYONE",
          allowComment: true,
          allowDuet: true,
          allowStitch: true,
          contentPreviewConfirmed: true,
          expressConsentGiven: true,
        };
      }
      // Instagram video posts publish as Reels by default — no extra data needed.
      zPlatforms.push(entry);
    }

    if (zPlatforms.length === 0) {
      const which = notConnected.join(", ");
      res.status(400).json({
        error: which
          ? `These platforms aren't connected in Zernio yet: ${which}. Connect them at zernio.com/dashboard, then try again.`
          : "Select at least one supported platform to post to.",
      });
      return;
    }

    const body: Record<string, unknown> = {
      content: postText,
      platforms: zPlatforms,
      mediaItems: [{ type: "video", url: mediaUrl }],
    };

    // Optional scheduling — Zernio accepts an ISO 8601 timestamp; otherwise publish now.
    if (scheduleDate && !Number.isNaN(Date.parse(scheduleDate))) {
      body.scheduledFor = new Date(scheduleDate).toISOString();
    } else {
      body.publishNow = true;
    }

    // Fan the post out.
    try {
      const zRes = await fetch(`${ZERNIO_BASE}/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      const result = await zRes.json().catch(() => ({}));
      if (!zRes.ok) {
        const r = result as {
          message?: string;
          error?: string;
          errors?: { message?: string; platform?: string }[];
        };
        const detail =
          r.message ||
          r.error ||
          r.errors?.map((e) => `${e.platform ? e.platform + ": " : ""}${e.message}`).join("; ") ||
          `Zernio error ${zRes.status}`;
        res.status(zRes.status).json({ error: detail, details: result });
        return;
      }

      res.json({
        status: "ok",
        mediaUrl,
        zernio: result,
        ...(notConnected.length ? { warning: `Skipped (not connected in Zernio): ${notConnected.join(", ")}` } : {}),
      });
    } catch (e) {
      res.status(502).json({ error: `Failed to reach Zernio: ${e instanceof Error ? e.message : "unknown error"}` });
    }
  }
);

// ---------------------------------------------------------------------------
// Connected-account status — reads which social accounts are linked in Zernio
// so the app can show live connection state. Accounts are linked in the Zernio
// dashboard; this just reports their status.
// ---------------------------------------------------------------------------

export const accountsStatus = onRequest(
  {
    cors: true,
    secrets: ["ZERNIO_API_KEY"],
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (_req, res) => {
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) {
      res.status(200).json({ configured: false, connected: [], displayNames: [] });
      return;
    }

    try {
      const accounts = await fetchZernioAccounts(apiKey);
      const connected = Array.from(
        new Set(
          accounts
            .map((a) => (a.platform ? FROM_ZERNIO[a.platform] ?? a.platform : null))
            .filter((p): p is string => Boolean(p))
        )
      );
      const displayNames = accounts
        .filter((a) => a.platform)
        .map((a) => ({
          platform: FROM_ZERNIO[a.platform as string] ?? a.platform,
          displayName: a.username || a.name || "",
        }));

      res.json({ configured: true, connected, displayNames });
    } catch (e) {
      res.status(200).json({ configured: true, connected: [], displayNames: [], error: e instanceof Error ? e.message : "unknown error" });
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
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,${preset.outline},1,2,60,60,${marginV},1

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

async function probeDimensions(file: string): Promise<{ width: number; height: number }> {
  try {
    const { stdout } = await run(ffprobePath, [
      "-v", "quiet", "-print_format", "json", "-show_streams", file,
    ]);
    const data = JSON.parse(stdout) as { streams?: { codec_type?: string; width?: number; height?: number }[] };
    const v = (data.streams ?? []).find((s) => s.codec_type === "video");
    if (v?.width && v?.height) return { width: v.width, height: v.height };
  } catch {
    /* fall through */
  }
  return { width: 1080, height: 1920 };
}

export const captionVideo = onRequest(
  {
    cors: true,
    secrets: ["DEEPGRAM_API_KEY"],
    timeoutSeconds: 540,
    memory: "2GiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramKey) {
      res.status(500).json({ error: "DEEPGRAM_API_KEY is not configured on the server." });
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
      const { width, height } = await probeDimensions(inputPath);
      await fs.writeFile(assPath, buildAss(words, width, height, style));

      // 3) Burn captions in.
      await run(ffmpegPath, [
        "-y",
        "-i", inputPath,
        "-vf", `subtitles=${assPath}`,
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
// Transcription — returns the spoken text of a video (Deepgram). Used by the
// Composer flow so Claude grades the actual content, not just still frames.
// Best-effort: returns an empty transcript (not an error) when unconfigured,
// so generation can gracefully fall back to frame-only analysis.
// ---------------------------------------------------------------------------
export const transcribeAudio = onRequest(
  {
    cors: true,
    secrets: ["DEEPGRAM_API_KEY"],
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const deepgramKey = process.env.DEEPGRAM_API_KEY;
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
// Higgsfield AI video — generate a clip from a prompt (and optional source
// image) via the Higgsfield Cloud API, or import an existing video by URL.
// Both land the finished video in Firebase Storage so it can be posted through
// the same /api/publish (Zernio) flow.
//
// Auth: HIGGSFIELD_CREDENTIALS is a Secret Manager secret in the form
// "KEY_ID:KEY_SECRET", sent as `Authorization: Key <credentials>`.
//
// Flow is stateless/poll-based to match the rest of this backend (no Firestore,
// no webhooks): /api/generate submits a job and returns a requestId; the
// browser polls /api/video-status until it's completed, at which point the
// output video is copied into Storage and a durable URL is returned.
// ---------------------------------------------------------------------------

const HIGGSFIELD_BASE = "https://platform.higgsfield.ai";
// Image-to-video (DoP) application path; see cloud.higgsfield.ai for the catalog.
const HIGGSFIELD_IMAGE2VIDEO = "/v1/image2video/dop";

// Turn any Higgsfield error payload into a readable string. Their validation
// errors come back as { detail: [{ msg, loc, ... }] } or nested objects, so a
// naive `.detail` renders as "[object Object]".
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hfError(data: any, status: number): string {
  const d = data?.detail ?? data?.message ?? data?.error;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((x: any) => {
        if (x && x.msg) {
          const loc = Array.isArray(x.loc) ? x.loc.filter((l: unknown) => l !== "body").join(".") : "";
          return loc ? `${loc}: ${x.msg}` : x.msg;
        }
        return JSON.stringify(x);
      })
      .join("; ");
  }
  if (d) return JSON.stringify(d);
  return `Higgsfield error ${status}`;
}

// Pull output media URLs out of a Higgsfield status payload, tolerating the
// several shapes the API uses.
function higgsfieldResultUrls(payload: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const push = (v: unknown) => {
    if (!v) return;
    if (typeof v === "string") urls.push(v);
    else if (typeof v === "object" && (v as { url?: string }).url) urls.push((v as { url: string }).url);
  };
  push((payload as { video?: unknown }).video);
  for (const key of ["videos", "images", "results"]) {
    const arr = (payload as Record<string, unknown>)[key];
    if (Array.isArray(arr)) arr.forEach(push);
  }
  const jobs = (payload as { jobs?: unknown }).jobs;
  if (Array.isArray(jobs)) {
    for (const j of jobs) {
      const results = (j as { results?: { raw?: unknown } })?.results;
      if (results) push(results.raw ?? results);
    }
  }
  return urls;
}

// Save a remote video/image into Storage with a public download token.
async function saveToStorage(sourceUrl: string, prefix: string): Promise<{ url: string; contentType: string }> {
  const r = await fetch(sourceUrl);
  if (!r.ok) throw new Error(`Download failed (${r.status})`);
  const contentType = r.headers.get("content-type") || "video/mp4";
  const ext = contentType.includes("image") ? "jpg" : "mp4";
  const buf = Buffer.from(await r.arrayBuffer());
  const bucket = getStorage().bucket();
  const token = randomUUID();
  const objectPath = `${prefix}/${Date.now()}-${randomUUID()}.${ext}`;
  await bucket.file(objectPath).save(buf, {
    resumable: false,
    metadata: { contentType, metadata: { firebaseStorageDownloadTokens: token } },
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
  return { url, contentType };
}

interface GenerateBody {
  prompt?: string;
  imageUrl?: string;
  model?: string;
}

export const generateVideo = onRequest(
  {
    cors: true,
    secrets: ["HIGGSFIELD_CREDENTIALS"],
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const credentials = process.env.HIGGSFIELD_CREDENTIALS;
    if (!credentials) {
      res.status(500).json({ error: "HIGGSFIELD_CREDENTIALS is not configured on the server." });
      return;
    }

    const { prompt, imageUrl, model } = (req.body ?? {}) as GenerateBody;
    if (!prompt?.trim() && !imageUrl?.trim()) {
      res.status(400).json({ error: "A prompt or a source image URL is required." });
      return;
    }

    const modelPath = model || HIGGSFIELD_IMAGE2VIDEO;
    const input = imageUrl?.trim()
      ? {
          model: "dop-turbo",
          prompt: prompt?.trim() || "",
          input_images: [{ type: "image_url", image_url: imageUrl.trim() }],
        }
      : { prompt: prompt?.trim(), aspect_ratio: "9:16" };

    try {
      // Native /v1 API wraps generation params in a "params" object (same as Soul).
      const r = await fetch(`${HIGGSFIELD_BASE}${modelPath}`, {
        method: "POST",
        headers: { Authorization: `Key ${credentials}`, "Content-Type": "application/json" },
        body: JSON.stringify({ params: input }),
      });
      const data = (await r.json().catch(() => ({}))) as { request_id?: string; id?: string; detail?: string; message?: string };
      if (!r.ok) {
        res.status(r.status).json({ error: hfError(data, r.status), details: data });
        return;
      }
      const requestId = data.request_id || data.id;
      if (!requestId) {
        res.status(502).json({ error: "Higgsfield did not return a request id.", details: data });
        return;
      }
      res.json({ status: "ok", requestId });
    } catch (e) {
      res.status(502).json({ error: `Failed to reach Higgsfield: ${e instanceof Error ? e.message : "unknown error"}` });
    }
  }
);

export const videoStatus = onRequest(
  {
    cors: true,
    secrets: ["HIGGSFIELD_CREDENTIALS"],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const credentials = process.env.HIGGSFIELD_CREDENTIALS;
    if (!credentials) {
      res.status(500).json({ error: "HIGGSFIELD_CREDENTIALS is not configured on the server." });
      return;
    }
    const { requestId } = (req.body ?? {}) as { requestId?: string };
    if (!requestId) {
      res.status(400).json({ error: "requestId is required." });
      return;
    }

    try {
      const r = await fetch(`${HIGGSFIELD_BASE}/requests/${requestId}/status`, {
        headers: { Authorization: `Key ${credentials}` },
      });
      const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) {
        res.status(r.status).json({ error: hfError(data, r.status) });
        return;
      }

      const status = (data.status as string) || "in_progress";
      if (status !== "completed") {
        // queued | in_progress | failed | nsfw | canceled
        const pending = status === "queued" || status === "in_progress";
        res.json({ status: pending ? "generating" : status });
        return;
      }

      const urls = higgsfieldResultUrls(data);
      if (!urls.length) {
        res.json({ status: "failed", error: "Completed but no output URL was returned." });
        return;
      }
      const { url, contentType } = await saveToStorage(urls[0], "higgsfield");
      res.json({ status: "ready", videoUrl: url, mediaType: contentType.includes("image") ? "image" : "video" });
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : "Status check failed." });
    }
  }
);

export const importVideo = onRequest(
  {
    cors: true,
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const { url } = (req.body ?? {}) as { url?: string };
    if (!url || !/^https:\/\//.test(url)) {
      res.status(400).json({ error: "A valid https URL is required." });
      return;
    }
    try {
      const { url: storedUrl, contentType } = await saveToStorage(url, "imported");
      if (!/video|image|octet-stream/.test(contentType)) {
        res.status(400).json({ error: `That URL is not a video or image (got ${contentType}).` });
        return;
      }
      res.json({ status: "ok", videoUrl: storedUrl, mediaType: contentType.includes("image") ? "image" : "video" });
    } catch (e) {
      res.status(502).json({ error: `Import failed: ${e instanceof Error ? e.message : "unknown error"}` });
    }
  }
);

// ---------------------------------------------------------------------------
// AI cover backgrounds — Higgsfield Soul (text-to-image, /v1/text2image/soul).
// Same credentials + submit/poll pattern as the video endpoints. Used by the
// Cover Studio to generate a dramatic backdrop from a prompt; the completed
// image is returned as a base64 data URL so the cover canvas can composite and
// export it without CORS tainting.
// ---------------------------------------------------------------------------

// Cover aspect -> nearest Soul size (raw WxH strings the API accepts).
const SOUL_SIZE: Record<string, string> = {
  "9:16": "1152x2048",
  "4:5": "1632x2048",
  "1:1": "1536x1536",
  "16:9": "2048x1152",
};

export const generateCoverImage = onRequest(
  {
    cors: true,
    secrets: ["HIGGSFIELD_CREDENTIALS"],
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const credentials = process.env.HIGGSFIELD_CREDENTIALS;
    if (!credentials) {
      res.status(500).json({ error: "HIGGSFIELD_CREDENTIALS is not configured on the server." });
      return;
    }
    const { prompt, aspect } = (req.body ?? {}) as { prompt?: string; aspect?: string };
    if (!prompt?.trim()) {
      res.status(400).json({ error: "A prompt is required." });
      return;
    }
    // Native /v1 API wraps generation params in a "params" object.
    const params = {
      prompt: prompt.trim(),
      width_and_height: SOUL_SIZE[aspect || "9:16"] || "1152x2048",
      quality: "1080p",
      batch_size: 1,
      enhance_prompt: true,
    };
    try {
      const r = await fetch(`${HIGGSFIELD_BASE}/v1/text2image/soul`, {
        method: "POST",
        headers: { Authorization: `Key ${credentials}`, "Content-Type": "application/json" },
        body: JSON.stringify({ params }),
      });
      const data = (await r.json().catch(() => ({}))) as { request_id?: string; id?: string; detail?: string; message?: string };
      if (!r.ok) {
        res.status(r.status).json({ error: hfError(data, r.status), details: data });
        return;
      }
      const requestId = data.request_id || data.id;
      if (!requestId) {
        res.status(502).json({ error: "Higgsfield did not return a request id.", details: data });
        return;
      }
      res.json({ status: "ok", requestId });
    } catch (e) {
      res.status(502).json({ error: `Failed to reach Higgsfield: ${e instanceof Error ? e.message : "unknown error"}` });
    }
  }
);

export const coverImageStatus = onRequest(
  {
    cors: true,
    secrets: ["HIGGSFIELD_CREDENTIALS"],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const credentials = process.env.HIGGSFIELD_CREDENTIALS;
    if (!credentials) {
      res.status(500).json({ error: "HIGGSFIELD_CREDENTIALS is not configured on the server." });
      return;
    }
    const { requestId } = (req.body ?? {}) as { requestId?: string };
    if (!requestId) {
      res.status(400).json({ error: "requestId is required." });
      return;
    }
    try {
      const r = await fetch(`${HIGGSFIELD_BASE}/requests/${requestId}/status`, {
        headers: { Authorization: `Key ${credentials}` },
      });
      const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) {
        res.status(r.status).json({ error: hfError(data, r.status) });
        return;
      }
      const status = (data.status as string) || "in_progress";
      if (status !== "completed") {
        const pending = status === "queued" || status === "in_progress";
        res.json({ status: pending ? "generating" : status });
        return;
      }
      const urls = higgsfieldResultUrls(data);
      if (!urls.length) {
        res.json({ status: "failed", error: "Completed but no image was returned." });
        return;
      }
      // Return the image inline as a data URL — keeps the cover canvas CORS-clean.
      const imgRes = await fetch(urls[0]);
      if (!imgRes.ok) {
        res.status(502).json({ error: `Could not download the generated image (${imgRes.status}).` });
        return;
      }
      const ct = imgRes.headers.get("content-type") || "image/jpeg";
      const buf = Buffer.from(await imgRes.arrayBuffer());
      res.json({ status: "ready", dataUrl: `data:${ct};base64,${buf.toString("base64")}` });
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : "Status check failed." });
    }
  }
);

// ---------------------------------------------------------------------------
// FREE AI cover backgrounds — Pollinations.ai (no key, no credits). Returns the
// image inline as a base64 data URL, same contract as coverImageStatus's ready
// response, so the Cover Studio can composite + export it.
// ---------------------------------------------------------------------------
const POLLINATIONS_SIZE: Record<string, { w: number; h: number }> = {
  "9:16": { w: 1152, h: 2048 },
  "4:5": { w: 1638, h: 2048 },
  "1:1": { w: 1536, h: 1536 },
  "16:9": { w: 2048, h: 1152 },
};

export const coverImageFree = onRequest(
  { cors: true, timeoutSeconds: 120, memory: "512MiB" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const { prompt, aspect } = (req.body ?? {}) as { prompt?: string; aspect?: string };
    if (!prompt?.trim()) {
      res.status(400).json({ error: "A prompt is required." });
      return;
    }
    const size = POLLINATIONS_SIZE[aspect || "9:16"] || POLLINATIONS_SIZE["9:16"];
    const seed = Math.floor(Math.random() * 1e9);
    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.trim())}` +
      `?width=${size.w}&height=${size.h}&nologo=true&model=flux&seed=${seed}`;
    try {
      const r = await fetch(url);
      if (!r.ok) {
        res.status(502).json({ error: `Free image service error (${r.status}). Try again.` });
        return;
      }
      const ct = r.headers.get("content-type") || "image/jpeg";
      if (!ct.startsWith("image")) {
        res.status(502).json({ error: "Free image service is busy — try again in a moment." });
        return;
      }
      const buf = Buffer.from(await r.arrayBuffer());
      res.json({ status: "ready", dataUrl: `data:${ct};base64,${buf.toString("base64")}` });
    } catch (e) {
      res.status(502).json({ error: `Free image service failed: ${e instanceof Error ? e.message : "unknown error"}` });
    }
  }
);
