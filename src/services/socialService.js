// Publishes a video + caption to the selected social platforms via the
// Ayrshare-backed Cloud Function (see functions/src/index.ts -> publishPost).
//
// platforms is an array of: 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'x' | 'linkedin'

export const SOCIAL_PLATFORMS = [
  { id: 'tiktok', label: 'TikTok' },
  { id: 'instagram', label: 'Instagram Reels' },
  { id: 'youtube', label: 'YouTube Shorts' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'x', label: 'X' },
  { id: 'linkedin', label: 'LinkedIn' },
];

export async function publishToSocial(videoFile, { post, title, platforms }) {
  if (!videoFile) {
    throw new Error('No video file is attached to this card — regenerate it from an upload to enable posting.');
  }
  if (!platforms || platforms.length === 0) {
    throw new Error('Select at least one platform to post to.');
  }
  if (!post || !post.trim()) {
    throw new Error('Caption is required to publish.');
  }

  const form = new FormData();
  form.append('meta', JSON.stringify({ post, title, platforms }));
  form.append('video', videoFile, videoFile.name);

  const response = await fetch('/api/publish', {
    method: 'POST',
    body: form,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Publish failed (${response.status})`);
  }
  return data;
}
