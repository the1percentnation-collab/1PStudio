import React from 'react';

const STATUS_COLORS = {
  waiting: '#333333',
  processing: '#E63329',
  done: '#00C48C',
  error: '#FF4444',
};

export default function QueueProgress({ queue }) {
  const total = queue.length;
  const done = queue.filter((i) => i.status === 'done' || i.status === 'error').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  if (total === 0) return null;

  const containerStyle = {
    background: '#111111',
    border: '1px solid #1A1A1A',
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  };

  const labelStyle = {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 18,
    letterSpacing: '0.05em',
    color: '#FFFFFF',
  };

  const countStyle = {
    fontSize: 13,
    color: '#888',
  };

  const barTrackStyle = {
    width: '100%',
    height: 4,
    background: '#1A1A1A',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 16,
  };

  const barFillStyle = {
    height: '100%',
    width: `${pct}%`,
    background: '#E63329',
    borderRadius: 2,
    transition: 'width 0.4s ease',
  };

  const listStyle = {
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 240,
    overflowY: 'auto',
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={labelStyle}>PROCESSING QUEUE</span>
        <span style={countStyle}>{done}/{total} complete</span>
      </div>
      <div style={barTrackStyle}>
        <div style={barFillStyle} />
      </div>
      <ul style={listStyle}>
        {queue.map((item) => (
          <li
            key={item.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 13,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: STATUS_COLORS[item.status] || '#333',
                flexShrink: 0,
                transition: 'background 0.3s',
              }}
            />
            <span
              style={{
                color: '#CCC',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.filename}
            </span>
            {item.message && (
              <span style={{ color: '#666', fontSize: 12, flexShrink: 0 }}>
                {item.message}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
