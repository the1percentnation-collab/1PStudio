// Design tokens for 1P STUDIO — modeled on the1pnation.com member portal.
// Near-black surfaces, vivid brand red, heavy condensed display type, and
// red monospace "eyebrow" labels. Imported by theme components and views.

export const colors = {
  bg: '#0A0A0A',        // page
  bg2: '#0D0D0D',       // sidebar / raised chrome
  surface: '#141414',   // cards
  surfaceHi: '#1A1A1A',  // hovered / nested surfaces
  inset: '#0C0C0C',     // inputs / wells
  border: '#232323',    // hairline
  borderHi: '#2E2E2E',   // interactive hover border

  red: '#E63329',        // brand
  redHover: '#F5453A',   // hover / active
  redDim: 'rgba(230,51,41,0.5)',   // outline
  redGlow: 'rgba(230,51,41,0.14)',  // ambient glow / tint fills

  white: '#FFFFFF',
  text: '#F2F2F2',
  textDim: '#9A9A9A',
  textFaint: '#5C5C5C',
  textGhost: '#3A3A3A',

  success: '#00C48C',
  warn: '#FFC107',
  danger: '#FF5A5A',
};

export const fonts = {
  // Heavy condensed uppercase display (hero headings, big stat numbers).
  display: "'Anton', 'Bebas Neue', sans-serif",
  // Lighter condensed display (secondary headings / labels).
  display2: "'Bebas Neue', sans-serif",
  // Red, letter-spaced, uppercase eyebrow labels.
  mono: "'DM Mono', 'Courier Prime', ui-monospace, monospace",
  // Body.
  body: "'DM Sans', system-ui, sans-serif",
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };

export const shadow = {
  card: '0 1px 0 rgba(255,255,255,0.02), 0 8px 30px rgba(0,0,0,0.35)',
  redGlow: '0 0 0 1px rgba(230,51,41,0.35), 0 10px 40px rgba(230,51,41,0.18)',
};

// Pillar colors kept from the app (used by content cards / analytics).
export const pillarColors = {
  'Self-Sabotage & Limiting Beliefs': '#E63329',
  'Accountability & Execution': '#FF6B00',
  'Identity & Mindset Shift': '#9B59B6',
  'Leadership & Purpose': '#2980B9',
};

const theme = { colors, fonts, radius, shadow, pillarColors };
export default theme;
