// Per-seek timeout. Some clips (phone .mov / HEVC especially) never fire the
// 'seeked' event, so we must not wait on it forever — resolve null instead.
const SEEK_TIMEOUT_MS = 4000;
// Overall guard: if metadata never loads or extraction stalls, give up so the
// pipeline can continue with whatever frames it has (or none).
const EXTRACT_TIMEOUT_MS = 15000;

function extractFrameAt(video, pct) {
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
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
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
      video.currentTime = (video.duration || 0) * pct;
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
        const hookFrame = await extractFrameAt(video, 0.04);
        const midFrame  = await extractFrameAt(video, 0.45);
        const endFrame  = await extractFrameAt(video, 0.85);
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

export async function generateTikTokContent(videoFile, onProgress, transcript = '') {
  onProgress('Extracting frames...');

  let frames = { hookFrame: null, midFrame: null, endFrame: null };
  try {
    frames = await extractFramesFromVideo(videoFile);
  } catch {
    /* non-fatal */
  }

  onProgress('Analyzing with Claude...');

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frames, transcript, filename: videoFile.name }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error || `API error ${response.status}`);
  }

  onProgress('Parsing response...');
  return await response.json();
}
