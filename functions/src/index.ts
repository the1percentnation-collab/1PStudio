import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { onRequest } from "firebase-functions/v2/https";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";

initializeApp();

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

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Server configuration error: ANTHROPIC_API_KEY is not set" });
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
// Social publishing via Ayrshare
//
// Ayrshare is a single API that fans a post out to every connected social
// account (TikTok, Instagram Reels, YouTube Shorts, Facebook, X, LinkedIn).
// You connect each platform once inside the Ayrshare dashboard; this function
// only needs the Ayrshare API key (set as the AYRSHARE_API_KEY env var / secret).
//
// Flow: the browser uploads the video DIRECTLY to Firebase Storage (no size
// cap from this function) and POSTs the resulting download URL + caption +
// selected platforms here as JSON. We hand that URL to Ayrshare's /post
// endpoint, which pulls the video and posts it to every platform. No
// per-platform OAuth or app review is needed on our side.
// ---------------------------------------------------------------------------

// Ayrshare's platform identifiers. Note: X is "twitter" in Ayrshare's API.
const AYRSHARE_PLATFORMS: Record<string, string> = {
  tiktok: "tiktok",
  instagram: "instagram",
  youtube: "youtube",
  facebook: "facebook",
  x: "twitter",
  twitter: "twitter",
  linkedin: "linkedin",
};

interface PublishBody {
  mediaUrl?: string;
  post?: string;
  title?: string;
  platforms?: string[];
  scheduleDate?: string;
  mediaType?: string;
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

    const apiKey = process.env.AYRSHARE_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "AYRSHARE_API_KEY is not configured on the server." });
      return;
    }

    const { mediaUrl, post, title: rawTitle, platforms: rawPlatforms, scheduleDate, mediaType } = (req.body ?? {}) as PublishBody;
    const isPhoto = mediaType === "photo";

    const requested = (rawPlatforms ?? []).map((p) => p.toLowerCase());
    const platforms = Array.from(
      new Set(requested.map((p) => AYRSHARE_PLATFORMS[p]).filter(Boolean))
    );

    if (platforms.length === 0) {
      res.status(400).json({ error: "Select at least one supported platform to post to." });
      return;
    }
    if (isPhoto && platforms.includes("youtube")) {
      res.status(400).json({ error: "YouTube only supports video — deselect YouTube to post this photo." });
      return;
    }
    if (!mediaUrl || !/^https?:\/\//.test(mediaUrl)) {
      res.status(400).json({ error: "A valid media URL is required (upload the file first)." });
      return;
    }

    const postText = (post ?? "").trim();
    if (!postText) {
      res.status(400).json({ error: "Caption text is required to publish." });
      return;
    }

    // Build the Ayrshare request, including platform-specific options.
    const title = (rawTitle ?? postText).slice(0, 99);
    const body: Record<string, unknown> = {
      post: postText,
      platforms,
      mediaUrls: [mediaUrl],
      isVideo: !isPhoto,
    };

    if (platforms.includes("youtube")) {
      body.youTubeOptions = { title, visibility: "public" };
    }
    if (platforms.includes("instagram") && !isPhoto) {
      // Video posts to Instagram publish as Reels; photos post as regular feed posts.
      body.instagramOptions = { reels: true };
    }

    // Optional scheduling — Ayrshare accepts an ISO 8601 UTC date in the future.
    if (scheduleDate && !Number.isNaN(Date.parse(scheduleDate))) {
      body.scheduleDate = new Date(scheduleDate).toISOString();
    }

    // Fan the post out.
    try {
      const ayrRes = await fetch("https://api.ayrshare.com/api/post", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      const result = await ayrRes.json().catch(() => ({}));
      if (!ayrRes.ok) {
        // Surface Ayrshare's real reason — it may be a top-level message, a
        // per-platform errors array, or a bare status. Don't hide it behind 403.
        const r = result as {
          message?: string;
          errors?: { message?: string; platform?: string }[];
          posts?: { status?: string; errors?: { message?: string }[]; platform?: string }[];
        };
        const detail =
          r.message ||
          r.errors?.map((e) => `${e.platform ? e.platform + ": " : ""}${e.message}`).join("; ") ||
          r.posts?.flatMap((p) => (p.errors ?? []).map((e) => `${p.platform ? p.platform + ": " : ""}${e.message}`)).join("; ") ||
          `Ayrshare error ${ayrRes.status}`;
        res.status(ayrRes.status).json({ error: detail, details: result });
        return;
      }

      res.json({ status: "ok", mediaUrl, ayrshare: result });
    } catch (e) {
      res.status(502).json({ error: `Failed to reach Ayrshare: ${e instanceof Error ? e.message : "unknown error"}` });
    }
  }
);

