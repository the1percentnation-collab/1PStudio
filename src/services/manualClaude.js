// "Use my Claude subscription" flow — zero-API-cost content generation.
//
// The Anthropic API is billed separately from a claude.ai subscription, and
// consumer-subscription auth can't be wired into the backend. Instead, this
// module builds the SAME content-strategy prompt the analyze endpoint uses so
// the user can paste it into the Claude app (claude.ai — covered by their
// subscription), then paste Claude's JSON reply back into the card. The
// parser normalizes the reply into the exact shape /api/analyze returns.
//
// Keep the prompt in sync with buildSystemPrompt() in functions/src/index.ts.

export function buildManualPrompt({ transcript, filename, mediaType }) {
  const isPhoto = mediaType === 'photo';
  const media = isPhoto ? 'TikTok photo post' : 'TikTok video';
  const summaryFrom = isPhoto ? 'the caption/notes' : 'the transcript';

  const transcriptSection = transcript?.trim()
    ? `\n\n${isPhoto ? 'CAPTION / NOTES' : 'VIDEO TRANSCRIPT'}:\n"""\n${transcript.trim()}\n"""`
    : `\n\n(No transcript available — infer the content from the filename.)`;

  return `You are a TikTok content strategist for The One Percent Nation, a self-help and leadership coaching brand. The creator is Anthony Brown, a Black male leader, real estate broker turned full-time entrepreneur, faith-adjacent, direct communicator, Oklahoma-based. His content pillars are: limiting beliefs, self-accountability, identity and mindset, leadership and purpose. His hook style: second-person identity challenges, truth bombs, direct confrontation of excuses.

You are generating content for a ${media}.

Return ONLY valid JSON with no markdown, no backticks, no preamble. Fields:
- best_title (string): the single strongest ${isPhoto ? 'post' : 'video'} title — optimized for search and click-through, max 70 chars
- on_screen_text (string): bold text overlay shown on the ${isPhoto ? 'photo' : 'video'} — stop-scroll hook, max 8 words, all caps, punchy
- niche (string): specific content niche, 2-4 words (e.g. "Entrepreneur Mindset", "Real Estate Motivation", "Self-Discipline")
- thumbnail_text (string): text to print on the ${isPhoto ? 'cover image' : 'video thumbnail'} — max 6 words, high contrast, creates curiosity or urgency
- video_description (string): full ${isPhoto ? 'post' : 'video'} description — 200-400 chars, opens with a hook, body adds context, ends with soft CTA
- headline (string): punchy, all-caps title optimized for TikTok search — max 60 chars
- seo_opener (string): the first line of ${isPhoto ? 'on-screen or caption text' : 'spoken text or on-screen text'} that stops the scroll
- caption (string): full TikTok caption including opening line, body, and soft CTA — 150-300 chars
- hashtags (string): 12-15 hashtags, mix of niche, broad, and trending — space-separated
- content_pillar (string): one of "Self-Sabotage & Limiting Beliefs", "Accountability & Execution", "Identity & Mindset Shift", "Leadership & Purpose"
- hook_score (number 1-10): how strong the opening hook is
- hook_score_reason (string): one sentence explaining the score and one concrete tip to improve it
- titles (array of 3 strings): alternate ${isPhoto ? 'post' : 'video'} title options, each a different angle
- transcript_summary (string): 1-2 sentence summary of what the ${isPhoto ? 'photo post' : 'video'} is about (derive from ${summaryFrom})

${isPhoto ? 'Photo' : 'Video'} filename: "${filename ?? 'unknown'}"${transcriptSection}

Generate the full content strategy JSON as instructed.`;
}

// Parse Claude's pasted reply into the same shape /api/analyze returns.
// Tolerant of surrounding prose/code fences. Throws with a friendly message
// when no usable JSON is found.
export function parseManualContent(pasted) {
  const text = String(pasted ?? '').trim();
  if (!text) throw new Error('Paste Claude’s reply first.');

  let parsed;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : text);
  } catch {
    throw new Error('Couldn’t read that as JSON — copy Claude’s whole reply (it should start with { and end with }).');
  }

  return {
    best_title: String(parsed.best_title ?? ''),
    on_screen_text: String(parsed.on_screen_text ?? ''),
    niche: String(parsed.niche ?? ''),
    thumbnail_text: String(parsed.thumbnail_text ?? ''),
    video_description: String(parsed.video_description ?? ''),
    headline: String(parsed.headline ?? ''),
    seo_opener: String(parsed.seo_opener ?? ''),
    caption: String(parsed.caption ?? ''),
    hashtags: String(parsed.hashtags ?? ''),
    content_pillar: String(parsed.content_pillar ?? 'Identity & Mindset Shift'),
    hook_score: typeof parsed.hook_score === 'number' ? Math.max(1, Math.min(10, parsed.hook_score)) : 5,
    hook_score_reason: String(parsed.hook_score_reason ?? ''),
    titles: Array.isArray(parsed.titles) ? parsed.titles.slice(0, 3).map((t) => String(t)) : [],
    transcript_summary: String(parsed.transcript_summary ?? ''),
  };
}
