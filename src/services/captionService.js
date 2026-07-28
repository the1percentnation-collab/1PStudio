// Uploads a video, then asks the captionVideo function to auto-transcribe it
// (Deepgram) and burn word-synced captions into the video with ffmpeg.
import { uploadVideo } from './socialService';
import { FUNCTIONS_ORIGIN } from './firebase';
import { authHeaders } from './userKeys';

export const CAPTION_STYLES = [
  { id: 'bold', label: 'Bold', desc: 'Big all-caps, thick outline' },
  { id: 'classic', label: 'Classic', desc: 'Clean lower-third subtitles' },
  { id: 'minimal', label: 'Minimal', desc: 'Smaller, subtle' },
];

export async function renderCaptions(videoFile, style, onProgress) {
  if (!videoFile) throw new Error('Choose a video to caption.');

  const mediaUrl = await uploadVideo(videoFile, onProgress);
  const body = JSON.stringify({ mediaUrl, style });
  const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };

  // Call the function's own URL: the Hosting /api proxy kills responses at
  // 60s, far too short for transcribe + ffmpeg on a real video. Fall back to
  // the Hosting route if the direct URL is unreachable.
  let response;
  try {
    response = await fetch(`${FUNCTIONS_ORIGIN}/captionVideo`, {
      method: 'POST',
      headers,
      body,
    });
  } catch {
    response = await fetch('/api/caption', {
      method: 'POST',
      headers,
      body,
    });
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Caption render failed (${response.status})`);
  }
  return data; // { videoUrl, wordCount }
}
