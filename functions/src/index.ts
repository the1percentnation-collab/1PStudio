import { initializeApp } from "firebase-admin/app";
import { onRequest } from "firebase-functions/v2/https";

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
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
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
