import type { Clip, SourceVideo } from "@onepct/db";
import { normalizeContentMetadata, type ContentMetadata } from "@onepct/shared";
import { getObjectBase64 } from "../lib/storage";
import { ONE_PERCENT_SYSTEM_PROMPT } from "./one-percent-prompt";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

type ClipWithSource = Clip & { project: { sourceVideo: SourceVideo | null } };

interface MetadataInput {
  filename: string;
  transcript?: string;
  frames: { hookFrame?: string; midFrame?: string; endFrame?: string };
}

/**
 * Same request shape as the original 1P Studio tool, but the frames come from
 * the platform's own ingest thumbnails instead of browser extraction, and the
 * transcript slice comes straight from the pipeline's TimelineMetadata.
 */
export async function generateClipMetadata(clip: ClipWithSource): Promise<ContentMetadata> {
  const source = clip.project.sourceVideo;
  const thumbs = (source?.thumbKeys ?? {}) as Record<string, string>;
  const frames: MetadataInput["frames"] = {};
  for (const [name, prop] of [["hook", "hookFrame"], ["mid", "midFrame"], ["end", "endFrame"]] as const) {
    if (thumbs[name]) {
      frames[prop] = await getObjectBase64(thumbs[name]).catch(() => undefined);
    }
  }
  const transcript = (clip.transcriptSlice as { text?: string } | null)?.text;
  return generateMetadata({ filename: clip.title, transcript, frames });
}

export async function generateMetadata(input: MetadataInput): Promise<ContentMetadata> {
  if (!ANTHROPIC_API_KEY) return mockMetadata(input);
  try {
    return await anthropicMetadata(input);
  } catch (err) {
    console.warn(`metadata generation fell back to mock: ${String(err)}`);
    return mockMetadata(input);
  }
}

function imageBlock(base64: string | undefined, label: string): object[] {
  if (!base64) return [];
  return [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
    { type: "text", text: label },
  ];
}

async function anthropicMetadata(input: MetadataInput): Promise<ContentMetadata> {
  const contentBlocks: object[] = [
    ...imageBlock(input.frames.hookFrame, "[HOOK FRAME — opening shot]"),
    ...imageBlock(input.frames.midFrame, "[MID FRAME — ~45% through video]"),
    ...imageBlock(input.frames.endFrame, "[END FRAME — ~85% through video]"),
  ];
  const transcriptSection = input.transcript?.trim()
    ? `\n\nVIDEO TRANSCRIPT:\n"""\n${input.transcript.trim()}\n"""\n`
    : "";
  contentBlocks.push({
    type: "text",
    text: `Video filename: "${input.filename}"${transcriptSection}\n\nGenerate the full content strategy JSON as instructed.`,
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1800,
      system: ONE_PERCENT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: contentBlocks }],
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Anthropic API error ${res.status}`);
  }
  const data = (await res.json()) as { content?: { text?: string }[] };
  const text = data.content?.[0]?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  return normalizeContentMetadata(JSON.parse(match ? match[0] : text));
}

/** Deterministic offline fallback shaped exactly like the real generator. */
function mockMetadata(input: MetadataInput): ContentMetadata {
  const base = (input.transcript?.split(/[.!?]/)[0] ?? input.filename).trim().slice(0, 66);
  const title = base.charAt(0).toUpperCase() + base.slice(1);
  return normalizeContentMetadata({
    best_title: title,
    on_screen_text: title.split(" ").slice(0, 6).join(" ").toUpperCase(),
    niche: "Entrepreneur Mindset",
    thumbnail_text: title.split(" ").slice(0, 5).join(" ").toUpperCase(),
    video_description: `${title}. Real talk on discipline, ownership, and becoming the person your goals require. Follow for daily accountability. #1PNation`,
    headline: title.toUpperCase().slice(0, 60),
    seo_opener: title,
    caption: `${title} — save this and watch it every morning until it sticks. What excuse are you retiring today? 👇 #1PNation`,
    hashtags: "#mindset #discipline #accountability #entrepreneur #selfimprovement #motivation #leadership #success #growth #1percent #dailymotivation #fyp",
    content_pillar: "Accountability & Execution",
    hook_score: 7,
    hook_score_reason: "Direct second-person open (offline heuristic); tighten the first four words to sharpen it further.",
    titles: [title, `Why ${title.toLowerCase()}`, `The truth about ${title.toLowerCase().split(" ").slice(0, 6).join(" ")}`],
    transcript_summary: input.transcript ? input.transcript.slice(0, 180) : `Video about: ${input.filename}`,
  });
}
