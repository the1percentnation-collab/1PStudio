import React, { useState, useEffect, useCallback, useRef } from 'react';
import { makeTextElement, ensureFontsLoaded, drawOverlays, getTextBounds, layoutText } from '../services/overlayRenderer';
import { CARD_PRESETS, SOLID_BGS, GRADIENTS, paintBackground, renderTextCard } from '../services/cardRenderer';

// Instagram-Stories-style text post creator: pick a background, type styled
// text, drag it into place, and CREATE renders a full-res JPEG that flows
// through the normal photo pipeline (analysis -> card -> publish).

const FONTS = [
  { family: 'Bebas Neue', weight: 400 },
  { family: 'Archivo Black', weight: 400 },
  { family: 'DM Sans', weight: 800 },
  { family: 'Pacifico', weight: 400 },
  { family: 'Courier Prime', weight: 700 },
  { family: 'Caveat', weight: 700 },
];

const TEXT_SWATCHES = ['#FFFFFF', '#000000', '#E60306', '#FFC107'];

const labelStyle = {
  display: 'block',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.12em',
  color: '#666',
  textTransform: 'uppercase',
  marginBottom: 8,
};

const rowStyle = { marginBottom: 18 };

// Perceived luminance — picks a contrasting pill color for the text bg.
function isLight(hex) {
  const n = parseInt(hex.slice(1, 7), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

function Chip({ active, onClick, children, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#E6030622' : '#111',
        border: `1px solid ${active ? '#E60306' : '#333'}`,
        color: active ? '#FFF' : '#999',
        fontSize: 12,
        fontWeight: 600,
        padding: '7px 12px',
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'all 0.15s',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Swatch({ color, gradient, active, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label={gradient ? 'gradient background' : color}
      style={{
        width: 26,
        height: 26,
        borderRadius: '50%',
        background: gradient ? `linear-gradient(135deg, ${gradient.join(', ')})` : color,
        border: active ? '2px solid #E60306' : '2px solid #333',
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
      }}
    />
  );
}

export default function TextPostCreator({ onCreate, onClose }) {
  const [preset, setPreset] = useState('portrait');
  const [background, setBackground] = useState({ type: 'solid', color: '#0A0A0A' });
  const [textEl, setTextEl] = useState(() => ({
    ...makeTextElement({ text: '', x: 0.5, y: 0.5 }),
    size: 0.07,
    outline: null,
    align: 'center',
  }));
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [fontTick, setFontTick] = useState(0);
  const [overflow, setOverflow] = useState(false);
  const [containerSize, setContainerSize] = useState(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const textRef = useRef(textEl);
  textRef.current = textEl;

  const patch = useCallback((p) => setTextEl((t) => ({ ...t, ...p })), []);
  const dims = CARD_PRESETS[preset];

  // --- modal behaviors (copied from VideoEditorModal) ---
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // redraw once webfonts arrive so the preview never sticks with a fallback
  useEffect(() => {
    let live = true;
    ensureFontsLoaded().then(() => { if (live) setFontTick((t) => t + 1); });
    return () => { live = false; };
  }, [textEl.font]);

  // container size for letterbox math
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // --- static preview redraw (same paint path as export) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    paintBackground(ctx, background, canvas.width, canvas.height);
    if (textEl.text) {
      drawOverlays(ctx, { texts: [textEl], captions: { enabled: false } }, 0, canvas.width, canvas.height);
      const { blockH } = layoutText(ctx, textEl, canvas.width, canvas.height);
      setOverflow(blockH > 0.92 * canvas.height);
    } else {
      setOverflow(false);
    }
  }, [textEl, background, preset, fontTick, containerSize]);

  // --- drag to reposition (EditorStage pattern) ---
  const toCanvasCoords = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }, []);

  const handlePointerDown = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas || !textRef.current.text) return;
    const { x, y } = toCanvasCoords(e);
    const ctx = canvas.getContext('2d');
    const hit = getTextBounds(ctx, { texts: [textRef.current] }, canvas.width, canvas.height)
      .find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (hit) {
      dragRef.current = {
        offsetX: x / canvas.width - textRef.current.x,
        offsetY: y / canvas.height - textRef.current.y,
      };
      canvas.setPointerCapture(e.pointerId);
    }
  }, [toCanvasCoords]);

  const handlePointerMove = useCallback((e) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const { x, y } = toCanvasCoords(e);
    patch({
      x: Math.min(0.95, Math.max(0.05, x / canvas.width - drag.offsetX)),
      y: Math.min(0.95, Math.max(0.05, y / canvas.height - drag.offsetY)),
    });
  }, [toCanvasCoords, patch]);

  const handlePointerUp = useCallback((e) => {
    dragRef.current = null;
    canvasRef.current?.releasePointerCapture?.(e.pointerId);
  }, []);

  // --- create ---
  const canCreate = textEl.text.trim().length > 0 && !creating;
  const handleCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    setCreateError(null);
    try {
      const file = await renderTextCard({ width: dims.w, height: dims.h, background, textEl });
      onCreate(file);
      onClose();
    } catch (err) {
      setCreateError(err.message || 'Could not create the image.');
      setCreating(false);
    }
  };

  // letterboxed display rect
  let displayW = 0;
  let displayH = 0;
  if (containerSize) {
    const scale = Math.min(containerSize.w / dims.w, containerSize.h / dims.h);
    displayW = Math.floor(dims.w * scale);
    displayH = Math.floor(dims.h * scale);
  }

  const bgIsGradient = background.type === 'gradient';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#0A0A0A', display: 'flex', flexDirection: 'column' }}>
      {/* HEADER */}
      <div style={{ height: 56, display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px', borderBottom: '1px solid #1A1A1A', flexShrink: 0 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: '0.04em' }}>
          <span style={{ color: '#E60306' }}>TEXT</span>
          <span style={{ color: '#FFF', marginLeft: 6 }}>POST</span>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ width: 32, height: 32, borderRadius: 8, background: '#1A1A1A', border: '1px solid #333', color: '#CCC', fontSize: 15, cursor: 'pointer' }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#E60306')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#333')}
        >
          ✕
        </button>
      </div>

      {/* BODY */}
      <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: 0 }}>
        {/* STAGE */}
        <div ref={containerRef} style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, position: 'relative' }}>
          <div style={{ position: 'relative', width: displayW, height: displayH }}>
            <canvas
              ref={canvasRef}
              width={dims.w}
              height={dims.h}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={{ width: displayW, height: displayH, borderRadius: 12, display: 'block', touchAction: 'none', cursor: textEl.text ? 'move' : 'default' }}
            />
            {!textEl.text && displayW > 0 && (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                color: bgIsGradient || !isLight(background.color || '#0A0A0A') ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)',
                fontSize: 15,
                textAlign: 'center',
                padding: 20,
              }}>
                Type your text in the panel {isMobile ? 'below' : '→'}
              </div>
            )}
          </div>
        </div>

        {/* CONTROLS */}
        <div style={{
          width: isMobile ? '100%' : 320,
          maxHeight: isMobile ? '48%' : 'none',
          borderLeft: isMobile ? 'none' : '1px solid #1A1A1A',
          borderTop: isMobile ? '1px solid #1A1A1A' : 'none',
          background: '#111',
          overflowY: 'auto',
          padding: 18,
          flexShrink: 0,
          boxSizing: 'border-box',
        }}>
          {/* SIZE PRESET */}
          <div style={rowStyle}>
            <span style={labelStyle}>Canvas</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(CARD_PRESETS).map(([id, p]) => (
                <Chip key={id} active={preset === id} onClick={() => setPreset(id)}>{p.label}</Chip>
              ))}
            </div>
          </div>

          {/* BACKGROUND */}
          <div style={rowStyle}>
            <span style={labelStyle}>Background</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              {SOLID_BGS.map((c) => (
                <Swatch
                  key={c}
                  color={c}
                  active={!bgIsGradient && background.color === c}
                  onClick={() => setBackground({ type: 'solid', color: c })}
                />
              ))}
              <input
                type="color"
                value={bgIsGradient ? '#0A0A0A' : background.color}
                onChange={(e) => setBackground({ type: 'solid', color: e.target.value })}
                aria-label="Custom background color"
                style={{ width: 26, height: 26, padding: 0, border: '2px solid #333', borderRadius: '50%', background: 'transparent', cursor: 'pointer' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {GRADIENTS.map((g) => (
                <Swatch
                  key={g.id}
                  gradient={g.stops}
                  active={bgIsGradient && background.stops === g.stops}
                  onClick={() => setBackground({ type: 'gradient', stops: g.stops })}
                />
              ))}
            </div>
          </div>

          {/* TEXT */}
          <div style={rowStyle}>
            <span style={labelStyle}>Text</span>
            <textarea
              value={textEl.text}
              onChange={(e) => patch({ text: e.target.value })}
              rows={3}
              placeholder="Type something…"
              autoFocus={!isMobile}
              style={{
                width: '100%',
                background: '#0A0A0A',
                border: '1px solid #2A2A2A',
                borderRadius: 8,
                color: '#DDD',
                fontSize: 13,
                lineHeight: 1.5,
                padding: '10px 12px',
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* FONT */}
          <div style={rowStyle}>
            <span style={labelStyle}>Font</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {FONTS.map(({ family, weight }) => {
                const active = textEl.font === family;
                return (
                  <button
                    key={family}
                    onClick={() => patch({ font: family, weight })}
                    style={{
                      background: active ? '#E6030622' : '#0A0A0A',
                      border: `1px solid ${active ? '#E60306' : '#2A2A2A'}`,
                      borderRadius: 8,
                      padding: '8px 10px',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontFamily: `'${family}', sans-serif`, fontWeight: weight, fontSize: 17, color: '#FFF', lineHeight: 1.2 }}>Aa</div>
                    <div style={{ fontSize: 9, color: active ? '#E60306' : '#666', marginTop: 3, letterSpacing: '0.04em' }}>{family}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SIZE */}
          <div style={rowStyle}>
            <span style={labelStyle}>Size</span>
            <input
              type="range"
              min={0.03}
              max={0.14}
              step={0.002}
              value={textEl.size}
              onChange={(e) => patch({ size: parseFloat(e.target.value) })}
              style={{ width: '100%', accentColor: '#E60306' }}
            />
          </div>

          {/* TEXT COLOR */}
          <div style={rowStyle}>
            <span style={labelStyle}>Text Color</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {TEXT_SWATCHES.map((c) => (
                <Swatch key={c} color={c} active={textEl.color === c} onClick={() => patch({ color: c })} />
              ))}
              <input
                type="color"
                value={textEl.color}
                onChange={(e) => patch({ color: e.target.value })}
                aria-label="Custom text color"
                style={{ width: 26, height: 26, padding: 0, border: '2px solid #333', borderRadius: '50%', background: 'transparent', cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* ALIGNMENT */}
          <div style={rowStyle}>
            <span style={labelStyle}>Alignment</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {['left', 'center', 'right'].map((a) => (
                <Chip key={a} active={(textEl.align || 'center') === a} onClick={() => patch({ align: a })} style={{ flex: 1, textTransform: 'capitalize' }}>
                  {a}
                </Chip>
              ))}
            </div>
          </div>

          {/* STYLE TOGGLES */}
          <div style={rowStyle}>
            <span style={labelStyle}>Style</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Chip
                active={!!textEl.bg}
                onClick={() => patch({ bg: textEl.bg ? null : (isLight(textEl.color) ? '#000000' : '#FFFFFF') })}
              >
                Pill
              </Chip>
              <Chip
                active={!!textEl.outline}
                onClick={() => patch({ outline: textEl.outline ? null : { color: '#000000', width: 0.12 } })}
              >
                Outline
              </Chip>
              <Chip
                active={!!textEl.shadow}
                onClick={() => patch({ shadow: textEl.shadow ? null : { color: 'rgba(0,0,0,0.55)', blur: 0.18, dx: 0, dy: 0.06 } })}
              >
                Shadow
              </Chip>
            </div>
          </div>

          {overflow && (
            <div style={{ fontSize: 11, color: '#FFC107', lineHeight: 1.5, marginBottom: 10 }}>
              Text is taller than the canvas — shrink it or shorten it.
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div style={{ height: 64, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderTop: '1px solid #1A1A1A', flexShrink: 0 }}>
        {createError && (
          <div style={{ fontSize: 12, color: '#FF6B6B', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {createError}
          </div>
        )}
        <div style={{ flex: createError ? 0 : 1 }} />
        <button
          onClick={handleCreate}
          disabled={!canCreate}
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 17,
            letterSpacing: '0.06em',
            background: canCreate ? '#E60306' : '#333',
            color: canCreate ? '#FFF' : '#777',
            border: 'none',
            borderRadius: 9,
            padding: '10px 26px',
            cursor: canCreate ? 'pointer' : 'not-allowed',
          }}
        >
          {creating ? 'CREATING…' : 'CREATE POST'}
        </button>
      </div>
    </div>
  );
}
