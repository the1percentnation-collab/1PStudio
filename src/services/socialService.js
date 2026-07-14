// Publishes a video + caption to the selected social platforms.
//
// The video is uploaded DIRECTLY from the browser to Firebase Storage (no
// Cloud Function size cap, so long videos work — limited only by each
// platform's own ceiling), then the resulting URL is handed to the
// Ayrshare-backed publishPost function which posts to every platform.
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

// Channels that accept a photo (image) post. YouTube is video-only, so it is
// excluded here even though it appears in SOCIAL_PLATFORMS for video posts.
export const PHOTO_PLATFORMS = [
  { id: 'tiktok', label: 'TikTok' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'x', label: 'X' },
  { id: 'linkedin', label: 'LinkedIn' },
];

// Uploads a media file (video or image) to Storage and returns a public
// download URL. onProgress receives a 0..1 fraction.
export async function uploadMedia(mediaFile, onProgress) {
  await ensureAuth();

  const safeName = mediaFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `social-posts/${Date.now()}-${safeName}`;
  const task = uploadBytesResumable(ref(storage, path), mediaFile, {
    contentType: mediaFile.type || 'application/octet-stream',
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

// Backwards-compatible alias for the video upload path.
export const uploadVideo = uploadMedia;

// Fetches which social accounts are connected in Ayrshare.
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

// Publishes a photo + caption to the selected social platforms. Mirrors
// publishToSocial but uploads an image and flags the post as a non-video so
// Ayrshare treats the media as an image.
export async function publishPhotoPost(imageFile, { post, title, platforms, scheduleDate, onProgress }) {
  if (!imageFile) {
    throw new Error('Add a photo to publish an image post.');
  }
  if (!imageFile.type || !imageFile.type.startsWith('image/')) {
    throw new Error('The attached file is not an image.');
  }
  if (!platforms || platforms.length === 0) {
    throw new Error('Select at least one platform to post to.');
  }
  if (!post || !post.trim()) {
    throw new Error('Caption is required to publish.');
  }

  const mediaUrl = await uploadMedia(imageFile, onProgress);

  const response = await fetch('/api/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mediaUrl, post, title, platforms, scheduleDate, isVideo: false }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Publish failed (${response.status})`);
  }
  return data;
}
