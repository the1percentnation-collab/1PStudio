import React, { useRef, useEffect, useCallback, useState } from 'react';
import { drawOverlays, getTextBounds, ensureFontsLoaded, filterToCss } from '../../services/overlayRenderer';

// Video + overlay canvas sharing an exactly computed letterboxed rect.
// The canvas runs at native video resolution (scaled by CSS), so preview
// glyph rasterization and wrapping match the export pixel-for-pixel.
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
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const specRef = useRef(spec);
  const selectedRef = useRef(selectedTextId);
  const dragRef = useRef(null); // { id, offsetX, offsetY } in fractions
  const [videoDims, setVideoDims] = useState(null); // { w, h }
  const [containerSize, setContainerSize] = useState(null);

  specRef.current = spec;
  selectedRef.current = selectedTextId;

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
    // For a clip, start playback at the clip's in-point.
    const clip = specRef.current?.clip;
    if (clip && Number(clip.start) > 0) {
      try { v.currentTime = Number(clip.start); } catch { /* ignore */ }
    }
  }, [onDurationKnown, onDimsKnown]);

  // Speed and volume are element-level in the preview; the export applies the
  // same values via playbackRate/gain (in-browser) or ffmpeg (server render).
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = spec?.speed || 1;
  }, [spec, videoRef]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.volume = Math.min(1, spec?.volume == null ? 1 : spec.volume);
  }, [spec, videoRef]);

  // always-running draw loop: overlays + selection rect follow the video clock
  useEffect(() => {
    let raf;
    const tick = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas && video && videoDims) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawOverlays(ctx, specRef.current, video.currentTime, canvas.width, canvas.height);

        // Keep clip previews looping within [clip.start, clip.end].
        const clip = specRef.current?.clip;
        if (clip && !video.paused && video.currentTime >= Number(clip.end) - 0.03) {
          try { video.currentTime = Number(clip.start) || 0; } catch { /* ignore */ }
        }

        if (selectedRef.current) {
          const b = getTextBounds(ctx, specRef.current, canvas.width, canvas.height)
            .find((r) => r.id === selectedRef.current);
          if (b) {
            ctx.save();
            ctx.strokeStyle = '#E63329';
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
  }, [videoDims, videoRef]);

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
    if (!canvas || !videoDims) return;
    const { x, y } = toCanvasCoords(e);
    const ctx = canvas.getContext('2d');
    const bounds = getTextBounds(ctx, specRef.current, canvas.width, canvas.height);
    // topmost (last drawn) wins
    const hit = [...bounds].reverse().find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (hit) {
      const el = specRef.current.texts.find((t) => t.id === hit.id);
      dragRef.current = {
        id: hit.id,
        offsetX: x / canvas.width - el.x,
        offsetY: y / canvas.height - el.y,
      };
      onSelectText?.(hit.id);
      canvas.setPointerCapture(e.pointerId);
    } else {
      onSelectText?.(null);
    }
  }, [toCanvasCoords, videoDims, onSelectText]);

  const handlePointerMove = useCallback((e) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const { x, y } = toCanvasCoords(e);
    onMoveText?.(
      drag.id,
      Math.min(0.98, Math.max(0.02, x / canvas.width - drag.offsetX)),
      Math.min(0.98, Math.max(0.02, y / canvas.height - drag.offsetY))
    );
  }, [toCanvasCoords, onMoveText]);

  const handlePointerUp = useCallback((e) => {
    dragRef.current = null;
    canvasRef.current?.releasePointerCapture?.(e.pointerId);
  }, []);

  // Reframing crops the *source*, so the stage shows the cropped region only:
  // the frame is blown up and offset inside an overflow-hidden window, and the
  // overlay canvas is sized to the cropped pixels. Overlay coordinates are
  // fractions of that cropped frame, which is exactly what the export burns.
  const crop = spec?.crop || null;
  const cropW = crop ? Math.max(0.01, crop.w) : 1;
  const cropH = crop ? Math.max(0.01, crop.h) : 1;
  const cropX = crop ? crop.x || 0 : 0;
  const cropY = crop ? crop.y || 0 : 0;

  const framePxW = videoDims ? Math.round(videoDims.w * cropW) : 0;
  const framePxH = videoDims ? Math.round(videoDims.h * cropH) : 0;

  // letterboxed display rect for the (possibly cropped) frame
  let displayW = 0;
  let displayH = 0;
  if (videoDims && containerSize) {
    const scale = Math.min(containerSize.w / framePxW, containerSize.h / framePxH);
    displayW = Math.floor(framePxW * scale);
    displayH = Math.floor(framePxH * scale);
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
      <div
        style={{
          position: 'relative',
          width: displayW,
          height: displayH,
          overflow: 'hidden',
          borderRadius: 14,
          background: '#000',
        }}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          playsInline
          preload="auto"
          onLoadedMetadata={handleMetadata}
          onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
          onEnded={() => onEnded?.()}
          style={{
            position: 'absolute',
            width: `${100 / cropW}%`,
            height: `${100 / cropH}%`,
            left: `${(-cropX / cropW) * 100}%`,
            top: `${(-cropY / cropH) * 100}%`,
            display: 'block',
            background: '#000',
            filter: filterToCss(spec?.filter),
          }}
        />
        {videoDims && (
          <canvas
            ref={canvasRef}
            width={framePxW}
            height={framePxH}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              cursor: 'move',
              touchAction: 'none',
            }}
          />
        )}
      </div>
    </div>
  );
}
