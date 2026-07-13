import { uploadVideo } from './socialService';

// Transcribes an already-uploaded video URL via the Deepgram-backed function.
// Returns { text, words, configured } where words is [{ w, s, e }] (word,
// start/end seconds) — empty when transcription isn't configured/available.
// `configured` is false when the server has no Deepgram key. The word timings
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
    configured: data.configured !== false,
  };
}

// Uploads a video File and transcribes it — used by the editor's "Generate
// captions" retry. Returns { text, words, configured }. Throws with a clear
// message when Deepgram isn't configured so the UI can explain it.
export async function transcribeUploadedFile(videoFile, onProgress) {
  const mediaUrl = await uploadVideo(videoFile, (p) =>
    onProgress?.(`Uploading… ${Math.round(p * 100)}%`)
  );
  onProgress?.('Transcribing…');
  const t = await transcribeVideo(mediaUrl);
  if (!t.configured) {
    const err = new Error('Transcription isn’t configured on the server (Deepgram key missing).');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }
  if (!t.words.length) {
    const err = new Error('No speech was detected in this video, so there are no captions to sync.');
    err.code = 'NO_SPEECH';
    throw err;
  }
  return t;
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
  // durable Storage URL of the uploaded video — lets the Library re-post later
  let uploadedUrl = null;
  // 'skipped' when a manual transcript was supplied; otherwise reflects the
  // transcription attempt so the editor can explain missing captions.
  let captionsStatus = finalTranscript ? 'skipped' : 'ok';
  if (!finalTranscript) {
    try {
      uploadedUrl = await uploadVideo(videoFile, (p) =>
        onProgress(`Uploading for analysis… ${Math.round(p * 100)}%`)
      );
      onProgress('Transcribing audio…');
      const t = await transcribeVideo(uploadedUrl);
      finalTranscript = t.text;
      words = t.words;
      if (!t.configured) captionsStatus = 'not_configured';
      else if (!t.words.length) captionsStatus = 'no_speech';
    } catch {
      /* no transcript available — fall back to frames only */
      captionsStatus = 'failed';
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
  return { content, frames, transcript: finalTranscript, words, captionsStatus, mediaUrl: uploadedUrl };
}
