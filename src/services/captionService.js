// Uploads a video, then asks the captionVideo function to auto-transcribe it
// (Deepgram) and burn word-synced captions into the video with ffmpeg.
import { uploadVideo } from './socialService';

export const CAPTION_STYLES = [
  { id: 'bold', label: 'Bold', desc: 'Big all-caps, thick outline' },
  { id: 'classic', label: 'Classic', desc: 'Clean lower-third subtitles' },
  { id: 'minimal', label: 'Minimal', desc: 'Smaller, subtle' },
];

export async function renderCaptions(videoFile, style, onProgress) {
  if (!videoFile) throw new Error('Choose a video to caption.');

  const mediaUrl = await uploadVideo(videoFile, onProgress);

  const response = await fetch('/api/caption', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mediaUrl, style }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Caption render failed (${response.status})`);
  }
  return data; // { videoUrl, wordCount }
}
