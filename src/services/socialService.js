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
