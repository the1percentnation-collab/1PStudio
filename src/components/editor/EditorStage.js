import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  drawOverlays,
  getTextBounds,
  ensureFontsLoaded,
  getCrop,
  drawVideoFrame,
  cropOutputDims,
} from '../../services/overlayRenderer';

// Video + overlay canvas sharing an exactly computed letterboxed rect.
// The canvas draws the (cropped) video frame + overlays at the output
// resolution, so preview rasterization matches the export pixel-for-pixel.
// In crop mode it instead shows the FULL frame with a draggable crop rectangle.
export default function EditorStage({
  videoUrl,
  spec,
  selectedTextId,
  onSelectText,
  onMoveText,
  onTimeUpdate,
  onDurationKnown,
  onDimsKnown,
  onEnded,
  videoRef,
  cropMode = false,
  onCropChange,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const specRef = useRef(spec);
  const selectedRef = useRef(selectedTextId);
  const cropModeRef = useRef(cropMode);
  const dragRef = useRef(null); // text drag: { id, offsetX, offsetY } in fractions
  const cropDragRef = useRef(null); // crop drag: { mode, startX, startY, orig }
  const [videoDims, setVideoDims] = useState(null); // { w, h } native
  const [containerSize, setContainerSize] = useState(null);

  specRef.current = spec;
  selectedRef.current = selectedTextId;
  cropModeRef.current = cropMode;

  useEffect(() => {
    ensureFontsLoaded();
  }, []);

  // track container size for letterbox math
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const handleMetadata = useCallback((e) => {
    const v = e.currentTarget;
    const dims = { w: v.videoWidth || 720, h: v.videoHeight || 1280 };
    setVideoDims(dims);
    onDimsKnown?.(dims);
    onDurationKnown?.(v.duration);
  }, [onDurationKnown, onDimsKnown]);

  // output (canvas) dimensions: full frame in crop mode, cropped otherwise
  const outDims = videoDims
    ? (cropMode ? videoDims : cropOutputDims(getCrop(spec), videoDims.w, videoDims.h))
    : null;

  // draw crop rectangle + handles while in crop mode
  const drawCropUI = useCallback((ctx, W, H) => {
    const c = getCrop(specRef.current);
    const rx = c.x * W, ry = c.y * H, rw = c.w * W, rh = c.h * H;
    // dim everything outside the crop
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.rect(rx, ry, rw, rh);
    ctx.fill('evenodd');
    // border
    ctx.strokeStyle = '#E60306';
    ctx.lineWidth = Math.max(2, W * 0.004);
    ctx.strokeRect(rx, ry, rw, rh);
    // handles
    const hs = Math.max(8, W * 0.018);
    ctx.fillStyle = '#FFFFFF';
    const pts = [
      [rx, ry], [rx + rw / 2, ry], [rx + rw, ry],
      [rx + rw, ry + rh / 2], [rx + rw, ry + rh],
      [rx + rw / 2, ry + rh], [rx, ry + rh], [rx, ry + rh / 2],
    ];
    pts.forEach(([px, py]) => {
      ctx.fillRect(px - hs / 2, py - hs / 2, hs, hs);
    });
    ctx.restore();
  }, []);

  // always-running draw loop
  useEffect(() => {
    let raf;
    const tick = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas && video && videoDims) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (cropModeRef.current) {
          // full frame + crop rectangle UI
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          drawCropUI(ctx, canvas.width, canvas.height);
        } else {
          const crop = getCrop(specRef.current);
          drawVideoFrame(ctx, video, crop, videoDims.w, videoDims.h, canvas.width, canvas.height);
          drawOverlays(ctx, specRef.current, video.currentTime, canvas.width, canvas.height);

          if (selectedRef.current) {
            const b = getTextBounds(ctx, specRef.current, canvas.width, canvas.height)
              .find((r) => r.id === selectedRef.current);
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
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoDims, videoRef, drawCropUI]);

  const toCanvasCoords = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }, []);

  // ---- crop-mode pointer handling ----
  const cropHitHandle = useCallback((x, y, W, H) => {
    const c = getCrop(specRef.current);
    const rx = c.x * W, ry = c.y * H, rw = c.w * W, rh = c.h * H;
    const hs = Math.max(12, W * 0.03);
    const near = (hx, hy) => Math.abs(x - hx) <= hs && Math.abs(y - hy) <= hs;
    const map = {
      nw: [rx, ry], n: [rx + rw / 2, ry], ne: [rx + rw, ry],
      e: [rx + rw, ry + rh / 2], se: [rx + rw, ry + rh],
      s: [rx + rw / 2, ry + rh], sw: [rx, ry + rh], w: [rx, ry + rh / 2],
    };
    for (const [name, [hx, hy]] of Object.entries(map)) {
      if (near(hx, hy)) return name;
    }
    if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) return 'move';
    return null;
  }, []);

  const handlePointerDown = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas || !videoDims) return;
    const { x, y } = toCanvasCoords(e);
    const W = canvas.width, H = canvas.height;

    if (cropModeRef.current) {
      const mode = cropHitHandle(x, y, W, H);
      if (!mode) return;
      const c = getCrop(specRef.current);
      cropDragRef.current = {
        mode,
        startX: x,
        startY: y,
        orig: { x: c.x * W, y: c.y * H, w: c.w * W, h: c.h * H },
      };
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    const ctx = canvas.getContext('2d');
    const bounds = getTextBounds(ctx, specRef.current, W, H);
    const hit = [...bounds].reverse().find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (hit) {
      const el = specRef.current.texts.find((t) => t.id === hit.id);
      dragRef.current = {
        id: hit.id,
        offsetX: x / W - el.x,
        offsetY: y / H - el.y,
      };
      onSelectText?.(hit.id);
      canvas.setPointerCapture(e.pointerId);
    } else {
      onSelectText?.(null);
    }
  }, [toCanvasCoords, videoDims, onSelectText, cropHitHandle]);

  const handlePointerMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width, H = canvas.height;

    if (cropModeRef.current) {
      const drag = cropDragRef.current;
      if (!drag) return;
      const { x, y } = toCanvasCoords(e);
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      const o = drag.orig;
      const minW = W * 0.08, minH = H * 0.08;
      let left = o.x, right = o.x + o.w, top = o.y, bottom = o.y + o.h;

      if (drag.mode === 'move') {
        const nx = Math.min(W - o.w, Math.max(0, o.x + dx));
        const ny = Math.min(H - o.h, Math.max(0, o.y + dy));
        left = nx; right = nx + o.w; top = ny; bottom = ny + o.h;
      } else {
        if (drag.mode.includes('w')) left = Math.min(right - minW, Math.max(0, o.x + dx));
        if (drag.mode.includes('e')) right = Math.max(left + minW, Math.min(W, o.x + o.w + dx));
        if (drag.mode.includes('n')) top = Math.min(bottom - minH, Math.max(0, o.y + dy));
        if (drag.mode.includes('s')) bottom = Math.max(top + minH, Math.min(H, o.y + o.h + dy));
      }
      onCropChange?.({ x: left / W, y: top / H, w: (right - left) / W, h: (bottom - top) / H });
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const { x, y } = toCanvasCoords(e);
    onMoveText?.(
      drag.id,
      Math.min(0.98, Math.max(0.02, x / W - drag.offsetX)),
      Math.min(0.98, Math.max(0.02, y / H - drag.offsetY))
    );
  }, [toCanvasCoords, onMoveText, onCropChange]);

  const handlePointerUp = useCallback((e) => {
    dragRef.current = null;
    cropDragRef.current = null;
    canvasRef.current?.releasePointerCapture?.(e.pointerId);
  }, []);

  // letterboxed display rect (based on output/cropped aspect)
  let displayW = 0;
  let displayH = 0;
  if (outDims && containerSize) {
    const scale = Math.min(containerSize.w / outDims.w, containerSize.h / outDims.h);
    displayW = Math.floor(outDims.w * scale);
    displayH = Math.floor(outDims.h * scale);
  }

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 0,
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'relative', width: displayW, height: displayH }}>
        {/* hidden frame + audio source — the canvas is the visible surface */}
        <video
          ref={videoRef}
          src={videoUrl}
          playsInline
          preload="auto"
          onLoadedMetadata={handleMetadata}
          onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
          onEnded={() => onEnded?.()}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, pointerEvents: 'none' }}
        />
        {outDims && (
          <canvas
            ref={canvasRef}
            width={outDims.w}
            height={outDims.h}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              background: '#000',
              cursor: cropMode ? 'crosshair' : 'move',
              touchAction: 'none',
            }}
          />
        )}
      </div>
    </div>
  );
}
