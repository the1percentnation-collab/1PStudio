import React, { useRef, useEffect, useState, useCallback } from 'react';
import { drawOverlays, ensureFontsLoaded } from '../services/overlayRenderer';

// Read-only clip preview: plays only [clip.start, clip.end] with captions and
// overlays burned onto a canvas via the SAME renderer the exporter uses, so
// what you see is what you export. Click to play/pause.
export default function ClipPreview({ result }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [dims, setDims] = useState(null);
  const [playing, setPlaying] = useState(false);
  const clip = result.overlaySpec?.clip || result.clip || { start: 0, end: 0 };

  useEffect(() => { ensureFontsLoaded(); }, []);

  const onMeta = useCallback((e) => {
    const v = e.currentTarget;
    setDims({ w: v.videoWidth || 720, h: v.videoHeight || 1280 });
    try { v.currentTime = Number(clip.start) || 0; } catch { /* ignore */ }
  }, [clip.start]);

  useEffect(() => {
    let raf;
    const tick = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas && video && dims) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawOverlays(ctx, result.overlaySpec, video.currentTime, canvas.width, canvas.height);
        if (!video.paused && Number(clip.end) > 0 && video.currentTime >= Number(clip.end) - 0.03) {
          try { video.currentTime = Number(clip.start) || 0; } catch { /* ignore */ }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dims, result.overlaySpec, clip.start, clip.end]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime < clip.start || v.currentTime >= clip.end - 0.05) v.currentTime = Number(clip.start) || 0;
      v.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setPlaying(false);
    }
  }, [clip.start, clip.end]);

  return (
    <div
      onClick={toggle}
      style={{ position: 'relative', width: '100%', aspectRatio: '9 / 16', background: '#000', cursor: 'pointer', overflow: 'hidden' }}
    >
      <video
        ref={videoRef}
        src={result.videoUrl}
        playsInline
        preload="auto"
        onLoadedMetadata={onMeta}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
      />
      {dims && (
        <canvas
          ref={canvasRef}
          width={dims.w}
          height={dims.h}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        />
      )}
      {!playing && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 0, height: 0, borderStyle: 'solid', borderWidth: '9px 0 9px 15px', borderColor: 'transparent transparent transparent #fff', marginLeft: 3 }} />
          </div>
        </div>
      )}
    </div>
  );
}
