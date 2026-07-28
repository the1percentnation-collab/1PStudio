import React from 'react';
import { SOCIAL_PLATFORMS } from '../services/socialService';
import { colors as c, fonts as f, radius as r } from '../theme';
import { Eyebrow, Display, Red, SectionTitle, StatCard, Card, Button } from './ui';

const PLATFORM_LABELS = Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.id, p.label]));

function StatusDot({ status }) {
  const color = status === 'published' ? c.success : status === 'scheduled' ? c.warn : c.danger;
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}` }} />;
}

export default function Dashboard({ library, posts, onNavigate }) {
  const published = posts.filter((p) => p.status === 'published');
  const scheduled = posts.filter((p) => p.status === 'scheduled');

  const scored = library.filter((i) => i.content && typeof i.content.hook_score === 'number');
  const avgHook = scored.length
    ? (scored.reduce((s, i) => s + i.content.hook_score, 0) / scored.length).toFixed(1)
    : '—';

  const recent = [...posts].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);

  return (
    <div>
      {/* HERO */}
      <Eyebrow style={{ marginBottom: 14 }}>Content Studio</Eyebrow>
      <Display size={52} style={{ marginBottom: 10 }}>
        Welcome back, <Red>Anthony.</Red>
      </Display>
      <div style={{ fontFamily: f.mono, fontSize: 12.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.textFaint, marginBottom: 28 }}>
        Redefining Success. <span style={{ color: c.textGhost }}>Realigning Purpose.</span>
      </div>

      {/* HERO CTA CARD */}
      <Card accent pad={24} style={{ marginBottom: 30, background: `linear-gradient(120deg, ${c.redGlow}, transparent 60%), ${c.surface}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div>
            <Eyebrow style={{ marginBottom: 10 }}>Start creating</Eyebrow>
            <SectionTitle size={26} style={{ marginBottom: 6 }}>Turn ideas into posts</SectionTitle>
            <div style={{ fontSize: 13.5, color: c.textDim, maxWidth: 460, lineHeight: 1.5 }}>
              Generate, clip, schedule, and publish content across every platform — the work starts when you choose.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button onClick={() => onNavigate('composer')}>+ New Post</Button>
            <Button variant="ghost" onClick={() => onNavigate('clips')}>Clip a video →</Button>
          </div>
        </div>
      </Card>

      {/* STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 34 }}>
        <StatCard value={library.length} label="Content Pieces" note="In your library" />
        <StatCard value={published.length} suffix="" label="Published" note="Posts sent out" />
        <StatCard value={scheduled.length} label="Scheduled" note="Upcoming posts" />
        <StatCard value={avgHook} label="Avg Hook Score" note="Across library" />
      </div>

      {/* RECENT ACTIVITY */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Eyebrow dash dot={false}>Recent Activity</Eyebrow>
        <button
          onClick={() => onNavigate('posts')}
          style={{ background: 'transparent', border: 'none', color: c.textDim, fontFamily: f.mono, fontSize: 11.5, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', padding: 0 }}
        >
          View all →
        </button>
      </div>

      {recent.length === 0 ? (
        <div style={{ background: c.inset, border: `1px dashed ${c.border}`, borderRadius: r.lg, padding: '52px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: c.textDim, marginBottom: 4 }}>No posts yet</div>
          <div style={{ fontSize: 12.5, color: c.textFaint }}>Publish from the Composer and your activity shows up here.</div>
        </div>
      ) : (
        <Card pad={0}>
          {recent.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderTop: i === 0 ? 'none' : `1px solid ${c.border}` }}>
              <StatusDot status={p.status} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.caption || p.title || p.filename || 'Untitled post'}
                </div>
                <div style={{ fontSize: 11, color: c.textFaint, marginTop: 3 }}>
                  {(p.platforms || []).map((id) => PLATFORM_LABELS[id] || id).join(' · ')}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: f.mono, fontSize: 10, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: p.status === 'published' ? c.success : p.status === 'scheduled' ? c.warn : c.danger }}>
                  {p.status}
                </div>
                <div style={{ fontSize: 11, color: c.textFaint, marginTop: 3 }}>
                  {new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
