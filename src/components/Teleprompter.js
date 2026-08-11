import React, { useEffect, useRef } from 'react';
import { colors as c, fonts as f } from '../theme';

/**
 * Auto-scrolling teleprompter overlay.
 *
 * Scrolling is driven by requestAnimationFrame writing straight to the DOM so it
 * stays smooth without re-rendering React on every frame.
 */
function Teleprompter({
  script,
  fontSize = 34,
  speed = 4,
  playing = false,
  mirrored = false,
  dim = 0.5,
  resetSignal = 0,
  onFinish,
}) {
  const scrollRef = useRef(null);
  const rafRef = useRef(null);
  const lastTsRef = useRef(0);
  const offsetRef = useRef(0);
  const finishRef = useRef(onFinish);

  finishRef.current = onFinish;

  // Jump back to the top whenever the parent bumps resetSignal
  useEffect(() => {
    offsetRef.current = 0;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [resetSignal]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return undefined;

    lastTsRef.current = 0;
    offsetRef.current = el.scrollTop;

    const step = (ts) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = Math.min((ts - lastTsRef.current) / 1000, 0.1);
      lastTsRef.current = ts;

      offsetRef.current += dt * speed * 12; // slider 1–10 → 12–120 px/sec
      const max = Math.max(el.scrollHeight - el.clientHeight, 0);

      if (offsetRef.current >= max) {
        offsetRef.current = max;
        el.scrollTop = max;
        finishRef.current?.();
        return;
      }

      el.scrollTop = offsetRef.current;
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, speed]);

  // Keep our offset in sync when the reader scrolls by hand
  const handleScroll = () => {
    if (!playing && scrollRef.current) offsetRef.current = scrollRef.current.scrollTop;
  };

  const hasScript = script.trim().length > 0;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* dimmer so text stays readable over a bright frame */}
      <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${dim})` }} />

      {/* reading line markers */}
      <div style={{ position: 'absolute', top: '42%', left: 0, right: 0, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ width: 14, height: 2, background: c.red, opacity: 0.9 }} />
        <div style={{ width: 14, height: 2, background: c.red, opacity: 0.9 }} />
      </div>

      <div
        ref={scrollRef}
        className="teleprompter-scroll"
        onScroll={handleScroll}
        style={{
          position: 'absolute',
          inset: 0,
          overflowY: 'auto',
          pointerEvents: 'auto',
          scrollbarWidth: 'none',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, #000 16%, #000 84%, transparent 100%)',
          maskImage: 'linear-gradient(to bottom, transparent 0%, #000 16%, #000 84%, transparent 100%)',
        }}
      >
        <div
          style={{
            padding: '42% 22px 70%',
            fontFamily: f.body,
            fontSize,
            fontWeight: 500,
            lineHeight: 1.45,
            color: hasScript ? c.white : c.textDim,
            textAlign: 'center',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            textShadow: '0 2px 12px rgba(0,0,0,0.85)',
            transform: mirrored ? 'scaleX(-1)' : 'none',
          }}
        >
          {hasScript ? script : 'Write your script below and it will scroll here while you record.'}
        </div>
      </div>
    </div>
  );
}

export default React.memo(Teleprompter);
