import React, { useState } from 'react';
import { SOCIAL_PLATFORMS } from '../services/socialService';

const PLATFORM_LABELS = Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.id, p.label]));
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function CalendarView({ posts, onNavigate, isMobile = false }) {
  const today = new Date();
  const cellMinH = isMobile ? 62 : 110;
  const gridGap = isMobile ? 4 : 8;
  const maxChips = isMobile ? 1 : 3;
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

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
          <button style={navStyle} onClick={() => setCursor(new Date(year, month - 1, 1))}>‹</button>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: '0.04em', color: '#FFF', minWidth: 200 }}>
            {MONTHS[month]} {year}
          </div>
          <button style={navStyle} onClick={() => setCursor(new Date(year, month + 1, 1))}>›</button>
        </div>
        <button
          onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
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
          const dayPosts = postsOn(date);
          return (
            <div
              key={date.toISOString()}
              style={{
                minHeight: cellMinH,
                background: '#111',
                border: `1px solid ${isToday ? '#E60306' : '#1A1A1A'}`,
                borderRadius: 10,
                padding: isMobile ? 5 : 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
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
                    background: p.status === 'scheduled' ? 'rgba(255,193,7,0.12)' : 'rgba(0,196,140,0.12)',
                    borderLeft: `3px solid ${p.status === 'scheduled' ? '#FFC107' : '#00C48C'}`,
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

      {/* LEGEND */}
      <div style={{ display: 'flex', gap: 18, marginTop: 18, alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#888' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: '#00C48C' }} /> Published
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#888' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: '#FFC107' }} /> Scheduled
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
