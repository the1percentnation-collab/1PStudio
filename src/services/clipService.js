// AI video clipping: one long video -> several short, ranked, captioned clips.
// Reuses the app's existing pieces end to end:
//   uploadVideo (Storage) -> /api/transcribe (Deepgram word timings)
//   -> /api/clips (Claude picks the best moments) -> per-clip overlaySpec
// built from the SAME caption grouping + overlay renderer the editor/export use.
import { uploadVideo } from './socialService';
import { groupWordsIntoCaptions } from './captionUtils';
import { makeTextElement } from './overlayRenderer';

// Length presets shown in the UI -> {minSec,maxSec} sent to selection.
export const CLIP_LENGTHS = {
  '0-30s': { minSec: 8, maxSec: 30 },
  '30-60s': { minSec: 30, maxSec: 60 },
  '1-3m': { minSec: 60, maxSec: 180 },
};

async function transcribe(mediaUrl) {
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mediaUrl }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Transcription failed (${res.status})`);
  return { words: Array.isArray(data.words) ? data.words : [], configured: data.configured !== false };
}

async function selectClips({ words, clipCount, minSec, maxSec, filename }) {
  const res = await fetch('/api/clips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ words, clipCount, minSec, maxSec, filename }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Clip selection failed (${res.status})`);
  return {
    clips: Array.isArray(data.clips) ? data.clips : [],
    configured: data.configured !== false,
    degraded: !!data.degraded,
    reason: data.reason,
  };
}

// Build the editor/export overlaySpec for one clip. Caption line times stay
// SOURCE-ABSOLUTE (same clock as video.currentTime); `clip` bounds tell the
// preview/exporter which sub-range to play and trim to.
export function buildClipSpec(clip, allWords) {
  const clipWords = (allWords || []).filter((w) => w.s >= clip.startSec && w.e <= clip.endSec);
  const lines = groupWordsIntoCaptions(clipWords);
  return {
    version: 1,
    duration: Math.max(0.1, clip.endSec - clip.startSec),
    clip: { start: clip.startSec, end: clip.endSec },
    texts: clip.onScreenText ? [makeTextElement({ text: clip.onScreenText, x: 0.5, y: 0.18 })] : [],
    captions: {
      enabled: lines.length > 0,
      preset: 'karaoke',
      size: 0.045,
      y: 0.72,
      font: 'DM Sans',
      weight: 800,
      lines,
    },
  };
}

// Turn a clip descriptor into a result object shaped like the Composer's
// VideoCard results, so it flows through the editor, publish panel, and library.
function toResult(clip, i, file, videoUrl, allWords) {
  const clipWords = (allWords || []).filter((w) => w.s >= clip.startSec && w.e <= clip.endSec);
  return {
    id: `clip-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
    filename: file.name,
    mediaType: 'video',
    _file: file,
    videoUrl,
    clip: { start: clip.startSec, end: clip.endSec },
    title: clip.title,
    hookScore: clip.hookScore,
    reason: clip.reason,
    onScreenText: clip.onScreenText,
    words: clipWords,
    overlaySpec: buildClipSpec(clip, allWords),
    // Mirror the Claude "content" contract so VideoCard/PublishPanel/Library work unchanged.
    content: {
      best_title: clip.title,
      on_screen_text: clip.onScreenText,
      caption: clip.caption,
      hashtags: clip.hashtags,
      hook_score: clip.hookScore,
      hook_score_reason: clip.reason,
      content_pillar: 'Accountability & Execution',
      video_description: clip.caption,
      headline: (clip.title || '').toUpperCase().slice(0, 60),
      niche: 'Entrepreneur Mindset',
      thumbnail_text: (clip.onScreenText || clip.title || '').toUpperCase().slice(0, 40),
      seo_opener: clip.title,
      titles: [],
      transcript_summary: clipWords.slice(0, 30).map((w) => w.w).join(' '),
    },
  };
}

/**
 * Generate clips from a long video File.
 * onProgress receives { phase, pct? } where phase is 'upload'|'transcribe'|'select'|'done'.
 * Returns { results, warning } — warning is set when running degraded (no keys).
 */
export async function generateClips(file, { clipCount = 5, length = '30-60s' } = {}, onProgress) {
  const { minSec, maxSec } = CLIP_LENGTHS[length] || CLIP_LENGTHS['30-60s'];

  onProgress?.({ phase: 'upload', pct: 0 });
  const mediaUrl = await uploadVideo(file, (pct) => onProgress?.({ phase: 'upload', pct }));

  onProgress?.({ phase: 'transcribe' });
  const { words, configured: transcribeOk } = await transcribe(mediaUrl);
  if (!words.length) {
    const why = transcribeOk
      ? 'No speech was detected in this video, so there are no moments to clip.'
      : 'Transcription is not configured on the server (DEEPGRAM_API_KEY), so clips can’t be selected yet.';
    const err = new Error(why);
    err.code = transcribeOk ? 'NO_SPEECH' : 'NOT_CONFIGURED';
    throw err;
  }

  onProgress?.({ phase: 'select' });
  const { clips, configured, degraded } = await selectClips({ words, clipCount, minSec, maxSec, filename: file.name });
  if (!clips.length) {
    throw new Error('No clips could be selected from this video. Try a longer video with clearer speech.');
  }

  const videoUrl = URL.createObjectURL(file);
  const results = clips.map((c, i) => toResult(c, i, file, videoUrl, words));

  onProgress?.({ phase: 'done' });
  return {
    results,
    warning: !configured || degraded
      ? 'AI selection is running in fallback mode (ANTHROPIC_API_KEY not set) — clips were auto-split evenly.'
      : null,
  };
}
