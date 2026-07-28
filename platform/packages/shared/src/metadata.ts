/**
 * The 14-field content-metadata contract, ported verbatim from the original
 * 1P Studio Firebase function (functions/src/index.ts). This is the platform's
 * AI title / description / hashtag generator output shape.
 */
export interface ContentMetadata {
  best_title: string;
  on_screen_text: string;
  niche: string;
  thumbnail_text: string;
  video_description: string;
  headline: string;
  seo_opener: string;
  caption: string;
  hashtags: string;
  content_pillar: string;
  hook_score: number; // 1-10
  hook_score_reason: string;
  titles: string[];
  transcript_summary: string;
}

export function normalizeContentMetadata(parsed: Record<string, unknown>): ContentMetadata {
  return {
    best_title: String(parsed.best_title ?? ""),
    on_screen_text: String(parsed.on_screen_text ?? ""),
    niche: String(parsed.niche ?? ""),
    thumbnail_text: String(parsed.thumbnail_text ?? ""),
    video_description: String(parsed.video_description ?? ""),
    headline: String(parsed.headline ?? ""),
    seo_opener: String(parsed.seo_opener ?? ""),
    caption: String(parsed.caption ?? ""),
    hashtags: String(parsed.hashtags ?? ""),
    content_pillar: String(parsed.content_pillar ?? "Identity & Mindset Shift"),
    hook_score: typeof parsed.hook_score === "number" ? parsed.hook_score : 5,
    hook_score_reason: String(parsed.hook_score_reason ?? ""),
    titles: Array.isArray(parsed.titles) ? parsed.titles.map(String) : [],
    transcript_summary: String(parsed.transcript_summary ?? ""),
  };
}
