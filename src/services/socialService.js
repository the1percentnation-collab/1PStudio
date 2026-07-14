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

// Fetches which social accounts are connected in Zernio.
export async function getConnectedAccounts() {
  const response = await fetch('/api/accounts');
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Failed to load accounts (${response.status})`);
  }
  return data; // { configured, connected: [ids], displayNames: [{platform, displayName}], error? }
}

export async function publishToSocial(videoFile, { post, title, platforms, scheduleDate, onProgress }) {
  if (!videoFile) {
    throw new Error('No video file is attached to this card — regenerate it from an upload to enable posting.');
  }
  if (!platforms || platforms.length === 0) {
    throw new Error('Select at least one platform to post to.');
  }
  if (!post || !post.trim()) {
    throw new Error('Caption is required to publish.');
  }

  const mediaUrl = await uploadVideo(videoFile, onProgress);
  return publishByUrl(mediaUrl, { post, title, platforms, scheduleDate });
}

// Publishes an already-hosted video URL (e.g. a Higgsfield-generated or
// imported clip that already lives in Storage) — no browser upload needed.
export async function publishByUrl(mediaUrl, { post, title, platforms, scheduleDate }) {
  if (!mediaUrl) {
    throw new Error('No video URL to publish.');
  }
  if (!platforms || platforms.length === 0) {
    throw new Error('Select at least one platform to post to.');
  }
  if (!post || !post.trim()) {
    throw new Error('Caption is required to publish.');
  }

  const response = await fetch('/api/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mediaUrl, post, title, platforms, scheduleDate }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Publish failed (${response.status})`);
  }
  return data;
}
