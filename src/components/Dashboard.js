import React from 'react';
import { SOCIAL_PLATFORMS } from '../services/socialService';

const PLATFORM_LABELS = Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.id, p.label]));

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      flex: 1,
      minWidth: 160,
      background: '#111',
      border: '1px solid #1A1A1A',
      borderRadius: 14,
      padding: '18px 20px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: '#666', textTransform: 'uppercase', marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, lineHeight: 1, color: accent || '#FFF' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: '#555', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function StatusDot({ status }) {
  const color = status === 'published' ? '#00C48C' : status === 'scheduled' ? '#FFC107' : '#FF4444';
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />;
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
      {/* WELCOME / CTA */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        background: 'linear-gradient(135deg, rgba(230,3,6,0.14), rgba(230,3,6,0.02))',
        border: '1px solid #2A1012',
        borderRadius: 16,
        padding: '22px 24px',
        marginBottom: 24,
      }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: '0.04em', color: '#FFF' }}>
            WELCOME BACK
          </div>
          <div style={{ fontSize: 13, color: '#999', marginTop: 4 }}>
            Generate, schedule, and publish content across all your platforms.
          </div>
        </div>
        <button
          onClick={() => onNavigate('composer')}
          style={{
            background: '#E60306',
            color: '#FFF',
            fontSize: 14,
            fontWeight: 700,
            padding: '12px 22px',
            borderRadius: 10,
            whiteSpace: 'nowrap',
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          + New Post
        </button>
      </div>

      {/* STATS */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <StatCard label="Content Pieces" value={library.length} sub="In your library" />
        <StatCard label="Published" value={published.length} sub="Posts sent out" accent="#00C48C" />
        <StatCard label="Scheduled" value={scheduled.length} sub="Upcoming posts" accent="#FFC107" />
        <StatCard label="Avg Hook Score" value={avgHook} sub="Across library" accent="#E60306" />
      </div>

      {/* RECENT ACTIVITY */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: '0.05em', color: '#888' }}>
          RECENT ACTIVITY
        </div>
        <button
          onClick={() => onNavigate('posts')}
          style={{ background: 'transparent', border: 'none', color: '#888', fontSize: 12, cursor: 'pointer', padding: 0 }}
        >
          View all →
        </button>
      </div>

      {recent.length === 0 ? (
        <div style={{
          background: '#0E0E0E',
          border: '1px dashed #1F1F1F',
          borderRadius: 14,
          padding: '48px 24px',
          textAlign: 'center',
          color: '#444',
        }}>
          <div style={{ fontSize: 14, marginBottom: 4 }}>No posts yet</div>
          <div style={{ fontSize: 12, color: '#333' }}>Publish from the Composer and your activity shows up here.</div>
        </div>
      ) : (
        <div style={{ background: '#111', border: '1px solid #1A1A1A', borderRadius: 14, overflow: 'hidden' }}>
          {recent.map((p, i) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '13px 18px',
                borderTop: i === 0 ? 'none' : '1px solid #1A1A1A',
              }}
            >
              <StatusDot status={p.status} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#DDD', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.caption || p.title || p.filename || 'Untitled post'}
                </div>
                <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>
                  {(p.platforms || []).map((id) => PLATFORM_LABELS[id] || id).join(' · ')}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: p.status === 'published' ? '#00C48C' : p.status === 'scheduled' ? '#FFC107' : '#FF4444',
                }}>
                  {p.status}
                </div>
                <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>
                  {new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
