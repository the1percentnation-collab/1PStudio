import React, { useState, useRef, useEffect, useCallback } from 'react';
import { drawOverlays, getTextBounds, ensureFontsLoaded, makeTextElement } from '../../services/overlayRenderer';
import TextControls from '../editor/TextControls';

// Cover output resolutions per aspect (portrait-first for short-form content).
const ASPECTS = {
  '9:16': { w: 1080, h: 1920, label: '9:16' },
  '4:5': { w: 1080, h: 1350, label: '4:5' },
  '1:1': { w: 1080, h: 1080, label: '1:1' },
  '16:9': { w: 1920, h: 1080, label: '16:9' },
};

// Draw an image to cover the whole WxH box (object-fit: cover, centered).
function drawCover(ctx, img, W, H) {
  if (!img) return;
  const ir = img.width / img.height;
  const cr = W / H;
  let dw, dh;
  if (ir > cr) { dh = H; dw = H * ir; } else { dw = W; dh = W / ir; }
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

// Shared scene render (no selection UI) — used by preview and export.
function drawCoverScene(ctx, bgImage, texts, W, H) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  drawCover(ctx, bgImage, W, H);
  drawOverlays(ctx, { texts }, 0, W, H);
}

function loadImage(src, cb) {
  const img = new Image();
  img.onload = () => cb(img);
  img.src = src;
}

// Static-image stage: background + draggable text, at cover resolution.
function CoverStage({ bgImage, dims, texts, selectedId, onSelectText, onMoveText }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const bgRef = useRef(bgImage);
  const textsRef = useRef(texts);
  const selRef = useRef(selectedId);
  const dragRef = useRef(null);
  const [containerSize, setContainerSize] = useState(null);

  bgRef.current = bgImage;
  textsRef.current = texts;
  selRef.current = selectedId;

  useEffect(() => { ensureFontsLoaded(); }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let raf;
    const tick = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        drawCoverScene(ctx, bgRef.current, textsRef.current, canvas.width, canvas.height);
        if (selRef.current) {
          const b = getTextBounds(ctx, { texts: textsRef.current }, canvas.width, canvas.height).find((r) => r.id === selRef.current);
          if (b) {
            ctx.save();
            ctx.strokeStyle = '#E60306';
            ctx.lineWidth = Math.max(2, canvas.width * 0.003);
            ctx.setLineDash([canvas.width * 0.012, canvas.width * 0.008]);
            ctx.strokeRect(b.x, b.y, b.w, b.h);
            ctx.restore();
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const toCanvas = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }, []);

  const onDown = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = toCanvas(e);
    const ctx = canvas.getContext('2d');
    const bounds = getTextBounds(ctx, { texts: textsRef.current }, canvas.width, canvas.height);
    const hit = [...bounds].reverse().find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (hit) {
      const el = textsRef.current.find((t) => t.id === hit.id);
      dragRef.current = { id: hit.id, ox: x / canvas.width - el.x, oy: y / canvas.height - el.y };
      onSelectText(hit.id);
      canvas.setPointerCapture(e.pointerId);
    } else {
      onSelectText(null);
    }
  }, [toCanvas, onSelectText]);

  const onMove = useCallback((e) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const { x, y } = toCanvas(e);
    onMoveText(drag.id,
      Math.min(0.98, Math.max(0.02, x / canvas.width - drag.ox)),
      Math.min(0.98, Math.max(0.02, y / canvas.height - drag.oy)));
  }, [toCanvas, onMoveText]);

  const onUp = useCallback((e) => {
    dragRef.current = null;
    canvasRef.current?.releasePointerCapture?.(e.pointerId);
  }, []);

  let dw = 0, dh = 0;
  if (containerSize) {
    const scale = Math.min(containerSize.w / dims.w, containerSize.h / dims.h);
    dw = Math.floor(dims.w * scale);
    dh = Math.floor(dims.h * scale);
  }

  return (
    <div ref={containerRef} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        width={dims.w}
        height={dims.h}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{ width: dw, height: dh, background: '#000', cursor: 'move', touchAction: 'none', borderRadius: 4 }}
      />
    </div>
  );
}

