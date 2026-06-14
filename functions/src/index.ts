import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { onRequest } from "firebase-functions/v2/https";
import { randomUUID } from "crypto";
import Busboy from "busboy";

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
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
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
// Flow: the browser POSTs the video file + caption + selected platforms here as
// multipart/form-data. We stash the video in Firebase Storage (with a public
// download token so Ayrshare can fetch it), then hand the URL to Ayrshare's
// /post endpoint. No per-platform OAuth or app review is needed on our side.
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

interface PublishMeta {
  post?: string;
  title?: string;
  platforms?: string[];
}

function parseMultipart(
  req: import("firebase-functions/v2/https").Request
): Promise<{ meta: PublishMeta; file: Buffer | null; filename: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: 30 * 1024 * 1024 } });
    let meta: PublishMeta = {};
    const chunks: Buffer[] = [];
    let filename = "video.mp4";
    let contentType = "video/mp4";
    let truncated = false;

    bb.on("field", (name, val) => {
      if (name === "meta") {
        try {
          meta = JSON.parse(val);
        } catch {
          /* leave meta empty */
        }
      }
    });

    bb.on("file", (_name, stream, info) => {
      filename = info.filename || filename;
      contentType = info.mimeType || contentType;
      stream.on("data", (d: Buffer) => chunks.push(d));
      stream.on("limit", () => {
        truncated = true;
      });
    });

    bb.on("close", () => {
      if (truncated) {
        reject(new Error("Video exceeds the 30 MB upload limit for direct publishing."));
        return;
      }
      resolve({
        meta,
        file: chunks.length ? Buffer.concat(chunks) : null,
        filename,
        contentType,
      });
    });

    bb.on("error", reject);
    bb.end(req.rawBody);
  });
}

export const publishPost = onRequest(
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

    const apiKey = process.env.AYRSHARE_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "AYRSHARE_API_KEY is not configured on the server." });
      return;
    }

    let meta: PublishMeta;
    let file: Buffer | null;
    let filename: string;
    let contentType: string;
    try {
      ({ meta, file, filename, contentType } = await parseMultipart(req));
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Failed to parse upload." });
      return;
    }

    const requested = (meta.platforms ?? []).map((p) => p.toLowerCase());
    const platforms = Array.from(
      new Set(requested.map((p) => AYRSHARE_PLATFORMS[p]).filter(Boolean))
    );

    if (platforms.length === 0) {
      res.status(400).json({ error: "Select at least one supported platform to post to." });
      return;
    }
    if (!file) {
      res.status(400).json({ error: "No video file was received." });
      return;
    }

    const postText = (meta.post ?? "").trim();
    if (!postText) {
      res.status(400).json({ error: "Caption text is required to publish." });
      return;
    }

    // 1) Upload the video to Storage with a public download token so Ayrshare
    //    can pull it. Using a download token avoids needing signed-URL IAM.
    let mediaUrl: string;
    try {
      const bucket = getStorage().bucket();
      const token = randomUUID();
      const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const objectPath = `social-posts/${Date.now()}-${safeName}`;
      const storedFile = bucket.file(objectPath);

      await storedFile.save(file, {
        resumable: false,
        contentType,
        metadata: { metadata: { firebaseStorageDownloadTokens: token } },
      });

      mediaUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
        objectPath
      )}?alt=media&token=${token}`;
    } catch (e) {
      res.status(500).json({ error: `Failed to store video: ${e instanceof Error ? e.message : "unknown error"}` });
      return;
    }

    // 2) Build the Ayrshare request, including platform-specific options.
    const title = (meta.title ?? postText).slice(0, 99);
    const body: Record<string, unknown> = {
      post: postText,
      platforms,
      mediaUrls: [mediaUrl],
      isVideo: true,
    };

    if (platforms.includes("youtube")) {
      body.youTubeOptions = { title, visibility: "public" };
    }
    if (platforms.includes("instagram")) {
      // Video posts to Instagram publish as Reels.
      body.instagramOptions = { reels: true };
    }

    // 3) Fan the post out.
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
        const message =
          (result as { message?: string }).message ?? `Ayrshare error ${ayrRes.status}`;
        res.status(ayrRes.status).json({ error: message, details: result });
        return;
      }

      res.json({ status: "ok", mediaUrl, ayrshare: result });
    } catch (e) {
      res.status(502).json({ error: `Failed to reach Ayrshare: ${e instanceof Error ? e.message : "unknown error"}` });
    }
  }
);