// ---------------------------------------------------------------------------
// Connected-account status — reads which social accounts are linked in
// Ayrshare so the app can show live connection state. Accounts are linked in
// the Ayrshare dashboard; this just reports their status.
// ---------------------------------------------------------------------------

// Map Ayrshare platform ids back to our app's ids (X is "twitter" in Ayrshare).
const FROM_AYRSHARE: Record<string, string> = {
  tiktok: "tiktok",
  instagram: "instagram",
  youtube: "youtube",
  facebook: "facebook",
  twitter: "x",
  linkedin: "linkedin",
};

export const accountsStatus = onRequest(
  {
    cors: true,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (_req, res) => {
    const apiKey = process.env.AYRSHARE_API_KEY;
    if (!apiKey) {
      res.status(200).json({ configured: false, connected: [], displayNames: [] });
      return;
    }

    try {
      const ayrRes = await fetch("https://api.ayrshare.com/api/user", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = (await ayrRes.json().catch(() => ({}))) as {
        activeSocialAccounts?: string[];
        displayNames?: { platform?: string; displayName?: string }[];
      };

      if (!ayrRes.ok) {
        res.status(200).json({ configured: true, connected: [], displayNames: [], error: `Ayrshare error ${ayrRes.status}` });
        return;
      }

      const connected = Array.from(
        new Set((data.activeSocialAccounts ?? []).map((p) => FROM_AYRSHARE[p] ?? p))
      );
      const displayNames = (data.displayNames ?? []).map((d) => ({
        platform: FROM_AYRSHARE[d.platform ?? ""] ?? d.platform,
        displayName: d.displayName,
      }));

      res.json({ configured: true, connected, displayNames });
    } catch (e) {
      res.status(200).json({ configured: true, connected: [], displayNames: [], error: e instanceof Error ? e.message : "unknown error" });
    }
  }
);

// ---------------------------------------------------------------------------
// Post history — proxies Ayrshare's /api/history so the app can show REAL
// post outcomes (published / still scheduled / failed at fire time) instead
// of the optimistic local record written when a post was queued. Fields in
// Ayrshare's response aren't contractually stable, so everything is
// normalized defensively here and the client only sees one clean shape.
// ---------------------------------------------------------------------------

type NormStatus = "published" | "scheduled" | "failed";

function normStatus(raw: unknown, dateIso: string | null): NormStatus {
  const s = String(raw ?? "").toLowerCase();
  if (["error", "failed", "failure"].includes(s)) return "failed";
  if (s.startsWith("awaiting") || ["scheduled", "pending", "processing"].includes(s)) return "scheduled";
  if (["success", "posted", "sent", "published"].includes(s)) return "published";
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
  async (_req, res) => {
    const apiKey = process.env.AYRSHARE_API_KEY;
    if (!apiKey) {
      res.status(200).json({ configured: false, posts: [] });
      return;
    }

    try {
      const ayrRes = await fetch("https://api.ayrshare.com/api/history", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = (await ayrRes.json().catch(() => ({}))) as Record<string, unknown>;

      if (!ayrRes.ok) {
        res.status(200).json({ configured: true, posts: [], error: `Ayrshare error ${ayrRes.status}` });
        return;
      }

      // The history envelope may be a bare array or wrapped in a key.
      const items: Record<string, unknown>[] = Array.isArray(data)
        ? data
        : ((data.history ?? data.posts ?? data.items ?? []) as Record<string, unknown>[]);

      const posts = (Array.isArray(items) ? items : [])
        .map((item) => {
          const rawId = item.id ?? item.postId ?? item._id;
          if (!rawId) return null;
          const date =
            toIso(item.scheduleDate) ?? toIso(item.created) ?? toIso(item.createdUTC) ?? toIso(item.publishDate);
          return {
            id: String(rawId),
            status: normStatus(item.status, date),
            caption: String(item.post ?? item.caption ?? ""),
            platforms: (Array.isArray(item.platforms) ? item.platforms : [])
              .map((p) => FROM_AYRSHARE[String(p).toLowerCase()] ?? String(p)),
            mediaUrls: (Array.isArray(item.mediaUrls) ? item.mediaUrls : []).filter(
              (u): u is string => typeof u === "string"
            ),
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

    if (words.length === 0) {
      // Nothing to clip without speech timings.
      res.status(200).json({ clips: [], configured: !!process.env.ANTHROPIC_API_KEY, reason: "no-speech" });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
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
