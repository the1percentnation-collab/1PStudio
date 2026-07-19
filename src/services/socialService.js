// Publishes a video + caption to the selected social platforms.
//
// The video is uploaded DIRECTLY from the browser to Firebase Storage (no
// Cloud Function size cap, so long videos work — limited only by each
// platform's own ceiling), then the resulting URL is handed to the
// Zernio-backed publishPost function which posts to every platform.
//
// platforms is an array of: 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'x' | 'linkedin'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, ensureAuth, FUNCTIONS_ORIGIN } from './firebase';

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
// The render is requested on the function's OWN URL, not the Hosting /api
// proxy: Hosting kills proxied responses at 60s, and once the request drops
// Cloud Run throttles the instance's CPU to near-zero — the encode stalls and
// the output never appears (the old "post without captions" bug). The direct
// request stays open (CPU allocated) for the full 540s function timeout.
//
// The Hosting route + Storage polling remain as fallbacks for when the direct
// URL is unreachable or a response dies mid-flight: the job id fixes the
// output path (rendered/<jobId>.mp4) so the browser can find the result.
async function requestRender(endpoint, body) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return { ok: true, data }; // { status, videoUrl, rendered }
    return { ok: false, status: response.status, message: data?.error || `Render failed (${response.status})` };
  } catch {
    // Network-level death (Safari "Load failed") — no response at all.
    return { ok: false };
  }
}

export async function renderOverlays(videoUrl, spec) {
  await ensureAuth();
  const jobId =
    (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const body = JSON.stringify({ videoUrl, spec, jobId });

  const direct = await requestRender(`${FUNCTIONS_ORIGIN}/renderOverlays`, body);
  if (direct.ok) return direct.data;
  // Any real response from the function itself is the render's true outcome —
  // retrying through Hosting would just re-fail after another long wait.
  if (direct.message) throw new Error(direct.message);

  const viaHosting = await requestRender('/api/render', body);
  if (viaHosting.ok) return viaHosting.data;
  // Real validation/render error (4xx) — polling won't help. A 5xx here is
  // Hosting's 60s cutoff, not the render's outcome, so keep waiting.
  if (viaHosting.message && viaHosting.status < 500) throw new Error(viaHosting.message);

  // A response died mid-flight but the render may still be running — poll for
  // the output. Deadline exceeds the function's 540s timeout.
  const outRef = ref(storage, `rendered/${jobId}.mp4`);
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const url = await getDownloadURL(outRef);
      return { status: 'ok', videoUrl: url, rendered: true };
    } catch {
      // not ready yet — keep waiting
    }
  }
  throw new Error('The caption render never finished.');
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
  // published clip carries them. Burn-in was explicitly requested, so a failed
  // render STOPS the publish — a bare video that's already live on five
  // platforms can't be unposted, but a failed attempt can simply be retried.
  if (burnIn && spec && mediaType === 'video') {
    onPhase?.('rendering');
    let rendered = null;
    let renderError = null;
    try {
      rendered = await renderOverlays(mediaUrl, spec);
    } catch (err) {
      renderError = err?.message || 'render failed';
    }
    // rendered:false from the server means it found nothing to draw even
    // though the caller sent burnable text — treat that as a failure too.
    if (!renderError && (!rendered?.videoUrl || rendered.rendered === false)) {
      renderError = 'the server returned the video without the text burned in';
    }
    if (renderError) {
      const e = new Error(
        `Couldn't burn the on-screen text & captions into the video (${renderError}). ` +
          'Nothing was posted. Try again, or uncheck "Burn on-screen text & captions" to post the original video.'
      );
      e.renderFailed = true;
      throw e;
    }
    mediaUrl = rendered.videoUrl;
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
  return data;
}
