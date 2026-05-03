import React, { useState } from 'react';

const PILLAR_COLORS = {
  'Self-Sabotage & Limiting Beliefs': '#E60306',
  'Accountability & Execution': '#FF6B00',
  'Identity & Mindset Shift': '#9B59B6',
  'Leadership & Purpose': '#2980B9',
};

function hookScoreColor(score) {
  if (score >= 7) return '#00C48C';
  if (score >= 5) return '#FFC107';
  return '#FF4444';
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const handle = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <button
      onClick={handle}
      style={{
        background: copied ? '#00C48C22' : '#1A1A1A',
        border: `1px solid ${copied ? '#00C48C' : '#2A2A2A'}`,
        color: copied ? '#00C48C' : '#666',
        fontSize: 10,
        padding: '3px 9px',
        borderRadius: 5,
        cursor: 'pointer',
        transition: 'all 0.2s',
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function Field({ label, value, muted }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: '#555', textTransform: 'uppercase' }}>
          {label}
        </span>
        <CopyBtn text={value} />
      </div>
      <div style={{ fontSize: 12, color: muted ? '#888' : '#CCC', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {value}
      </div>
    </div>
  );
}

function TitleRow({ title, index }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 8,
      background: '#0A0A0A',
      border: '1px solid #1A1A1A',
      borderRadius: 7,
      padding: '7px 10px',
      marginBottom: 5,
    }}>
      <span style={{ fontSize: 12, color: '#DDD', lineHeight: 1.4, flex: 1 }}>
        <span style={{ color: '#444', marginRight: 6 }}>{index + 1}.</span>{title}
      </span>
      <CopyBtn text={title} />
    </div>
  );
}

function LibraryCard({ item, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const { filename, frames, content, error, dateAdded } = item;
  const pillarColor = content ? (PILLAR_COLORS[content.content_pillar] || '#888') : '#888';

  return (
    <div style={{ background: '#111', border: '1px solid #1A1A1A', borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
      {/* COLLAPSED HEADER — always visible */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{ display: 'flex', gap: 12, padding: '12px 16px', cursor: 'pointer', alignItems: 'center', userSelect: 'none' }}
      >
        {frames?.hookFrame ? (
          <img
            src={`data:image/jpeg;base64,${frames.hookFrame}`}
            alt=""
            style={{ width: 72, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
          />
        ) : (
          <div style={{ width: 72, height: 40, background: '#1A1A1A', borderRadius: 6, flexShrink: 0 }} />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: '#CCC', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 5 }}>
            {filename}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {content && (
              <span style={{
                background: `${pillarColor}22`,
                border: `1px solid ${pillarColor}55`,
                color: pillarColor,
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.08em',
                padding: '2px 6px',
                borderRadius: 4,
                textTransform: 'uppercase',
              }}>
                {content.content_pillar}
              </span>
            )}
            {dateAdded && (
              <span style={{ fontSize: 10, color: '#444' }}>
                {new Date(dateAdded).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {content && (
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 26,
            lineHeight: 1,
            color: hookScoreColor(content.hook_score),
            flexShrink: 0,
          }}>
            {content.hook_score}/10
          </div>
        )}

        <div style={{ color: '#444', fontSize: 12, flexShrink: 0, marginLeft: 4 }}>
          {expanded ? '▲' : '▼'}
        </div>
      </div>

      {/* EXPANDED CONTENT */}
      {expanded && (
        <div style={{ borderTop: '1px solid #1A1A1A', padding: '14px 16px 16px' }}>
          {content ? (
            <>
              {content.titles?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: '#555', textTransform: 'uppercase', marginBottom: 8 }}>
                    TITLE OPTIONS
                  </div>
                  {content.titles.map((t, i) => <TitleRow key={i} title={t} index={i} />)}
                </div>
              )}
              <Field label="HEADLINE" value={content.headline} />
              <Field label="3-SEC SEO OPENER" value={content.seo_opener} />
              <Field label="CAPTION" value={content.caption} />
              <Field label="HASHTAGS" value={content.hashtags} muted />
              {content.hook_score_reason && (
                <div style={{ fontSize: 11, color: '#555', lineHeight: 1.5, marginTop: 4, marginBottom: 12 }}>
                  <span style={{ color: '#E60306' }}>Tip: </span>{content.hook_score_reason}
                </div>
              )}
            </>
          ) : error ? (
            <div style={{ fontSize: 12, color: '#FF4444', marginBottom: 12 }}>Error: {error}</div>
          ) : null}

          <button
            onClick={() => onDelete(item.id)}
            style={{
              background: 'transparent',
              border: '1px solid #2A2A2A',
              color: '#555',
              fontSize: 11,
              padding: '4px 12px',
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'color 0.2s, border-color 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#FF4444'; e.currentTarget.style.borderColor = '#FF4444'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; e.currentTarget.style.borderColor = '#2A2A2A'; }}
          >
            Remove from library
          </button>
        </div>
      )}
    </div>
  );
}

export default function LibraryView({ library, onDelete }) {
  if (library.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 24px', color: '#333' }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 22,
          letterSpacing: '0.06em',
          color: '#444',
          marginBottom: 10,
        }}>
          YOUR LIBRARY IS EMPTY
        </div>
        <div style={{ fontSize: 13, color: '#333' }}>
          Process videos in the Upload tab — they'll be saved here automatically.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: 20,
        letterSpacing: '0.06em',
        color: '#555',
        marginBottom: 16,
      }}>
        VIDEO LIBRARY — {library.length} video{library.length !== 1 ? 's' : ''}
      </div>
      {library.map((item) => (
        <LibraryCard key={item.id} item={item} onDelete={onDelete} />
      ))}
    </div>
  );
}
