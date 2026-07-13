import React, { useRef } from 'react';

const SWATCHES = ['#FFFFFF', '#E60306', '#000000', '#FFC107'];
const FONTS = ['Bebas Neue', 'DM Sans', 'Arial'];

// Dual-thumb slider for a text element's on-screen time window. `end == null`
// means "until the end". Writes { start, end } via onChange.
function TimingSlider({ duration, start, end, playhead, onChange }) {
  const trackRef = useRef(null);
  const max = duration || 0;
  const startVal = Math.max(0, Math.min(start ?? 0, max));
  const endVal = end == null ? max : Math.max(0, Math.min(end, max));
  const pct = (v) => (max > 0 ? (v / max) * 100 : 0);

  const valueFromClientX = (clientX) => {
    const rect = trackRef.current.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return t * max;
  };

  const beginDrag = (which) => (e) => {
    if (!max) return;
    e.preventDefault();
    const move = (ev) => {
      const cx = ev.clientX ?? ev.touches?.[0]?.clientX;
      if (cx == null) return;
      const v = valueFromClientX(cx);
      if (which === 'start') {
        onChange({ start: Math.max(0, Math.min(v, endVal - 0.1)) });
      } else {
        const clamped = Math.max(startVal + 0.1, Math.min(v, max));
        // snap to end-of-video → store null so it tracks the real duration
        onChange({ end: clamped >= max - 0.05 ? null : clamped });
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const thumb = (leftPct, onDown, key) => (
    <div
      key={key}
      onPointerDown={onDown}
      style={{
        position: 'absolute',
        left: `${leftPct}%`,
        top: '50%',
        width: 14,
        height: 14,
        marginLeft: -7,
        marginTop: -7,
        borderRadius: '50%',
        background: '#E60306',
        border: '2px solid #FFF',
        cursor: max ? 'ew-resize' : 'not-allowed',
        touchAction: 'none',
        boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
      }}
    />
  );

  return (
    <div style={{ padding: '10px 4px 4px' }}>
      <div ref={trackRef} style={{ position: 'relative', height: 14 }}>
        {/* base track */}
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 4, marginTop: -2, background: '#2A2A2A', borderRadius: 2 }} />
        {/* active range */}
        <div style={{ position: 'absolute', top: '50%', height: 4, marginTop: -2, background: '#E60306', borderRadius: 2, left: `${pct(startVal)}%`, width: `${Math.max(0, pct(endVal) - pct(startVal))}%` }} />
        {/* playhead marker */}
        {max > 0 && playhead != null && (
          <div style={{ position: 'absolute', top: -1, height: 16, width: 2, background: '#FFF', opacity: 0.7, left: `${pct(Math.min(playhead, max))}%` }} />
        )}
        {thumb(pct(startVal), beginDrag('start'), 'start')}
        {thumb(pct(endVal), beginDrag('end'), 'end')}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#888', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
        <span>{startVal.toFixed(1)}s</span>
        <span>{end == null ? 'end' : `${endVal.toFixed(1)}s`}</span>
      </div>
    </div>
  );
}

const labelStyle = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.12em',
  color: '#666',
  textTransform: 'uppercase',
  display: 'block',
  marginBottom: 6,
};

const rowStyle = { marginBottom: 14 };

function Toggle({ label, on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        background: on ? '#E6030622' : '#0A0A0A',
        border: `1px solid ${on ? '#E60306' : '#2A2A2A'}`,
        color: on ? '#FFF' : '#666',
        fontSize: 12,
        padding: '5px 10px',
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      {label}
    </button>
  );
}

