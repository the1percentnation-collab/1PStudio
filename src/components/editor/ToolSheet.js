import React from 'react';
import { colors as c, fonts as f, radius as r } from '../../theme';

// Bottom sheet that holds one tool's controls. Sits above the toolbar, capped
// so the preview stays visible behind it — on a phone you need to see what a
// slider is doing to the frame.
export default function ToolSheet({ title, onDone, children }) {
  return (
    <div
      style={{
        // Sits in normal flow directly above the toolbar rather than covering
        // it, so switching tools is one tap instead of close-then-tap.
        flexShrink: 0,
        background: c.bg2,
        borderTop: `1px solid ${c.border}`,
        borderTopLeftRadius: r.lg,
        borderTopRightRadius: r.lg,
        boxShadow: '0 -12px 40px rgba(0,0,0,0.55)',
        maxHeight: '44vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: `1px solid ${c.border}`,
          flexShrink: 0,
        }}
      >
        <span style={{ fontFamily: f.mono, fontSize: 11.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: c.textDim }}>
          {title}
        </span>
        <button
          onClick={onDone}
          aria-label={`Close ${title} panel`}
          style={{
            background: 'transparent',
            border: 'none',
            color: c.red,
            fontSize: 20,
            lineHeight: 1,
            padding: '2px 6px',
            cursor: 'pointer',
          }}
        >
          ✓
        </button>
      </div>

      <div style={{ overflowY: 'auto', padding: 16, WebkitOverflowScrolling: 'touch' }}>{children}</div>
    </div>
  );
}
