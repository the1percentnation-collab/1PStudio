import React from 'react';
import { colors as c, fonts as f, radius as r, shadow } from '../theme';

// ---------------------------------------------------------------------------
// Ambient background — near-black with soft red corner glows + faint grid.
// Rendered once behind everything (position: fixed).
// ---------------------------------------------------------------------------
export function GlowBackground() {
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -220, right: -160, width: 620, height: 620, borderRadius: '50%', background: `radial-gradient(circle, ${c.redGlow} 0%, transparent 62%)` }} />
      <div style={{ position: 'absolute', bottom: -260, left: -180, width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle, rgba(230,51,41,0.07) 0%, transparent 62%)' }} />
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.5,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
        maskImage: 'radial-gradient(ellipse at 50% 0%, #000 0%, transparent 75%)',
        WebkitMaskImage: 'radial-gradient(ellipse at 50% 0%, #000 0%, transparent 75%)',
      }} />
    </div>
  );
}

// Inline red accent word (for "WELCOME BACK, ANTHONY.").
export function Red({ children }) {
  return <span style={{ color: c.red }}>{children}</span>;
}

// Red monospace eyebrow label with a leading dot or dash.
export function Eyebrow({ children, dot = true, dash = false, color = c.red, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: f.mono, fontSize: 12, fontWeight: 500, letterSpacing: '0.24em', textTransform: 'uppercase', color, ...style }}>
      {dash && <span style={{ width: 22, height: 2, background: color, display: 'inline-block' }} />}
      {dot && !dash && <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />}
      <span>{children}</span>
    </div>
  );
}

// Heavy condensed uppercase display heading (hero). Mix white + <Red> words.
export function Display({ children, size = 44, style }) {
  return (
    <h1 style={{ fontFamily: f.display, fontWeight: 400, textTransform: 'uppercase', fontSize: size, lineHeight: 0.98, letterSpacing: '0.005em', color: c.white, margin: 0, ...style }}>
      {children}
    </h1>
  );
}

// Smaller condensed section heading.
export function SectionTitle({ children, size = 22, style }) {
  return (
    <div style={{ fontFamily: f.display, fontWeight: 400, textTransform: 'uppercase', fontSize: size, lineHeight: 1, letterSpacing: '0.01em', color: c.white, ...style }}>
      {children}
    </div>
  );
}

// Dark card, optional red left-accent bar and hover lift.
export function Card({ children, accent = false, hover = false, pad = 20, style, ...rest }) {
  const [h, setH] = React.useState(false);
  return (
    <div
      {...rest}
      onMouseEnter={hover ? () => setH(true) : rest.onMouseEnter}
      onMouseLeave={hover ? () => setH(false) : rest.onMouseLeave}
      style={{
        position: 'relative',
        background: c.surface,
        border: `1px solid ${h ? c.borderHi : c.border}`,
        borderRadius: r.lg,
        padding: pad,
        boxShadow: shadow.card,
        transition: 'border-color 0.2s, transform 0.2s',
        transform: h ? 'translateY(-2px)' : 'none',
        overflow: 'hidden',
        ...style,
      }}
    >
      {accent && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: c.red }} />}
      {children}
    </div>
  );
}

// Big stat: Anton number with a red suffix, uppercase label, muted note.
export function StatCard({ value, suffix, label, note, style }) {
  return (
    <Card pad={22} style={style}>
      <div style={{ fontFamily: f.display, fontSize: 52, lineHeight: 1, color: c.white }}>
        {value}<span style={{ color: c.red }}>{suffix}</span>
      </div>
      <div style={{ marginTop: 12, fontFamily: f.display2, fontSize: 17, letterSpacing: '0.06em', textTransform: 'uppercase', color: c.textDim }}>{label}</div>
      {note && <div style={{ marginTop: 6, fontSize: 12.5, color: c.textFaint }}>{note}</div>}
    </Card>
  );
}

// Red-outline mono pill (e.g. "MEMBER PORTAL", "NOW AVAILABLE").
export function Pill({ children, dot = true, style }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: `1px solid ${c.redDim}`, borderRadius: r.sm, padding: '8px 14px', fontFamily: f.mono, fontSize: 12, letterSpacing: '0.22em', textTransform: 'uppercase', color: c.red, ...style }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.red }} />}
      {children}
    </span>
  );
}

const btnBase = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  borderRadius: r.md, fontFamily: f.body, fontWeight: 700, fontSize: 14,
  padding: '12px 20px', cursor: 'pointer', border: '1px solid transparent',
  transition: 'background 0.18s, border-color 0.18s, transform 0.1s, opacity 0.18s',
  textDecoration: 'none', whiteSpace: 'nowrap',
};

export function Button({ variant = 'primary', children, disabled, style, ...rest }) {
  const [h, setH] = React.useState(false);
  const variants = {
    primary: { background: h ? c.redHover : c.red, color: '#fff', boxShadow: h ? shadow.redGlow : 'none' },
    secondary: { background: h ? '#eaeaea' : '#fff', color: '#0A0A0A' },
    outline: { background: 'transparent', color: c.red, border: `1px solid ${h ? c.red : c.redDim}`, fontFamily: f.mono, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 500, fontSize: 12.5 },
    ghost: { background: h ? c.surfaceHi : c.inset, color: '#fff', border: `1px solid ${h ? c.borderHi : c.border}`, fontWeight: 600 },
  };
  return (
    <button
      {...rest}
      disabled={disabled}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{ ...btnBase, ...variants[variant], opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer', ...style }}
    >
      {children}
    </button>
  );
}

// Uppercase label + dark input (email/password/text). Pass inputProps through.
export function Field({ label, as = 'input', style, inputStyle, ...inputProps }) {
  const El = as;
  return (
    <label style={{ display: 'block', ...style }}>
      {label && <div style={{ fontFamily: f.mono, fontSize: 11.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: c.textDim, marginBottom: 8 }}>{label}</div>}
      <El
        {...inputProps}
        style={{
          width: '100%', background: c.inset, border: `1px solid ${c.border}`, borderRadius: r.md,
          padding: '11px 13px', color: c.white, fontFamily: f.body, fontSize: 14, outline: 'none',
          transition: 'border-color 0.18s', ...inputStyle,
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = c.redDim; inputProps.onFocus?.(e); }}
        onBlur={(e) => { e.currentTarget.style.borderColor = c.border; inputProps.onBlur?.(e); }}
      />
    </label>
  );
}

// Small circular hook/score ring (Anton number in a conic gauge).
export function ScoreRing({ score, max = 10, size = 44 }) {
  const pct = Math.max(0, Math.min(max, score || 0)) / max * 100;
  const hue = 8 + pct * 1.2;
  return (
    <div title={`${Math.round(score || 0)}/${max}`} style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: `conic-gradient(hsl(${hue} 85% 52%) ${pct * 3.6}deg, #222 0deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: size - 10, height: size - 10, borderRadius: '50%', background: c.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: f.display, fontSize: size * 0.36, color: '#fff' }}>
        {Math.round(score || 0)}
      </div>
    </div>
  );
}
