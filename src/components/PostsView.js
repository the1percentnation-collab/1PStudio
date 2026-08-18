import React, { useState } from 'react';
import { SOCIAL_PLATFORMS } from '../services/socialService';

const PLATFORM_LABELS = Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.id, p.label]));

const STATUS_COLORS = { published: '#00C48C', scheduled: '#FFC107', failed: '#FF4444' };
const statusColor = (status) => STATUS_COLORS[status] || '#00C48C';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'failed', label: 'Failed' },
];

const EMPTY_TEXT = {
  all: 'No posts yet — publish something from the Composer and it will show up here.',
  published: 'No published posts yet.',
  scheduled: 'Nothing scheduled right now.',
  failed: 'No failed posts — nice.',
};

export default function PostsView({ posts, onNavigate, onRefresh, syncState = {}, isMobile = false }) {
  const [filter, setFilter] = useState('all');

  const counts = posts.reduce(
    (acc, p) => {
      acc.all += 1;
      if (acc[p.status] !== undefined) acc[p.status] += 1;
      return acc;
    },
    { all: 0, published: 0, scheduled: 0, failed: 0 }
  );

  const shown = [...posts]
    .filter((p) => filter === 'all' || p.status === filter)
    .sort((a, b) => {
      const ta = Date.parse(a.date);
      const tb = Date.parse(b.date);
      if (Number.isNaN(ta)) return 1;
      if (Number.isNaN(tb)) return -1;
      return tb - ta;
    });

  const thumbSize = isMobile ? 36 : 44;

  return (
    <div>
      {/* FILTER CHIPS + REFRESH */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        {FILTERS.map(({ id, label }) => {
          const active = filter === id;
          const accent = id === 'all' ? '#E63329' : statusColor(id);
          return (
            <button
              key={id}
              onClick={() => setFilter(id)}
              style={{
                background: active ? `${accent}22` : '#111',
                border: `1px solid ${active ? accent : '#333'}`,
                color: active ? accent : '#999',
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 20,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {label} ({counts[id]})
            </button>
          );
        })}
        <button
          onClick={onRefresh}
          disabled={syncState.loading}
          style={{
            marginLeft: 'auto',
            background: '#1A1A1A',
            border: '1px solid #2A2A2A',
            color: syncState.loading ? '#555' : '#CCC',
            fontSize: 12,
            fontWeight: 600,
            padding: '7px 14px',
            borderRadius: 8,
            cursor: syncState.loading ? 'default' : 'pointer',
          }}
        >
          {syncState.loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {/* SYNC STATE BANNERS */}
      {syncState.configured === false && (
        <div style={{ fontSize: 11, color: '#FFC107', lineHeight: 1.5, background: 'rgba(255,193,7,0.06)', border: '1px solid rgba(255,193,7,0.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
          Zernio isn’t configured — showing locally recorded posts only. Statuses may be stale.
        </div>
      )}
      {syncState.error && (
        <div style={{ fontSize: 11, color: '#FF6B6B', lineHeight: 1.5, background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
          Couldn’t refresh from Zernio: {syncState.error}. Showing the last known statuses.
        </div>
      )}

      {/* LIST */}
      {shown.length === 0 ? (
        <div style={{ border: '1px dashed #2A2A2A', borderRadius: 14, padding: '36px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#555', marginBottom: filter === 'all' ? 14 : 0 }}>
            {EMPTY_TEXT[filter]}
          </div>
          {filter === 'all' && (
            <button
              onClick={() => onNavigate('composer')}
              style={{ background: '#E63329', color: '#FFF', fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 9, border: 'none', cursor: 'pointer' }}
            >
              + Create a Post
            </button>
          )}
        </div>
      ) : (
        <div style={{ background: '#111', border: '1px solid #1A1A1A', borderRadius: 14, padding: '4px 16px' }}>
          {shown.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderTop: i === 0 ? 'none' : '1px solid #1A1A1A' }}>
              {p.thumbnail ? (
                <img
                  src={`data:image/jpeg;base64,${p.thumbnail}`}
                  alt=""
                  style={{ width: thumbSize, height: thumbSize, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
                />
              ) : (
                <div style={{ width: thumbSize, height: thumbSize, background: '#1A1A1A', borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                  🎬
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#DDD', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.caption || p.title || p.filename || 'Untitled post'}
                </div>
                <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>
                  {(p.platforms || []).map((id) => PLATFORM_LABELS[id] || id).join(' · ') || '—'}
                  {p.source === 'ayrshare' && <span style={{ color: '#444', marginLeft: 8 }}>synced</span>}
                </div>
                {(p.errors || []).length > 0 && (
                  <div style={{ fontSize: 11, color: '#FF6B6B', marginTop: 5, lineHeight: 1.45, wordBreak: 'break-word' }}>
                    {p.errors.join('; ')}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: statusColor(p.status) }}>
                  {p.status}
                </div>
                {!Number.isNaN(Date.parse(p.date)) && (
                  <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>
                    {new Date(p.date).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
