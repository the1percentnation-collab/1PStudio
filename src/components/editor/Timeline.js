import React, { useCallback, useEffect, useRef, useState } from 'react';
import { colors as c, fonts as f } from '../../theme';

const THUMB_COUNT = 10;
const HANDLE_HIT = 22; // px either side of a trim handle that grabs it

// Pulls a filmstrip out of the source video by seeking an offscreen element.
// Runs once per video; failures just leave a flat strip behind the playhead.
function useThumbnails(videoUrl, count = THUMB_COUNT) {
  const [thumbs, setThumbs] = useState([]);

  useEffect(() => {
    if (!videoUrl) return undefined;
    let cancelled = false;
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;

    const canvas = document.createElement('canvas');
    const out = [];

    const grab = (time) =>
      new Promise((resolve) => {
        const done = () => {
          video.removeEventListener('seeked', done);
          try {
            const w = 96;
            const h = Math.max(1, Math.round((video.videoHeight / (video.videoWidth || 1)) * w));
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(video, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.6));
          } catch {
            resolve(null);
          }
        };
        video.addEventListener('seeked', done);
        const t = setTimeout(() => { video.removeEventListener('seeked', done); resolve(null); }, 3000);
        video.currentTime = time;
        return () => clearTimeout(t);
      });

    video.onloadeddata = async () => {
      const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      if (!dur) return;
      for (let i = 0; i < count; i += 1) {
        if (cancelled) return;
        // eslint-disable-next-line no-await-in-loop
        const frame = await grab((dur * (i + 0.5)) / count);
        if (cancelled) return;
        out.push(frame);
        setThumbs([...out]);
      }
    };

    return () => {
      cancelled = true;
      video.removeAttribute('src');
      video.load();
    };
  }, [videoUrl, count]);

  return thumbs;
}

export default function Timeline({ videoUrl, duration, currentTime, clip, onSeek, onClipChange }) {
  const stripRef = useRef(null);
  const dragRef = useRef(null); // 'start' | 'end' | 'scrub'
  const thumbs = useThumbnails(videoUrl);

  const dur = duration > 0 ? duration : 0;
  const start = clip ? Math.max(0, Number(clip.start) || 0) : 0;
  const end = clip && Number(clip.end) > 0 ? Math.min(dur || Infinity, Number(clip.end)) : dur;
  const trimmed = start > 0.01 || (dur > 0 && end < dur - 0.01);

  const pctOf = (t) => (dur > 0 ? Math.min(1, Math.max(0, t / dur)) * 100 : 0);

  const timeAt = useCallback(
    (clientX) => {
      const el = stripRef.current;
      if (!el || dur <= 0) return 0;
      const rect = el.getBoundingClientRect();
      return Math.min(dur, Math.max(0, ((clientX - rect.left) / rect.width) * dur));
    },
    [dur]
  );

  const handleDown = useCallback(
    (e) => {
      const el = stripRef.current;
      if (!el || dur <= 0) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const startX = (start / dur) * rect.width;
      const endX = (end / dur) * rect.width;

      if (Math.abs(x - startX) <= HANDLE_HIT) dragRef.current = 'start';
      else if (Math.abs(x - endX) <= HANDLE_HIT) dragRef.current = 'end';
      else {
        dragRef.current = 'scrub';
        onSeek?.(timeAt(e.clientX));
      }
      el.setPointerCapture?.(e.pointerId);
    },
    [dur, start, end, onSeek, timeAt]
  );

  const handleMove = useCallback(
    (e) => {
      const mode = dragRef.current;
      if (!mode || dur <= 0) return;
      const t = timeAt(e.clientX);
      if (mode === 'scrub') {
        onSeek?.(t);
      } else if (mode === 'start') {
        onClipChange?.({ start: Math.min(t, end - 0.2), end });
        onSeek?.(Math.min(t, end - 0.2));
      } else {
        onClipChange?.({ start, end: Math.max(t, start + 0.2) });
        onSeek?.(Math.max(t, start + 0.2));
      }
    },
    [dur, end, start, onClipChange, onSeek, timeAt]
  );

  const handleUp = useCallback((e) => {
    dragRef.current = null;
    stripRef.current?.releasePointerCapture?.(e.pointerId);
  }, []);

  return (
    <div style={{ padding: '10px 16px 6px', flexShrink: 0 }}>
      <div
        ref={stripRef}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        style={{
          position: 'relative',
          height: 56,
          borderRadius: 8,
          background: c.surface,
          overflow: 'hidden',
          touchAction: 'none',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* filmstrip */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
          {(thumbs.length ? thumbs : Array.from({ length: THUMB_COUNT })).map((src, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                // backgroundColor, never the `background` shorthand: React
                // clears a shorthand set to undefined, which would also wipe
                // the backgroundImage set alongside it.
                backgroundColor: c.surfaceHi,
                backgroundImage: src ? `url(${src})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                borderRight: i === THUMB_COUNT - 1 ? 'none' : `1px solid rgba(0,0,0,0.25)`,
              }}
            />
          ))}
        </div>

        {/* trimmed-away regions */}
        {trimmed && (
          <>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pctOf(start)}%`, background: 'rgba(0,0,0,0.68)' }} />
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pctOf(end)}%`, right: 0, background: 'rgba(0,0,0,0.68)' }} />
          </>
        )}

        {/* kept region outline + handles */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${pctOf(start)}%`,
            width: `${Math.max(0, pctOf(end) - pctOf(start))}%`,
            border: `2px solid ${c.red}`,
            borderRadius: 6,
            pointerEvents: 'none',
          }}
        />
        {[['start', start], ['end', end]].map(([which, t]) => (
          <div
            key={which}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${pctOf(t)}%`,
              width: 12,
              marginLeft: which === 'start' ? -6 : -6,
              background: c.red,
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <span style={{ width: 2, height: 18, background: 'rgba(255,255,255,0.85)', borderRadius: 1 }} />
          </div>
        ))}

        {/* playhead */}
        <div
          style={{
            position: 'absolute',
            top: -3,
            bottom: -3,
            left: `${pctOf(currentTime)}%`,
            width: 2,
            marginLeft: -1,
            background: '#FFF',
            boxShadow: '0 0 6px rgba(0,0,0,0.8)',
            pointerEvents: 'none',
          }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: f.mono, fontSize: 10, letterSpacing: '0.1em', color: c.textFaint }}>
        <span>{trimmed ? `TRIM ${start.toFixed(1)}s – ${end.toFixed(1)}s` : 'DRAG EDGES TO TRIM'}</span>
        <span>{(end - start).toFixed(1)}s</span>
      </div>
    </div>
  );
}
