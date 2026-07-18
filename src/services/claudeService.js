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
        // Cap the long edge (like photos) — a 4K phone video otherwise yields
        // multi-MB base64 frames, and the resulting huge POST body is exactly
        // what makes iOS Safari drop the analyze request with "Load failed".
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 360;
        const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
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

const MAX_IMAGE_DIM = 1280;

// Decode an image file, draw it to a canvas (capped to MAX_IMAGE_DIM on the
// long edge), and return a base64 JPEG. Mirrors the canvas -> JPEG approach in
// extractFrameAt so the output matches the backend's image/jpeg media_type.
export async function fileToImageBase64(imageFile) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(imageFile);
    const img = new Image();

    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width || 640;
        const h = img.naturalHeight || img.height || 640;
        const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}

export async function generateTikTokContent(file, onProgress, transcript = '') {
  const isPhoto = file.type.startsWith('image/');
  const mediaType = isPhoto ? 'photo' : 'video';

  let frames = { hookFrame: null, midFrame: null, endFrame: null };
  if (isPhoto) {
    onProgress('Reading photo...');
    try {
      frames = { hookFrame: await fileToImageBase64(file), midFrame: null, endFrame: null };
    } catch {
      /* non-fatal */
    }
  } else {
    onProgress('Extracting frames...');
    try {
      frames = await extractFramesFromVideo(file);
    } catch {
      /* non-fatal */
    }
  }

  // If no transcript was supplied, auto-transcribe the audio so Claude grades
  // the actual spoken content (the real hook/message), not just still frames.
  // Best-effort: any failure falls back to frame-only analysis. Photos have
  // no audio, so they skip transcription entirely.
  let finalTranscript = (transcript || '').trim();
  let words = [];
  if (!isPhoto && !finalTranscript) {
    try {
      const mediaUrl = await uploadVideo(file, (p) =>
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

  onProgress('Analyzing with Claude...');

  // Network-level failures (iOS Safari's bare "Load failed") get retried —
  // a single dropped connection shouldn't kill the whole generation.
  const body = JSON.stringify({ frames, transcript: finalTranscript, filename: file.name, mediaType });
  let response = null;
  let netErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      onProgress(`Connection dropped — retrying (${attempt + 1}/3)…`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
    try {
      response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      netErr = null;
      break;
    } catch (err) {
      netErr = err;
    }
  }
  if (!response) {
    throw new Error(
      `Network dropped while analyzing (${netErr?.message || 'load failed'}). Check your connection and tap Regenerate.`
    );
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error || `API error ${response.status}`);
  }

  onProgress('Parsing response...');
  const content = await response.json();
  return { content, frames, transcript: finalTranscript, words, mediaType };
}
