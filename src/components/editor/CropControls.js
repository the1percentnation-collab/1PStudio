import React from 'react';

// Largest centered crop of a target aspect ratio (w/h) inside a source frame,
// returned as fractions {x,y,w,h}. sourceDims may be null (fall back to full).
function aspectCrop(targetAR, sourceDims) {
  if (!sourceDims) return { x: 0, y: 0, w: 1, h: 1 };
  const sourceAR = sourceDims.w / sourceDims.h;
  let w, h;
  if (targetAR >= sourceAR) {
    w = 1;
    h = sourceAR / targetAR;
  } else {
    h = 1;
    w = targetAR / sourceAR;
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

const PRESETS = [
  { label: 'Original', ar: null },
  { label: '9:16', ar: 9 / 16 },
  { label: '1:1', ar: 1 },
  { label: '4:5', ar: 4 / 5 },
  { label: '16:9', ar: 16 / 9 },
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

export default function CropControls({ crop, sourceDims, cropMode, onSetCrop, onToggleCropMode }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: '0.06em', color: '#FFF' }}>
          CROP / FRAME
        </span>
        <button
          onClick={() => onToggleCropMode(!cropMode)}
          style={{
            background: cropMode ? '#E60306' : '#0A0A0A',
            border: `1px solid ${cropMode ? '#E60306' : '#2A2A2A'}`,
            color: cropMode ? '#FFF' : '#888',
            fontSize: 12,
            padding: '5px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {cropMode ? 'Done' : 'Adjust box'}
        </button>
      </div>

      {cropMode && (
        <div style={{ fontSize: 12, color: '#999', background: '#E6030611', border: '1px solid #E6030633', borderRadius: 8, padding: '8px 10px', marginBottom: 12, lineHeight: 1.5 }}>
          Drag the box or its handles on the video to reframe. Pick a ratio below to snap it.
        </div>
      )}

      <label style={labelStyle}>Aspect ratio</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => onSetCrop(p.ar == null ? { x: 0, y: 0, w: 1, h: 1 } : aspectCrop(p.ar, sourceDims))}
            style={{
              background: '#0A0A0A',
              border: '1px solid #2A2A2A',
              color: '#BBB',
              fontSize: 12,
              padding: '6px 12px',
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#E60306'; e.currentTarget.style.color = '#FFF'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2A2A2A'; e.currentTarget.style.color = '#BBB'; }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {crop && (crop.w < 0.999 || crop.h < 0.999) && (
        <div style={{ fontSize: 11, color: '#00C48C', marginTop: 10 }}>
          Cropped to {Math.round(crop.w * 100)}% × {Math.round(crop.h * 100)}% of the frame.
        </div>
      )}
    </div>
  );
}
