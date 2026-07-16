import React, { useState } from 'react';
import { SOCIAL_PLATFORMS } from '../services/socialService';

const PLATFORM_LABELS = Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.id, p.label]));
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function DayDetail({ date, posts, onClose, onNavigate, isMobile }) {
  const sorted = [...posts].sort((a, b) => (Date.parse(a.date) || 0) - (Date.parse(b.date) || 0));
  const thumbSize = isMobile ? 36 : 44;

  return (
    <div style={{ background: '#111', border: '1px solid #1A1A1A', borderRadius: 14, padding: 16, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: sorted.length ? 4 : 0 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: '0.05em', color: '#FFF' }}>
          {WEEKDAYS_FULL[date.getDay()].toUpperCase()}, {MONTHS[date.getMonth()].toUpperCase()} {date.getDate()}
        </div>
        <button
          onClick={onClose}
          aria-label="Close day details"
          style={{ background: 'transparent', border: 'none', color: '#666', fontSize: 18, cursor: 'pointer', padding: '0 4px' }}
        >
          ×
        </button>
      </div>

      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '18px 0 10px' }}>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>Nothing scheduled for this day</div>
          <button
            onClick={() => onNavigate('composer')}
            style={{ background: '#E60306', color: '#FFF', fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 9, border: 'none', cursor: 'pointer' }}
          >
            + Schedule a Post
          </button>
        </div>
      ) : (
        sorted.map((p) => (
          <div key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderTop: '1px solid #1A1A1A' }}>
            {p.thumbnail ? (
              <img
                src={`data:image/jpeg;base64,${p.thumbnail}`}
                alt=""
                style={{ width: thumbSize, height: thumbSize, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
              />
            ) : (
              <div style={{ width: thumbSize, height: thumbSize, background: '#1A1A1A', borderRadius: 8, flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: '#DDD', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.caption || p.title || p.filename || 'Untitled post'}
              </div>
              <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>
                {(p.platforms || []).map((id) => PLATFORM_LABELS[id] || id).join(' · ') || '—'}
              </div>
              {p.status === 'failed' && (p.errors || []).length > 0 && (
                <div style={{ fontSize: 11, color: '#FF6B6B', marginTop: 5, lineHeight: 1.45, wordBreak: 'break-word' }}>
                  {p.errors.join('; ')}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: statusColor(p.status),
              }}>
                {p.status}
              </div>
              {!Number.isNaN(Date.parse(p.date)) && (
                <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>
                  {new Date(p.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

const STATUS_COLORS = { published: '#00C48C', scheduled: '#FFC107', failed: '#FF4444' };
const statusColor = (status) => STATUS_COLORS[status] || '#00C48C';

export default function CalendarView({ posts, onNavigate, isMobile = false }) {
  const today = new Date();
  const cellMinH = isMobile ? 62 : 110;
  const gridGap = isMobile ? 4 : 8;
  const maxChips = isMobile ? 1 : 3;
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);

  const goTo = (date) => {
    setSelected(null);
    setCursor(date);
  };

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build a grid of cells (leading blanks + days)
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const postsOn = (date) =>
    posts.filter((p) => p.date && sameDay(new Date(p.date), date));

  const navStyle = {
    background: '#1A1A1A',
    border: '1px solid #2A2A2A',
    color: '#CCC',
    width: 34,
    height: 34,
    borderRadius: 8,
    fontSize: 16,
    cursor: 'pointer',
  };

  return (
    <div>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button style={navStyle} onClick={() => goTo(new Date(year, month - 1, 1))}>‹</button>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: '0.04em', color: '#FFF', minWidth: 200 }}>
            {MONTHS[month]} {year}
          </div>
          <button style={navStyle} onClick={() => goTo(new Date(year, month + 1, 1))}>›</button>
        </div>
        <button
          onClick={() => goTo(new Date(today.getFullYear(), today.getMonth(), 1))}
          style={{ background: 'transparent', border: '1px solid #2A2A2A', color: '#888', fontSize: 12, padding: '7px 14px', borderRadius: 8, cursor: 'pointer' }}
        >
          Today
        </button>
      </div>

      {/* WEEKDAY LABELS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: gridGap, marginBottom: 8 }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ fontSize: isMobile ? 9 : 11, fontWeight: 600, letterSpacing: '0.06em', color: '#555', textTransform: 'uppercase', textAlign: 'center' }}>
            {isMobile ? w[0] : w}
          </div>
        ))}
      </div>

      {/* GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: gridGap }}>
        {cells.map((date, i) => {
          if (!date) return <div key={`b-${i}`} style={{ minHeight: cellMinH, background: '#0C0C0C', borderRadius: 10 }} />;
          const isToday = sameDay(date, today);
          const isSelected = selected && sameDay(date, selected);
          const isHovered = hovered === i;
          const dayPosts = postsOn(date);
          return (
            <div
              key={date.toISOString()}
              onClick={() => setSelected((s) => (s && sameDay(s, date) ? null : date))}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{
                minHeight: cellMinH,
                background: isSelected ? '#161010' : '#111',
                border: `1px solid ${isToday ? '#E60306' : isHovered ? '#333' : '#1A1A1A'}`,
                boxShadow: isSelected ? '0 0 0 1px #E60306' : 'none',
                borderRadius: 10,
                padding: isMobile ? 5 : 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <div style={{
                fontSize: 12,
                fontWeight: isToday ? 700 : 500,
                color: isToday ? '#E60306' : '#888',
                marginBottom: 2,
              }}>
                {date.getDate()}
              </div>
              {dayPosts.slice(0, maxChips).map((p) => (
                <div
                  key={p.id}
                  title={p.caption || p.title}
                  style={{
                    background: `${statusColor(p.status)}1F`,
                    borderLeft: `3px solid ${statusColor(p.status)}`,
                    borderRadius: 5,
                    padding: '3px 6px',
                    fontSize: 10,
                    color: '#CCC',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {(p.platforms || []).map((id) => PLATFORM_LABELS[id] || id).join(', ') || 'Post'}
                </div>
              ))}
              {dayPosts.length > maxChips && (
                <div style={{ fontSize: 9, color: '#555' }}>+{dayPosts.length - maxChips}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* DAY DETAIL — opens when a day is clicked */}
      {selected && (
        <DayDetail
          date={selected}
          posts={postsOn(selected)}
          onClose={() => setSelected(null)}
          onNavigate={onNavigate}
          isMobile={isMobile}
        />
      )}

      {/* LEGEND */}
      <div style={{ display: 'flex', gap: 18, marginTop: 18, alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#888' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: '#00C48C' }} /> Published
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#888' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: '#FFC107' }} /> Scheduled
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#888' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: '#FF4444' }} /> Failed
        </span>
        <button
          onClick={() => onNavigate('composer')}
          style={{ marginLeft: 'auto', background: '#E60306', color: '#FFF', fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 9, cursor: 'pointer' }}
        >
          + Schedule a Post
        </button>
      </div>
    </div>
  );
}
