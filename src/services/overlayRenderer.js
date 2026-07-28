// Single source of truth for rendering text overlays and captions onto a
// canvas. Used by BOTH the editor preview and the export pipeline so what
// you see is exactly what gets burned in.
//
// All spec coordinates are video-relative: x/y are fractions of video
// width/height (text anchor = center of the block), size is a fraction of
// video height. This makes the spec resolution-independent.

import { groupWordsIntoCaptions, getActiveCaption } from './captionUtils';

const BRAND_RED = '#E63329';

let textIdCounter = 0;

export function makeTextElement({ text = 'YOUR TEXT', x = 0.5, y = 0.5 } = {}) {
  return {
    id: `t-${++textIdCounter}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    x,
    y,
    size: 0.05,
    font: 'Bebas Neue',
    weight: 400, // Bebas Neue ships a single weight
    color: '#FFFFFF',
    bg: null,
    bgOpacity: 0.8,
    outline: { color: '#000000', width: 0.12 }, // width is a fraction of font size
    shadow: null, // { color, blur, dx, dy } as fractions of font size
    align: 'center', // 'left' | 'center' | 'right' — lines align within the block
    maxWidth: 0.9,
    start: 0,
    end: null, // null = until video end
  };
}

export function createDefaultSpec({ onScreenText = '', words = [], duration = null }) {
  return {
    version: 1,
    duration,
    texts: onScreenText
      ? [makeTextElement({ text: onScreenText, x: 0.5, y: 0.18 })]
      : [],
    captions: {
      enabled: words.length > 0,
      preset: 'outline', // 'outline' | 'block' | 'karaoke'
      size: 0.042,
      y: 0.72,
      font: 'DM Sans',
      weight: 800,
      lines: groupWordsIntoCaptions(words),
    },
  };
}

export async function ensureFontsLoaded() {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  try {
    await Promise.all([
      document.fonts.load("400 32px 'Bebas Neue'"),
      document.fonts.load("700 32px 'DM Sans'"),
      document.fonts.load("800 32px 'DM Sans'"),
      document.fonts.load("400 32px 'Archivo Black'"),
      document.fonts.load("400 32px 'Pacifico'"),
      document.fonts.load("700 32px 'Courier Prime'"),
      document.fonts.load("700 32px 'Caveat'"),
    ]);
  } catch {
    // canvas falls back to a default font — never block rendering on fonts
  }
}

function fontString(weight, px, family) {
  return `${weight} ${px}px '${family}', sans-serif`;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// Wraps text against maxWidthPx, honoring explicit newlines.
function wrapText(ctx, text, maxWidthPx) {
  const out = [];
  for (const paragraph of String(text).split('\n')) {
    const tokens = paragraph.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    for (const token of tokens) {
      const candidate = line ? `${line} ${token}` : token;
      if (line && ctx.measureText(candidate).width > maxWidthPx) {
        out.push(line);
        line = token;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function hexWithOpacity(hex, opacity) {
  const a = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

function isTextVisible(el, t) {
  if (t < (el.start ?? 0)) return false;
  if (el.end != null && t > el.end) return false;
  return true;
}

// Computes wrapped lines + pixel geometry for a text element.
export function layoutText(ctx, el, videoW, videoH) {
  const fontPx = el.size * videoH;
  ctx.font = fontString(el.weight, fontPx, el.font);
  const lines = wrapText(ctx, el.text, el.maxWidth * videoW);
  const lineHeight = fontPx * 1.2;
  const blockH = lines.length * lineHeight;
  const widths = lines.map((l) => ctx.measureText(l).width);
  const blockW = Math.max(...widths, 1);
  const cx = el.x * videoW;
  const cy = el.y * videoH;
  return { fontPx, lines, widths, lineHeight, blockW, blockH, cx, cy };
}

function drawTextElement(ctx, el, videoW, videoH) {
  const { fontPx, lines, widths, lineHeight, blockW, blockH, cx, cy } = layoutText(ctx, el, videoW, videoH);
  ctx.font = fontString(el.weight, fontPx, el.font);
  // Block stays anchored at el.x; lines align within it (undefined align →
  // center, pixel-identical to the pre-align behavior for existing specs).
  const align = el.align || 'center';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';

  const leftX = cx - blockW / 2;
  const rightX = cx + blockW / 2;
  const lineX = align === 'left' ? leftX : align === 'right' ? rightX : cx;

  const padX = fontPx * 0.32;
  const padY = fontPx * 0.14;

  lines.forEach((line, i) => {
    const lineY = cy - blockH / 2 + lineHeight * (i + 0.5);

    if (el.bg && line) {
      const bgX = align === 'left' ? leftX - padX
        : align === 'right' ? rightX - widths[i] - padX
        : cx - widths[i] / 2 - padX;
      ctx.fillStyle = hexWithOpacity(el.bg, el.bgOpacity ?? 0.8);
      roundRect(ctx, bgX, lineY - fontPx / 2 - padY, widths[i] + padX * 2, fontPx + padY * 2, fontPx * 0.22);
      ctx.fill();
    }

    if (el.shadow) {
      ctx.shadowColor = el.shadow.color;
      ctx.shadowBlur = (el.shadow.blur ?? 0.15) * fontPx;
      ctx.shadowOffsetX = (el.shadow.dx ?? 0) * fontPx;
      ctx.shadowOffsetY = (el.shadow.dy ?? 0.06) * fontPx;
    }

    if (el.outline) {
      ctx.strokeStyle = el.outline.color;
      ctx.lineWidth = Math.max(1, el.outline.width * fontPx);
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeText(line, lineX, lineY);
    }

    ctx.fillStyle = el.color;
    ctx.fillText(line, lineX, lineY);

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  });
}

function drawCaption(ctx, captions, t, videoW, videoH) {
  const active = getActiveCaption(captions.lines, t);
  if (!active) return;

  const fontPx = captions.size * videoH;
  const cy = captions.y * videoH;
  const cx = videoW / 2;
  ctx.font = fontString(captions.weight, fontPx, captions.font);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const text = active.line.text.toUpperCase();

  if (captions.preset === 'block') {
    const w = ctx.measureText(text).width;
    const padX = fontPx * 0.4;
    const padY = fontPx * 0.22;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    roundRect(ctx, cx - w / 2 - padX, cy - fontPx / 2 - padY, w + padX * 2, fontPx + padY * 2, fontPx * 0.25);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(text, cx, cy);
    return;
  }

  if (captions.preset === 'karaoke') {
    const wordsUpper = active.line.words.map((w) => w.w.toUpperCase());
    const spaceW = ctx.measureText(' ').width;
    const wordWidths = wordsUpper.map((w) => ctx.measureText(w).width);
    const totalW = wordWidths.reduce((a, b) => a + b, 0) + spaceW * (wordsUpper.length - 1);
    let x = cx - totalW / 2;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(1, fontPx * 0.18);
    ctx.textAlign = 'left';
    wordsUpper.forEach((word, i) => {
      ctx.strokeText(word, x, cy);
      ctx.fillStyle = i === active.activeWordIndex ? BRAND_RED : '#FFFFFF';
      ctx.fillText(word, x, cy);
      x += wordWidths[i] + spaceW;
    });
    ctx.textAlign = 'center';
    return;
  }

  // 'outline' — bold white with heavy black stroke (classic TikTok look)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(1, fontPx * 0.2);
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(text, cx, cy);
}

export function drawOverlays(ctx, spec, currentTime, videoW, videoH) {
  if (!spec) return;
  ctx.save();
  for (const el of spec.texts || []) {
    if (el.text && isTextVisible(el, currentTime)) {
      drawTextElement(ctx, el, videoW, videoH);
    }
  }
  if (spec.captions?.enabled && spec.captions.lines?.length) {
    drawCaption(ctx, spec.captions, currentTime, videoW, videoH);
  }
  ctx.restore();
}

// Pixel-space bounding boxes for text elements — used by the editor stage
// for hit-testing and selection rectangles. Includes all elements regardless
// of their time range so off-screen-in-time elements stay selectable.
export function getTextBounds(ctx, spec, videoW, videoH) {
  const bounds = [];
  ctx.save();
  for (const el of spec?.texts || []) {
    if (!el.text) continue;
    const { fontPx, blockW, blockH, cx, cy } = layoutText(ctx, el, videoW, videoH);
    const padX = fontPx * 0.35;
    const padY = fontPx * 0.2;
    bounds.push({
      id: el.id,
      x: cx - blockW / 2 - padX,
      y: cy - blockH / 2 - padY,
      w: blockW + padX * 2,
      h: blockH + padY * 2,
    });
  }
  ctx.restore();
  return bounds;
}
