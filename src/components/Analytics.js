import React from 'react';
import { SOCIAL_PLATFORMS } from '../services/socialService';

const PLATFORM_LABELS = Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.id, p.label]));
const PALETTE = ['#E60306', '#FF6B00', '#9B59B6', '#2980B9', '#00C48C', '#FFC107', '#1ABC9C', '#E84393'];

/* ---------- chart primitives (pure SVG, no deps) ---------- */

function Donut({ segments, size = 150, thickness = 20, centerLabel, centerSub }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1A1A1A" strokeWidth={thickness} />
          {total > 0 && segments.map((s, i) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return el;
          })}
        </g>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 30, lineHeight: 1, color: '#FFF' }}>{centerLabel}</div>
        {centerSub && <div style={{ fontSize: 10, color: '#666', marginTop: 2, letterSpacing: '0.06em' }}>{centerSub}</div>}
      </div>
    </div>
  );
}

function Gauge({ value, max = 10, size = 150, thickness = 16, label, accent = '#E60306' }) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const arc = 0.75 * c; // 270° sweep
  const frac = Math.max(0, Math.min(1, value / max));
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(135 ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1A1A1A" strokeWidth={thickness}
            strokeDasharray={`${arc} ${c}`} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={accent} strokeWidth={thickness}
            strokeDasharray={`${frac * arc} ${c}`} strokeLinecap="round" />
        </g>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, lineHeight: 1, color: '#FFF' }}>{value}</div>
        {label && <div style={{ fontSize: 10, color: '#666', marginTop: 2, letterSpacing: '0.06em' }}>{label}</div>}
      </div>
    </div>
  );
}

function AreaChart({ data, height = 180, accent = '#E60306' }) {
  const W = 600;
  const H = height;
  const padX = 8;
  const padTop = 14;
  const padBottom = 24;
  const n = data.length;
  const max = Math.max(1, ...data.map((d) => d.value));
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;
  const x = (i) => padX + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v) => padTop + innerH - (v / max) * innerH;

  const linePts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  const areaPts = `${padX},${padTop + innerH} ${linePts} ${padX + innerW},${padTop + innerH}`;
  const gridVals = [0, 0.5, 1];

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridVals.map((g, i) => (
        <line key={i} x1={padX} x2={padX + innerW} y1={padTop + innerH - g * innerH} y2={padTop + innerH - g * innerH}
          stroke="#1A1A1A" strokeWidth="1" strokeDasharray="3 4" />
      ))}
      <polygon points={areaPts} fill="url(#areaFill)" />
      <polyline points={linePts} fill="none" stroke={accent} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        (i === 0 || i === n - 1 || d.value === max) && (
          <circle key={i} cx={x(i)} cy={y(d.value)} r="3.5" fill={accent} />
        )
      ))}
    </svg>
  );
}

function Legend({ segments }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {segments.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
          <span style={{ color: '#AAA', flex: 1 }}>{s.label}</span>
          <span style={{ color: '#FFF', fontWeight: 600 }}>{s.value}</span>
        </div>
      ))}
    </div>
  );
}

