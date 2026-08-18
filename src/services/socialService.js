// Storage upload + Zernio read APIs (history, accounts). Publishing itself is
// server-side now — see services/publishJobs.js, which uploads via
// uploadVideo() and hands the rest to the publishJobWorker Cloud Function.
//
// The media is uploaded DIRECTLY from the browser to Firebase Storage (no
// Cloud Function size cap, so long videos work — limited only by each
// platform's own ceiling).
//
// platforms is an array of: 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'x' | 'linkedin'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, ensureAuth } from './firebase';
import { authHeaders } from './userKeys';

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

  // A resumable upload can die outright (the whole session drops) on a flaky
  // mobile connection — the SDK's internal chunk retries can't resurrect a dead
  // session. Retry the upload once from scratch before surfacing an error.
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0 && onProgress) onProgress(0); // reset the bar for the retry
    // Fresh path per attempt so a partially-written object is never reused.
    const path = `social-posts/${Date.now()}-${safeName}`;
    const task = uploadBytesResumable(ref(storage, path), videoFile, {
      contentType: videoFile.type || 'video/mp4',
    });

    try {
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
    } catch (err) {
      lastErr = err;
    }
  }

  // Give the common failure a message the user can act on instead of the raw
  // Firebase code.
  const code = lastErr?.code || '';
  if (code === 'storage/retry-limit-exceeded' || code === 'storage/canceled') {
    throw new Error(
      'The upload kept dropping — this is usually a slow or unstable connection with a large video. ' +
        'Try Wi-Fi or a shorter / lower-resolution clip, then tap Post again.'
    );
  }
  throw lastErr || new Error('Upload failed — please try again.');
}

// A fetch() that rejects outright produced messages like Safari's bare "Load
// failed", which says nothing about what broke. The usual cause is the Cloud
// Function being killed at its own timeout before it answers: no status, no
// body, just a dropped connection. Name that, so the message is actionable.
async function apiFetch(path, label) {
  let response;
  try {
    response = await fetch(path, { headers: await authHeaders() });
  } catch (e) {
    throw new Error(
      `Couldn't reach the server (${label}). It may have timed out or you may be offline — tap Retry.`
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Failed to load ${label} (${response.status})`);
  }
  return data;
}

// Fetches normalized post history from Zernio via the postHistory function.
// Returns { configured, posts: [{id, status, caption, platforms, mediaUrls, date, errors}], error? }
export async function getPostHistory() {
  return apiFetch('/api/history', 'history');
}

// Fetches which social accounts are connected in Zernio.
// Returns { configured, connected: [ids], displayNames: [{platform, displayName}], error? }
export async function getConnectedAccounts() {
  return apiFetch('/api/accounts', 'accounts');
}
