import React from 'react';

const SWATCHES = ['#FFFFFF', '#E60306', '#000000', '#FFC107'];
const FONTS = ['Bebas Neue', 'DM Sans', 'Arial'];

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

export default function TextControls({ texts, selectedId, duration, onChange, onAdd, onRemove, onSelect }) {
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
