import React from 'react';

const PRESETS = [
  { key: 'outline', label: 'Outline', sample: { color: '#FFF', textShadow: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000' } },
  { key: 'block', label: 'Block', sample: { color: '#FFF', background: 'rgba(0,0,0,0.85)', padding: '2px 8px', borderRadius: 4 } },
  { key: 'karaoke', label: 'Karaoke', sample: { color: '#E63329', textShadow: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000' } },
];

const labelStyle = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.12em',
  color: '#666',
  textTransform: 'uppercase',
  display: 'block',
  marginBottom: 6,
};

export default function CaptionControls({ captions, hasWords, onChange }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: '0.06em', color: '#FFF' }}>
          CAPTIONS
        </span>
        <button
          onClick={() => onChange({ enabled: !captions.enabled })}
          disabled={!hasWords}
          style={{
            background: captions.enabled ? '#E6332922' : '#0A0A0A',
            border: `1px solid ${captions.enabled ? '#E63329' : '#2A2A2A'}`,
            color: !hasWords ? '#444' : captions.enabled ? '#FFF' : '#666',
            fontSize: 12,
            padding: '5px 12px',
            borderRadius: 6,
            cursor: hasWords ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
          }}
        >
          {captions.enabled ? 'On' : 'Off'}
        </button>
      </div>

      {!hasWords && (
        <div style={{ fontSize: 12, color: '#775500', background: '#FFC10711', border: '1px solid #FFC10733', borderRadius: 8, padding: '8px 10px', marginBottom: 14, lineHeight: 1.5 }}>
          No word timings for this video — synced captions unavailable. Transcription may be off (Deepgram not configured) or it failed for this upload; try Regenerate on the card.
        </div>
      )}

      {hasWords && captions.enabled && (
        <>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Style</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => onChange({ preset: p.key })}
                  style={{
                    flex: 1,
                    background: captions.preset === p.key ? '#E6332911' : '#0A0A0A',
                    border: `1px solid ${captions.preset === p.key ? '#E63329' : '#2A2A2A'}`,
                    borderRadius: 8,
                    padding: '10px 4px 8px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s',
                  }}
                >
                  {/* mini DOM approximation — the canvas preview is the source of truth */}
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 12, marginBottom: 6, display: 'inline-block', ...p.sample }}>
                    LIKE THIS
                  </div>
                  <div style={{ fontSize: 10, color: captions.preset === p.key ? '#FFF' : '#666', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {p.label}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Size</label>
              <input
                type="range"
                min={0.025}
                max={0.08}
                step={0.002}
                value={captions.size}
                onChange={(e) => onChange({ size: Number(e.target.value) })}
                style={{ width: '100%', accentColor: '#E63329' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Vertical position</label>
              <input
                type="range"
                min={0.4}
                max={0.92}
                step={0.01}
                value={captions.y}
                onChange={(e) => onChange({ y: Number(e.target.value) })}
                style={{ width: '100%', accentColor: '#E63329' }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