export default function CoverStudio({ result, onClose }) {
  const { videoUrl, frames, content, filename } = result;
  const [aspect, setAspect] = useState('9:16');
  const [bgImage, setBgImage] = useState(null);
  const [texts, setTexts] = useState(() => {
    const t = makeTextElement({ text: content?.thumbnail_text || content?.on_screen_text || 'YOUR TEXT', x: 0.5, y: 0.8 });
    t.size = 0.09;
    return [t];
  });
  const [selectedId, setSelectedId] = useState(texts[0]?.id || null);
  const [grabTime, setGrabTime] = useState(0);
  const [vidDuration, setVidDuration] = useState(0);
  const hiddenVideoRef = useRef(null);

  const dims = ASPECTS[aspect];

  // default background = the hook frame if we have one
  useEffect(() => {
    if (frames?.hookFrame) loadImage(`data:image/jpeg;base64,${frames.hookFrame}`, setBgImage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const patchText = useCallback((id, patch) => setTexts((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t))), []);
  const addText = useCallback(() => {
    const t = makeTextElement({ text: 'NEW TEXT', x: 0.5, y: 0.5 });
    t.size = 0.07;
    setTexts((ts) => [...ts, t]);
    setSelectedId(t.id);
  }, []);
  const removeText = useCallback((id) => {
    setTexts((ts) => ts.filter((t) => t.id !== id));
    setSelectedId((c) => (c === id ? null : c));
  }, []);

  const applyFrame = (b64) => b64 && loadImage(`data:image/jpeg;base64,${b64}`, setBgImage);

  const onUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadImage(URL.createObjectURL(file), setBgImage);
  };

  const grabFromVideo = () => {
    const v = hiddenVideoRef.current;
    if (!v) return;
    const onSeeked = () => {
      v.removeEventListener('seeked', onSeeked);
      const c = document.createElement('canvas');
      c.width = v.videoWidth || 720;
      c.height = v.videoHeight || 1280;
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      loadImage(c.toDataURL('image/jpeg', 0.92), setBgImage);
    };
    v.addEventListener('seeked', onSeeked);
    v.currentTime = Math.min(grabTime, (v.duration || 0) - 0.05);
  };

  const download = async () => {
    await ensureFontsLoaded();
    const c = document.createElement('canvas');
    c.width = dims.w;
    c.height = dims.h;
    drawCoverScene(c.getContext('2d'), bgImage, texts, dims.w, dims.h);
    const base = (filename || 'video').replace(/\.[^.]+$/, '');
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = `${base}-cover-${aspect.replace(':', 'x')}.png`;
    a.click();
  };

  const frameBtns = [
    { label: 'Hook', data: frames?.hookFrame },
    { label: 'Mid', data: frames?.midFrame },
    { label: 'End', data: frames?.endFrame },
  ].filter((f) => f.data);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#0A0A0A', display: 'flex', flexDirection: 'column' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 20px', height: 56, borderBottom: '1px solid #1A1A1A', flexShrink: 0 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: '0.05em' }}>
          <span style={{ color: '#E60306' }}>COVER</span>
          <span style={{ color: '#FFF', marginLeft: 6 }}>STUDIO</span>
        </div>
        <div style={{ flex: 1, fontSize: 12, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {filename}
        </div>
        <button onClick={download} style={{ background: '#E60306', color: '#FFF', fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer' }}>
          ⬇ Download cover (PNG)
        </button>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ background: 'transparent', border: '1px solid #333', color: '#CCC', fontSize: 14, width: 32, height: 32, borderRadius: 8, cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>

      {/* BODY */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', padding: 16, minWidth: 0 }}>
          <CoverStage
            bgImage={bgImage}
            dims={dims}
            texts={texts}
            selectedId={selectedId}
            onSelectText={setSelectedId}
            onMoveText={(id, x, y) => patchText(id, { x, y })}
          />
        </div>

        <div style={{ width: 320, flexShrink: 0, borderLeft: '1px solid #1A1A1A', background: '#111', overflowY: 'auto', padding: 18 }}>
          {/* FORMAT */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: '#666', textTransform: 'uppercase', marginBottom: 8 }}>Format</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.keys(ASPECTS).map((key) => (
                <button
                  key={key}
                  onClick={() => setAspect(key)}
                  style={{
                    background: aspect === key ? '#E6030622' : '#0A0A0A',
                    border: `1px solid ${aspect === key ? '#E60306' : '#2A2A2A'}`,
                    color: aspect === key ? '#FFF' : '#999',
                    fontSize: 12, padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                  }}
                >
                  {ASPECTS[key].label}
                </button>
              ))}
            </div>
          </div>

          {/* BACKGROUND */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: '#666', textTransform: 'uppercase', marginBottom: 8 }}>Background</div>
            {frameBtns.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {frameBtns.map((f) => (
                  <button
                    key={f.label}
                    onClick={() => applyFrame(f.data)}
                    style={{ flex: 1, position: 'relative', border: '1px solid #2A2A2A', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', padding: 0, background: '#000' }}
                  >
                    <img src={`data:image/jpeg;base64,${f.data}`} alt={f.label} style={{ width: '100%', height: 44, objectFit: 'cover', display: 'block' }} />
                    <span style={{ position: 'absolute', bottom: 2, left: 4, fontSize: 9, color: '#FFF', textShadow: '0 1px 2px #000' }}>{f.label}</span>
                  </button>
                ))}
              </div>
            )}

            {videoUrl && (
              <div style={{ marginBottom: 10 }}>
                <video
                  ref={hiddenVideoRef}
                  src={videoUrl}
                  onLoadedMetadata={(e) => setVidDuration(e.currentTarget.duration || 0)}
                  style={{ display: 'none' }}
                />
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Grab a frame at {grabTime.toFixed(1)}s</div>
                <input
                  type="range"
                  min={0}
                  max={vidDuration || 0}
                  step={0.1}
                  value={grabTime}
                  onChange={(e) => setGrabTime(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#E60306' }}
                />
                <button
                  onClick={grabFromVideo}
                  style={{ marginTop: 6, width: '100%', background: '#1A1A1A', border: '1px solid #333', color: '#CCC', fontSize: 12, padding: '7px', borderRadius: 6, cursor: 'pointer' }}
                >
                  Use this frame
                </button>
              </div>
            )}

            <label style={{ display: 'block', background: '#0A0A0A', border: '1px dashed #333', color: '#888', fontSize: 12, padding: '8px', borderRadius: 6, cursor: 'pointer', textAlign: 'center' }}>
              Upload image
              <input type="file" accept="image/*" onChange={onUpload} style={{ display: 'none' }} />
            </label>
          </div>

          <div style={{ borderTop: '1px solid #1A1A1A', margin: '16px 0' }} />

          {/* TEXT — reuses the editor's text controls (timing hidden) */}
          <TextControls
            texts={texts}
            selectedId={selectedId}
            hideTiming
            onChange={patchText}
            onAdd={addText}
            onRemove={removeText}
            onSelect={setSelectedId}
          />
        </div>
      </div>
    </div>
  );
}
