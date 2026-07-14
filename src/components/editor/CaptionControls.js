import React, { useState } from 'react';

const PRESETS = [
  { key: 'outline', label: 'Outline', sample: { color: '#FFF', textShadow: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000' } },
  { key: 'block', label: 'Block', sample: { color: '#FFF', background: 'rgba(0,0,0,0.85)', padding: '2px 8px', borderRadius: 4 } },
  { key: 'karaoke', label: 'Karaoke', sample: { color: '#E60306', textShadow: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000' } },
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

export default function CaptionControls({ captions, hasWords, canGenerate, onGenerate, onChange }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    setBusy(true);
    setError('');
    setMsg('Starting…');
    try {
      await onGenerate?.((m) => setMsg(m));
      setMsg('');
    } catch (e) {
      setError(e?.message || 'Could not generate captions.');
      setMsg('');
    } finally {
      setBusy(false);
    }
  };

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
            background: captions.enabled ? '#E6030622' : '#0A0A0A',
            border: `1px solid ${captions.enabled ? '#E60306' : '#2A2A2A'}`,
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
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: '#775500', background: '#FFC10711', border: '1px solid #FFC10733', borderRadius: 8, padding: '8px 10px', lineHeight: 1.5 }}>
            No word timings yet — synced captions need transcription first.
          </div>
          {canGenerate ? (
            <button
              onClick={handleGenerate}
              disabled={busy}
              style={{
                marginTop: 10,
                width: '100%',
                background: '#E60306',
                color: '#FFF',
                fontSize: 13,
                fontWeight: 700,
                padding: '9px 12px',
                borderRadius: 8,
                border: 'none',
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? (msg || 'Working…') : 'Generate captions'}
            </button>
          ) : (
            <div style={{ marginTop: 8, fontSize: 11, color: '#666' }}>
              Re-upload this video from the Composer to generate captions.
            </div>
          )}
          {error && <div style={{ marginTop: 8, fontSize: 12, color: '#FF4444', lineHeight: 1.4 }}>{error}</div>}
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
                    background: captions.preset === p.key ? '#E6030611' : '#0A0A0A',
                    border: `1px solid ${captions.preset === p.key ? '#E60306' : '#2A2A2A'}`,
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
                style={{ width: '100%', accentColor: '#E60306' }}
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
                style={{ width: '100%', accentColor: '#E60306' }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
