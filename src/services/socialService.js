// Publishes a video + caption to the selected social platforms.
//
// The video is uploaded DIRECTLY from the browser to Firebase Storage (no
// Cloud Function size cap, so long videos work — limited only by each
// platform's own ceiling), then the resulting URL is handed to the
// Zernio-backed publishPost function which posts to every platform.
//
// platforms is an array of: 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'x' | 'linkedin'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, ensureAuth } from './firebase';

export const SOCIAL_PLATFORMS = [
  { id: 'tiktok', label: 'TikTok' },
  { id: 'instagram', label: 'Instagram Reels' },
  { id: 'youtube', label: 'YouTube Shorts' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'x', label: 'X' },
  { id: 'linkedin', label: 'LinkedIn' },
];

// Uploads the video to Storage and returns a public download URL.
// onProgress receives a 0..1 fraction.
export async function uploadVideo(videoFile, onProgress) {
  await ensureAuth();

  const safeName = videoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `social-posts/${Date.now()}-${safeName}`;
  const task = uploadBytesResumable(ref(storage, path), videoFile, {
    contentType: videoFile.type || 'video/mp4',
  });

  await new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        if (onProgress && snap.totalBytes) {
          onProgress(snap.bytesTransferred / snap.totalBytes);
        }
      },
      reject,
      resolve
    );
  });

  return getDownloadURL(task.snapshot.ref);
}

// Fetches normalized post history from Zernio via the postHistory function.
// Returns { configured, posts: [{id, status, caption, platforms, mediaUrls, date, errors}], error? }
export async function getPostHistory() {
  const response = await fetch('/api/history');
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Failed to load history (${response.status})`);
  }
  return data;
}

// Fetches which social accounts are connected in Zernio.
export async function getConnectedAccounts() {
  const response = await fetch('/api/accounts');
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Failed to load accounts (${response.status})`);
  }
  return data; // { configured, connected: [ids], displayNames: [{platform, displayName}], error? }
}

// Server-side burns the editor's on-screen text + captions (the overlay spec)
// into the video with ffmpeg and returns a new download URL to post.
//
// Hosting caps the HTTP response at 60s but the render keeps running server-
// side, so we pass a job id that fixes the output path (rendered/<jobId>.mp4)
// and, if the response dies or 5xxs, poll Storage until the file appears.
export async function renderOverlays(videoUrl, spec) {
  await ensureAuth();
  const jobId =
    (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  let hardError = null;
  try {
    const response = await fetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl, spec, jobId }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data; // { status, videoUrl, rendered }
    if (response.status < 500) {
      // Real validation/render error — polling won't help.
      hardError = new Error(data?.error || `Render failed (${response.status})`);
    }
  } catch {
    // Network-level death (Safari "Load failed") — fall through to polling.
  }
  if (hardError) throw hardError;

  const outRef = ref(storage, `rendered/${jobId}.mp4`);
  const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const url = await getDownloadURL(outRef);
      return { status: 'ok', videoUrl: url, rendered: true };
    } catch {
      // not ready yet — keep waiting
    }
  }
  throw new Error('Caption render timed out — the original video will be posted instead.');
}

export async function publishToSocial(mediaFile, { post, title, platforms, scheduleDate, onProgress, onPhase, spec, burnIn }) {
  if (!mediaFile) {
    throw new Error('No media file is attached to this card — regenerate it from an upload to enable posting.');
  }
  if (!platforms || platforms.length === 0) {
    throw new Error('Select at least one platform to post to.');
  }
  if (!post || !post.trim()) {
    throw new Error('Caption is required to publish.');
  }

  const mediaType = mediaFile.type?.startsWith('image/') ? 'photo' : 'video';
  let mediaUrl = await uploadVideo(mediaFile, onProgress);

  // Burn the on-screen text + captions into the video before posting so the
  // published clip carries them. If the render fails (e.g. very long video hits
  // the hosting timeout), fall back to posting the original and warn.
  let renderWarning = null;
  if (burnIn && spec && mediaType === 'video') {
    onPhase?.('rendering');
    try {
      const rendered = await renderOverlays(mediaUrl, spec);
      if (rendered?.videoUrl) mediaUrl = rendered.videoUrl;
    } catch (err) {
      renderWarning = err?.message || 'Could not render captions.';
    }
  }

  onPhase?.('publishing');
  const response = await fetch('/api/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mediaUrl, post, title, platforms, scheduleDate, mediaType }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Publish failed (${response.status})`);
  }
  return { ...data, renderWarning };
}