export default function TextControls({ texts, selectedId, duration, currentTime, hideTiming, onChange, onAdd, onRemove, onSelect }) {
  const selected = texts.find((t) => t.id === selectedId) || null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: '0.06em', color: '#FFF' }}>
          ON-SCREEN TEXT
        </span>
        <button
          onClick={onAdd}
          style={{
            background: '#1A1A1A',
            border: '1px solid #333',
            color: '#CCC',
            fontSize: 12,
            padding: '4px 10px',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          + Add text
        </button>
      </div>

      {texts.length === 0 && (
        <div style={{ fontSize: 12, color: '#555', marginBottom: 14 }}>
          No text elements. Click “+ Add text” to create one.
        </div>
      )}

      {texts.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {texts.map((t, i) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              style={{
                background: t.id === selectedId ? '#E6030622' : '#0A0A0A',
                border: `1px solid ${t.id === selectedId ? '#E60306' : '#2A2A2A'}`,
                color: t.id === selectedId ? '#FFF' : '#888',
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                maxWidth: 120,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {t.text || `Text ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      {!selected && texts.length > 0 && (
        <div style={{ fontSize: 12, color: '#555', marginBottom: 14 }}>
          Click a text on the video (or a chip above) to edit it. Drag to reposition.
        </div>
      )}

      {selected && (
        <>
          <div style={rowStyle}>
            <label style={labelStyle}>Text</label>
            <textarea
              value={selected.text}
              onChange={(e) => onChange(selected.id, { text: e.target.value })}
              rows={2}
              style={{
                width: '100%',
                background: '#0A0A0A',
                border: '1px solid #2A2A2A',
                borderRadius: 8,
                color: '#FFF',
                fontSize: 13,
                lineHeight: 1.5,
                padding: '8px 10px',
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ ...rowStyle, display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Font</label>
              <select
                value={selected.font}
                onChange={(e) => {
                  const font = e.target.value;
                  onChange(selected.id, { font, weight: font === 'Bebas Neue' ? 400 : 800 });
                }}
                style={{
                  width: '100%',
                  background: '#0A0A0A',
                  border: '1px solid #2A2A2A',
                  borderRadius: 8,
                  color: '#FFF',
                  fontSize: 13,
                  padding: '7px 8px',
                }}
              >
                {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Size</label>
              <input
                type="range"
                min={0.02}
                max={0.12}
                step={0.002}
                value={selected.size}
                onChange={(e) => onChange(selected.id, { size: Number(e.target.value) })}
                style={{ width: '100%', accentColor: '#E60306' }}
              />
            </div>
          </div>

          <div style={rowStyle}>
            <label style={labelStyle}>Color</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => onChange(selected.id, { color: c })}
                  aria-label={`color ${c}`}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: c,
                    border: selected.color === c ? '2px solid #E60306' : '2px solid #333',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
              <input
                type="color"
                value={selected.color}
                onChange={(e) => onChange(selected.id, { color: e.target.value })}
                style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
              />
            </div>
          </div>

          <div style={{ ...rowStyle, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Toggle
              label="Outline"
              on={!!selected.outline}
              onChange={(on) => onChange(selected.id, { outline: on ? { color: '#000000', width: 0.12 } : null })}
            />
            <Toggle
              label="Background"
              on={!!selected.bg}
              onChange={(on) => onChange(selected.id, { bg: on ? '#000000' : null })}
            />
            <Toggle
              label="Shadow"
              on={!!selected.shadow}
              onChange={(on) => onChange(selected.id, { shadow: on ? { color: 'rgba(0,0,0,0.8)', blur: 0.18, dx: 0, dy: 0.06 } : null })}
            />
          </div>

          {!hideTiming && (
          <div style={rowStyle}>
            <label style={labelStyle}>Timing (drag to set when it shows)</label>
            <TimingSlider
              duration={duration}
              start={selected.start}
              end={selected.end}
              playhead={currentTime}
              onChange={(patch) => onChange(selected.id, patch)}
            />
          </div>
          )}

          {!hideTiming && (
          <div style={{ ...rowStyle, display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Show from (s)</label>
              <input
                type="number"
                min={0}
                step={0.1}
                value={selected.start ?? 0}
                onChange={(e) => onChange(selected.id, { start: Math.max(0, Number(e.target.value) || 0) })}
                style={{
                  width: '100%',
                  background: '#0A0A0A',
                  border: '1px solid #2A2A2A',
                  borderRadius: 8,
                  color: '#FFF',
                  fontSize: 13,
                  padding: '6px 8px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Until (s, blank = end)</label>
              <input
                type="number"
                min={0}
                step={0.1}
                value={selected.end ?? ''}
                placeholder={duration ? duration.toFixed(1) : ''}
                onChange={(e) => onChange(selected.id, { end: e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0) })}
                style={{
                  width: '100%',
                  background: '#0A0A0A',
                  border: '1px solid #2A2A2A',
                  borderRadius: 8,
                  color: '#FFF',
                  fontSize: 13,
                  padding: '6px 8px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
          )}

          <button
            onClick={() => onRemove(selected.id)}
            style={{
              background: 'transparent',
              border: '1px solid #333',
              color: '#888',
              fontSize: 12,
              padding: '6px 12px',
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'color 0.2s, border-color 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#FF4444'; e.currentTarget.style.borderColor = '#FF4444'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = '#333'; }}
          >
            Remove this text
          </button>
        </>
      )}
    </div>
  );
}
