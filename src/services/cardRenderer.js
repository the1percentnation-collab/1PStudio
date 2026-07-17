// Renders an Instagram-style text card (background + styled text) to a JPEG
// File, sharing one paint path between the creator's live preview and the
// final export so what you see is exactly what gets posted.
import { drawOverlays, ensureFontsLoaded } from './overlayRenderer';

export const CARD_PRESETS = {
  story:    { w: 1080, h: 1920, label: 'STORY 9:16' },
  portrait: { w: 1080, h: 1350, label: 'PORTRAIT 4:5' },
  square:   { w: 1080, h: 1080, label: 'SQUARE 1:1' },
};

export const SOLID_BGS = ['#0A0A0A', '#111111', '#E60306', '#FFFFFF', '#FFC107', '#1E3A8A'];

export const GRADIENTS = [
  { id: 'brand',    stops: ['#E60306', '#5A0102'] },
  { id: 'sunset',   stops: ['#F58529', '#DD2A7B', '#8134AF'] },
  { id: 'midnight', stops: ['#0F0C29', '#302B63', '#24243E'] },
  { id: 'ocean',    stops: ['#0575E6', '#021B79'] },
  { id: 'ember',    stops: ['#1A1A1A', '#E60306'] },
];

// background: { type: 'solid', color } | { type: 'gradient', stops: [...] }
export function paintBackground(ctx, background, W, H) {
  if (background?.type === 'gradient' && Array.isArray(background.stops) && background.stops.length > 1) {
    const g = ctx.createLinearGradient(0, 0, W, H); // fixed diagonal, matches CSS 135deg swatches
    const n = background.stops.length;
    background.stops.forEach((color, i) => g.addColorStop(n === 1 ? 0 : i / (n - 1), color));
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = background?.color || '#0A0A0A';
  }
  ctx.fillRect(0, 0, W, H);
}

// Rasterizes the card at full resolution and returns a JPEG File ready for
// the upload pipeline (it flows through exactly like a dropped photo).
export async function renderTextCard({ width, height, background, textEl }) {
  await ensureFontsLoaded();

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  paintBackground(ctx, background, width, height);
  drawOverlays(ctx, { texts: [textEl], captions: { enabled: false } }, 0, width, height);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not render the image — try a smaller canvas size.'))),
      'image/jpeg',
      0.9
    );
  });

  return new File([blob], `text-post-${Date.now()}.jpg`, { type: 'image/jpeg' });
}