function Card({ title, icon, children, span }) {
  return (
    <div style={{
      background: '#111',
      border: '1px solid #1A1A1A',
      borderRadius: 16,
      padding: 20,
      flex: span ? '1 1 100%' : '1 1 260px',
      minWidth: 0,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#888', textTransform: 'uppercase', marginBottom: 16 }}>
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

function MetricPill({ label, value, accent }) {
  return (
    <div style={{ flex: 1, minWidth: 120, background: '#111', border: '1px solid #1A1A1A', borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: '#666', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, lineHeight: 1, color: accent || '#FFF' }}>{value}</div>
    </div>
  );
}

/* ---------- view ---------- */

export default function Analytics({ library, posts }) {
  const published = posts.filter((p) => p.status === 'published');
  const scheduled = posts.filter((p) => p.status === 'scheduled');

  // platform mix across all posts
  const platformTally = {};
  posts.forEach((p) => (p.platforms || []).forEach((id) => { platformTally[id] = (platformTally[id] || 0) + 1; }));
  const platformSegments = Object.entries(platformTally)
    .sort((a, b) => b[1] - a[1])
    .map(([id, value], i) => ({ label: PLATFORM_LABELS[id] || id, value, color: PALETTE[i % PALETTE.length] }));

  // content pillar mix from library
  const pillarTally = {};
  library.forEach((i) => { const k = i.content?.content_pillar; if (k) pillarTally[k] = (pillarTally[k] || 0) + 1; });
  const pillarSegments = Object.entries(pillarTally)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));

  const scored = library.filter((i) => i.content && typeof i.content.hook_score === 'number');
  const avgHook = scored.length ? Math.round((scored.reduce((s, i) => s + i.content.hook_score, 0) / scored.length) * 10) / 10 : 0;

  // posts per day, last 14 days
  const days = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const count = posts.filter((p) => {
      const pd = new Date(p.date);
      return pd.getFullYear() === d.getFullYear() && pd.getMonth() === d.getMonth() && pd.getDate() === d.getDate();
    }).length;
    days.push({ date: d, value: count });
  }
  const hasTimeline = days.some((d) => d.value > 0);
  const distinctPlatforms = Object.keys(platformTally).length;

  return (
    <div>
      {/* TOP METRICS */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
        <MetricPill label="Total Posts" value={posts.length} />
        <MetricPill label="Published" value={published.length} accent="#00C48C" />
        <MetricPill label="Scheduled" value={scheduled.length} accent="#FFC107" />
        <MetricPill label="Platforms Used" value={distinctPlatforms} accent="#2980B9" />
        <MetricPill label="Content Pieces" value={library.length} accent="#E60306" />
      </div>

      {/* CHART ROW */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <Card title="Avg Hook Score" icon="🎯">
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
            <Gauge value={avgHook} max={10} label="OUT OF 10" />
          </div>
        </Card>

        <Card title="Posts by Platform" icon="📱">
          {platformSegments.length === 0 ? (
            <EmptyChart label="No posts published yet" />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              <Donut segments={platformSegments} centerLabel={posts.length} centerSub="POSTS" />
              <div style={{ flex: 1, minWidth: 140 }}><Legend segments={platformSegments} /></div>
            </div>
          )}
        </Card>

        <Card title="Content Pillars" icon="🧠">
          {pillarSegments.length === 0 ? (
            <EmptyChart label="No content generated yet" />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              <Donut segments={pillarSegments} centerLabel={library.length} centerSub="VIDEOS" />
              <div style={{ flex: 1, minWidth: 160 }}><Legend segments={pillarSegments} /></div>
            </div>
          )}
        </Card>
      </div>

      {/* TIMELINE */}
      <Card title="Posting Activity — Last 14 Days" icon="📈" span>
        {hasTimeline ? (
          <>
            <AreaChart data={days} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: '#555' }}>
              <span>{days[0].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              <span>{days[7].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              <span>{days[13].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            </div>
          </>
        ) : (
          <EmptyChart label="Your posting activity will chart here once you publish or schedule posts" />
        )}
      </Card>

      {/* NOTE */}
      <div style={{
        marginTop: 16,
        background: 'rgba(41,128,185,0.07)',
        border: '1px solid #14283A',
        borderRadius: 12,
        padding: '14px 16px',
        fontSize: 12,
        color: '#7CA8C8',
        lineHeight: 1.5,
      }}>
        <strong style={{ color: '#9BC4E2' }}>Engagement & reach metrics</strong> (impressions, likes, engagement rate) sync
        here automatically once your social accounts are connected and analytics is enabled via Zernio. The charts above
        reflect your real posting and content data.
      </div>
    </div>
  );
}

function EmptyChart({ label }) {
  return (
    <div style={{ padding: '36px 12px', textAlign: 'center', color: '#444', fontSize: 12, lineHeight: 1.5 }}>
      {label}
    </div>
  );
}
