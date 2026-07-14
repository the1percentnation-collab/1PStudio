import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { onRequest } from "firebase-functions/v2/https";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";

initializeApp();

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
  // Whether the media is a video. Defaults to true (existing video flow).
  // Photo posts pass false so Ayrshare treats the media as an image.
  isVideo?: boolean;
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

    const { mediaUrl, post, title: rawTitle, platforms: rawPlatforms, scheduleDate, isVideo: rawIsVideo } = (req.body ?? {}) as PublishBody;

    // Default to a video post so the existing video flow is unchanged; photo
    // posts explicitly send isVideo: false.
    const isVideo = rawIsVideo !== false;

    const requested = (rawPlatforms ?? []).map((p) => p.toLowerCase());
    const platforms = Array.from(
      new Set(requested.map((p) => AYRSHARE_PLATFORMS[p]).filter(Boolean))
    );

    if (platforms.length === 0) {
      res.status(400).json({ error: "Select at least one supported platform to post to." });
      return;
    }
    // YouTube only accepts video uploads; reject photo posts targeting it.
    if (!isVideo && platforms.includes("youtube")) {
      res.status(400).json({ error: "YouTube only supports video posts — deselect it for a photo post." });
      return;
    }
    if (!mediaUrl || !/^https?:\/\//.test(mediaUrl)) {
      res.status(400).json({ error: `A valid ${isVideo ? "video" : "image"} URL is required (upload the ${isVideo ? "video" : "photo"} first).` });
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
      isVideo,
    };

    if (isVideo && platforms.includes("youtube")) {
      body.youTubeOptions = { title, visibility: "public" };
    }
    if (isVideo && platforms.includes("instagram")) {
      // Video posts to Instagram publish as Reels; photo posts publish as
      // a standard image feed post (no reels flag).
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
