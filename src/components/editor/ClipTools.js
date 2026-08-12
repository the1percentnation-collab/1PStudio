import React from 'react';
import { FILTER_PRESETS, filterToCss } from '../../services/overlayRenderer';
import { colors as c, fonts as f, radius as r } from '../../theme';

const label = {
  fontFamily: f.mono,
  fontSize: 10.5,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: c.textDim,
};

function Row({ children, style }) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', ...style }}>{children}</div>;
}

function Option({ active, onClick, children, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? c.redGlow : c.inset,
        border: `1px solid ${active ? c.redDim : c.border}`,
        color: active ? c.red : c.textDim,
        fontFamily: f.mono,
        fontSize: 11.5,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        padding: '9px 14px',
        borderRadius: r.sm,
        cursor: 'pointer',
        transition: 'background 0.18s, border-color 0.18s, color 0.18s',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Speed. Preview uses playbackRate; export re-times video and audio to match.
// ---------------------------------------------------------------------------
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function SpeedControls({ speed, duration, onChange }) {
  const eff = duration > 0 ? duration / (speed || 1) : 0;
  return (
    <div>
      <Row>
        {SPEEDS.map((s) => (
          <Option key={s} active={(speed || 1) === s} onClick={() => onChange(s)} style={{ flex: '1 0 auto', minWidth: 62 }}>
            {s}×
          </Option>
        ))}
      </Row>
      <div style={{ fontSize: 12, color: c.textFaint, marginTop: 12, lineHeight: 1.5 }}>
        {eff > 0 ? `Final length ≈ ${eff.toFixed(1)}s. ` : ''}
        Audio is re-timed with the video, so voices keep their pitch.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reframe. Crop is stored as fractions of the source frame so it survives any
// resolution, and the preview canvas is sized to the cropped region — overlay
// positions stay put between preview and export.
// ---------------------------------------------------------------------------
const RATIOS = [
  { key: 'original', label: 'Original', ratio: null },
  { key: '9:16', label: '9:16', ratio: 9 / 16 },
  { key: '4:5', label: '4:5', ratio: 4 / 5 },
  { key: '1:1', label: '1:1', ratio: 1 },
  { key: '16:9', label: '16:9', ratio: 16 / 9 },
];

// Largest centred crop of `ratio` that fits inside a videoW×videoH frame.
export function cropForRatio(ratio, videoW, videoH, offset = 0.5) {
  if (!ratio || !videoW || !videoH) return null;
  const srcRatio = videoW / videoH;
  if (Math.abs(srcRatio - ratio) < 0.001) return null; // already that shape

  if (srcRatio > ratio) {
    const w = ratio / srcRatio; // fraction of width kept
    return { x: Math.min(1 - w, Math.max(0, offset - w / 2)), y: 0, w, h: 1 };
  }
  const h = srcRatio / ratio; // fraction of height kept
  return { x: 0, y: Math.min(1 - h, Math.max(0, offset - h / 2)), w: 1, h };
}

export function CropControls({ crop, videoDims, onChange }) {
  const w = videoDims?.w || 0;
  const h = videoDims?.h || 0;

  const activeKey = (() => {
    if (!crop) return 'original';
    const cw = (w * crop.w) / (h * crop.h);
    const match = RATIOS.find((x) => x.ratio && Math.abs(cw - x.ratio) < 0.02);
    return match ? match.key : 'custom';
  })();

  // Which axis got cropped decides which way the position slider moves.
  const axis = crop ? (crop.w < 0.999 ? 'x' : 'y') : null;
  const offset = crop ? (axis === 'x' ? crop.x + crop.w / 2 : crop.y + crop.h / 2) : 0.5;

  return (
    <div>
      <span style={label}>Aspect</span>
      <Row style={{ marginTop: 8 }}>
        {RATIOS.map(({ key, label: l, ratio }) => (
          <Option
            key={key}
            active={activeKey === key}
            onClick={() => onChange(ratio ? cropForRatio(ratio, w, h, 0.5) : null)}
            style={{ flex: '1 0 auto', minWidth: 66 }}
          >
            {l}
          </Option>
        ))}
      </Row>

      {crop && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={label}>{axis === 'x' ? 'Horizontal position' : 'Vertical position'}</span>
            <span style={{ fontSize: 11, color: c.textFaint }}>{Math.round(offset * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={offset}
            onChange={(e) => {
              const next = Number(e.target.value);
              const size = axis === 'x' ? crop.w : crop.h;
              const pos = Math.min(1 - size, Math.max(0, next - size / 2));
              onChange(axis === 'x' ? { ...crop, x: pos } : { ...crop, y: pos });
            }}
            style={{ width: '100%', accentColor: c.red, cursor: 'pointer' }}
          />
          <div style={{ fontSize: 12, color: c.textFaint, marginTop: 10, lineHeight: 1.5 }}>
            Keep your face inside the kept area — everything outside it is cut from the exported video.
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Colour presets. Swatches render the actual look via the same CSS the preview
// applies, so what you tap is what you get.
// ---------------------------------------------------------------------------
export function FilterControls({ filter, poster, onChange }) {
  return (
    <Row style={{ gap: 12 }}>
      {Object.entries(FILTER_PRESETS).map(([key, preset]) => {
        const active = (filter || 'none') === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              width: 74,
            }}
          >
            <div
              style={{
                width: 74,
                height: 74,
                borderRadius: r.md,
                overflow: 'hidden',
                border: `2px solid ${active ? c.red : c.border}`,
                background: c.surfaceHi,
                backgroundImage: poster ? `url(${poster})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: filterToCss(key),
              }}
            />
            <div style={{ ...label, fontSize: 9.5, marginTop: 6, textAlign: 'center', color: active ? c.red : c.textDim }}>
              {preset.label}
            </div>
          </button>
        );
      })}
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Volume
// ---------------------------------------------------------------------------
export function VolumeControls({ volume, onChange }) {
  const v = volume == null ? 1 : volume;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={label}>Original audio</span>
        <span style={{ fontSize: 11, color: c.textFaint }}>{Math.round(v * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={2}
        step={0.05}
        value={v}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: c.red, cursor: 'pointer' }}
      />
      <Row style={{ marginTop: 14 }}>
        <Option active={v === 0} onClick={() => onChange(0)}>Mute</Option>
        <Option active={v === 1} onClick={() => onChange(1)}>100%</Option>
        <Option active={v === 1.5} onClick={() => onChange(1.5)}>Boost 150%</Option>
      </Row>
    </div>
  );
}
