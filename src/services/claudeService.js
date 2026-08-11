import { uploadVideo } from './socialService';
import { authHeaders } from './userKeys';

// Per-seek timeout. Some clips (phone .mov / HEVC especially) never fire the
// 'seeked' event, so we must not wait on it forever — resolve null instead.
const SEEK_TIMEOUT_MS = 4000;
// Overall guard: if metadata never loads or extraction stalls, give up so the
// pipeline can continue with whatever frames it has (or none).
const EXTRACT_TIMEOUT_MS = 15000;

// Transcribes an uploaded video via the Deepgram-backed function. Returns
// { text, words } where words is [{ w, s, e }] (word, start/end seconds) —
// empty when transcription isn't configured/available. The word timings
// drive the synced-caption editor.
async function transcribeVideo(mediaUrl) {
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ mediaUrl }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Transcription failed (${res.status})`);
  return {
    text: (data.transcript || '').trim(),
    words: Array.isArray(data.words) ? data.words : [],
  };
}

// Files written by MediaRecorder (in-app recordings) report a duration of
// Infinity until the element has been seeked past the end, so metadata alone
// isn't enough to work out where the mid/end frames live. Resolves 0 when the
// duration can't be determined at all.
function resolveDuration(video) {
  return new Promise((resolve) => {
    if (Number.isFinite(video.duration) && video.duration > 0) {
      resolve(video.duration);
      return;
    }

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener('timeupdate', onTimeUpdate);
      resolve(value);
    };

    const onTimeUpdate = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) finish(video.duration);
      else if (video.currentTime > 0 && Number.isFinite(video.currentTime)) finish(video.currentTime);
    };

    const timer = setTimeout(() => finish(0), SEEK_TIMEOUT_MS);
    video.addEventListener('timeupdate', onTimeUpdate);

    try {
      video.currentTime = 1e101; // forces the browser to compute the real duration
    } catch {
      finish(0);
    }
  });
}

function extractFrameAt(video, time) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', onSeeked);
      clearTimeout(timer);
      resolve(value);
    };

    const onSeeked = () => {
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
        finish(canvas.toDataURL('image/jpeg', 0.75).split(',')[1]);
      } catch {
        finish(null);
      }
    };

    // If the seek never completes, don't block forever.
    const timer = setTimeout(() => finish(null), SEEK_TIMEOUT_MS);

    video.addEventListener('seeked', onSeeked);

    try {
      video.currentTime = time;
    } catch {
      finish(null);
    }
  });
}

export async function extractFramesFromVideo(videoFile) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(videoFile);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let settled = false;
    const finish = (frames) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      URL.revokeObjectURL(url);
      resolve(frames);
    };

    // Absolute backstop: if neither onloadedmetadata nor onerror ever fires
    // (or a seek stalls past its own timeout), we still resolve.
    const guard = setTimeout(
      () => finish({ hookFrame: null, midFrame: null, endFrame: null }),
      EXTRACT_TIMEOUT_MS
    );

    video.onloadedmetadata = async () => {
      try {
        const duration = await resolveDuration(video);

        // Without a usable duration we can still grab an opening frame.
        const times = duration > 0
          ? [0.04, 0.45, 0.85].map((pct) => Math.min(duration * pct, Math.max(duration - 0.05, 0)))
          : [0.1, null, null];

        const hookFrame = await extractFrameAt(video, times[0]);
        const midFrame = times[1] === null ? null : await extractFrameAt(video, times[1]);
        const endFrame = times[2] === null ? null : await extractFrameAt(video, times[2]);
        finish({ hookFrame, midFrame, endFrame });
      } catch {
        finish({ hookFrame: null, midFrame: null, endFrame: null });
      }
    };

    video.onerror = () => {
      finish({ hookFrame: null, midFrame: null, endFrame: null });
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
  const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
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
        headers,
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
