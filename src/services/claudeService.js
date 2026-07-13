import { uploadVideo } from './socialService';

// Transcribes an uploaded video via the Deepgram-backed function. Returns
// { text, words } where words is [{ w, s, e }] (word, start/end seconds) —
// empty when transcription isn't configured/available. The word timings
// drive the synced-caption editor.
async function transcribeVideo(mediaUrl) {
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mediaUrl }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Transcription failed (${res.status})`);
  return {
    text: (data.transcript || '').trim(),
    words: Array.isArray(data.words) ? data.words : [],
  };
}

function extractFrameAt(video, pct) {
  return new Promise((resolve) => {
    const targetTime = video.duration * pct;
    video.currentTime = targetTime;

    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75).split(',')[1]);
      } catch {
        resolve(null);
      }
    };

    video.addEventListener('seeked', onSeeked);
  });
}

export async function extractFramesFromVideo(videoFile) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(videoFile);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = async () => {
      try {
        const hookFrame = await extractFrameAt(video, 0.04);
        const midFrame  = await extractFrameAt(video, 0.45);
        const endFrame  = await extractFrameAt(video, 0.85);
        URL.revokeObjectURL(url);
        resolve({ hookFrame, midFrame, endFrame });
      } catch {
        URL.revokeObjectURL(url);
        resolve({ hookFrame: null, midFrame: null, endFrame: null });
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ hookFrame: null, midFrame: null, endFrame: null });
    };

    video.src = url;
  });
}

export async function generateTikTokContent(videoFile, onProgress, transcript = '') {
  onProgress('Extracting frames...');

  let frames = { hookFrame: null, midFrame: null, endFrame: null };
  try {
    frames = await extractFramesFromVideo(videoFile);
  } catch {
    /* non-fatal */
  }

  // If no transcript was supplied, auto-transcribe the audio so Claude grades
  // the actual spoken content (the real hook/message), not just still frames.
  // Best-effort: any failure falls back to frame-only analysis.
  let finalTranscript = (transcript || '').trim();
  let words = [];
  if (!finalTranscript) {
    try {
      const mediaUrl = await uploadVideo(videoFile, (p) =>
        onProgress(`Uploading for analysis… ${Math.round(p * 100)}%`)
      );
      onProgress('Transcribing audio…');
      const t = await transcribeVideo(mediaUrl);
      finalTranscript = t.text;
      words = t.words;
    } catch {
      /* no transcript available — fall back to frames only */
    }
  }

  onProgress('Analyzing with 1P Studio…');

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frames, transcript: finalTranscript, filename: videoFile.name }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error || `API error ${response.status}`);
  }

  onProgress('Parsing response...');
  const content = await response.json();
  return { content, frames, transcript: finalTranscript, words };
}
