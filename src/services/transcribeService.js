// Plain-text transcription: upload a video/audio file, then ask the
// transcribeAudio function (Deepgram, word-level timings) for its spoken text.
// Powers the Transcribe tab — the output is meant to be read, edited, and
// copy-pasted, so this module also formats the raw words into paragraphs,
// timestamped blocks, and .srt subtitles.
import { uploadVideo } from './socialService';
import { FUNCTIONS_ORIGIN } from './firebase';
import { authHeaders } from './userKeys';
import { groupWordsIntoCaptions } from './captionUtils';

// mm:ss, or h:mm:ss once the clip passes an hour.
export function formatTime(sec, { withMs = false } = {}) {
  const total = Math.max(0, sec || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const pad = (n) => String(n).padStart(2, '0');
  const base = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  if (!withMs) return base;
  return `${base}.${String(Math.floor((total % 1) * 1000)).padStart(3, '0')}`;
}

const SENTENCE_END = /[.!?]["')\]]?$/;

// Break the word stream into readable paragraphs: a new one starts after a
// noticeable pause, or once a sentence ends and the block is long enough.
export function buildParagraphs(words, { maxWords = 90, minWords = 35, gap = 1.1 } = {}) {
  const paragraphs = [];
  let current = null;

  for (const word of words || []) {
    const prev = current?.words[current.words.length - 1];
    const startNew =
      !current ||
      current.words.length >= maxWords ||
      (prev && word.s - prev.e > gap) ||
      (prev && current.words.length >= minWords && SENTENCE_END.test(prev.w));

    if (startNew) {
      current = { start: word.s, end: word.e, words: [word] };
      paragraphs.push(current);
    } else {
      current.words.push(word);
      current.end = word.e;
    }
  }

  return paragraphs.map((p) => ({
    start: p.start,
    end: p.end,
    text: p.words.map((w) => w.w).join(' '),
  }));
}

// Paragraphs as one plain-text block — what most people want to paste.
export function toPlainText(paragraphs) {
  return paragraphs.map((p) => p.text).join('\n\n');
}

// Same text with a [mm:ss] stamp on each paragraph.
export function toTimestampedText(paragraphs) {
  return paragraphs.map((p) => `[${formatTime(p.start)}] ${p.text}`).join('\n\n');
}

// Standard .srt, built from the same caption grouping the editor uses (longer
// lines here — these are read as subtitles, not burned-in karaoke captions).
export function toSRT(words) {
  // hh:mm:ss,mmm — .srt always wants the hours field and a comma separator.
  const srtTime = (t) => {
    const total = Math.max(0, t || 0);
    const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0');
    return `${pad(total / 3600)}:${pad((total % 3600) / 60)}:${pad(total % 60)},${pad((total % 1) * 1000, 3)}`;
  };
  return groupWordsIntoCaptions(words || [], { maxWords: 10, maxChars: 48 })
    .map((line, i) => `${i + 1}\n${srtTime(line.start)} --> ${srtTime(line.end)}\n${line.text}\n`)
    .join('\n');
}

/**
 * Transcribe a video/audio File.
 * onProgress receives { phase: 'upload'|'transcribe'|'done', pct? }.
 * Resolves with { transcript, words, paragraphs, durationSec }.
 * Errors carry a `code` of NOT_CONFIGURED or NO_SPEECH where relevant.
 */
export async function transcribeFile(file, onProgress) {
  if (!file) throw new Error('Choose a video or audio file to transcribe.');

  onProgress?.({ phase: 'upload', pct: 0 });
  const mediaUrl = await uploadVideo(file, (pct) => onProgress?.({ phase: 'upload', pct }));

  onProgress?.({ phase: 'transcribe' });
  const body = JSON.stringify({ mediaUrl });
  const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };

  // Call the function directly: the Hosting /api proxy cuts responses off at
  // 60s, too short for a long recording. Fall back to the Hosting route if the
  // direct origin is unreachable.
  let response;
  try {
    response = await fetch(`${FUNCTIONS_ORIGIN}/transcribeAudio`, { method: 'POST', headers, body });
  } catch {
    response = await fetch('/api/transcribe', { method: 'POST', headers, body });
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Transcription failed (${response.status})`);
  }

  if (data.configured === false) {
    const err = new Error(
      'Transcription isn’t set up yet — add your Deepgram API key in Settings, then try again.'
    );
    err.code = 'NOT_CONFIGURED';
    throw err;
  }

  const words = Array.isArray(data.words) ? data.words : [];
  const paragraphs = buildParagraphs(words);
  const transcript = (data.transcript || '').trim() || toPlainText(paragraphs);

  if (!transcript) {
    const err = new Error('No speech was detected in this file — check that it has audible audio.');
    err.code = 'NO_SPEECH';
    throw err;
  }

  onProgress?.({ phase: 'done' });
  return {
    transcript,
    words,
    paragraphs: paragraphs.length ? paragraphs : [{ start: 0, end: 0, text: transcript }],
    durationSec: words.length ? words[words.length - 1].e : 0,
  };
}
