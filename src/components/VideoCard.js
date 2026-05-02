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

function CopyButton({ text, small }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* fallback: ignore */
    }
  };

  return (
    <button
      onClick={handleCopy}
      style={{
        background: copied ? '#00C48C22' : '#1A1A1A',
        border: `1px solid ${copied ? '#00C48C' : '#333'}`,
        color: copied ? '#00C48C' : '#888',
        fontSize: small ? 11 : 12,
        padding: small ? '2px 8px' : '4px 10px',
        borderRadius: 6,
        transition: 'all 0.2s',
        flexShrink: 0,
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function ContentField({ label, value, mono }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.12em',
            color: '#666',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        <CopyButton text={value} small />
      </div>
      <div
        style={{
          fontSize: 13,
          color: label === 'HASHTAGS' ? '#888' : '#FFFFFF',
          fontFamily: mono ? "'Courier New', monospace" : "'DM Sans', sans-serif",
          fontWeight: mono ? 700 : 400,
          lineHeight: 1.55,
          whiteSpace: label === 'HASHTAGS' ? 'normal' : 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function VideoCard({ result, onRegenerate, onRemove }) {
  const { id, filename, thumbnail, content, error } = result;
  const pillarColor = content ? (PILLAR_COLORS[content.content_pillar] || '#888') : '#888';

  const cardStyle = {
    background: '#111111',
    border: '1px solid #1A1A1A',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  };

  const headerStyle = {
    padding: '14px 16px 0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  };

  const filenameStyle = {
    fontSize: 12,
    color: '#888',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '70%',
  };

  const scoreStyle = {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 32,
    lineHeight: 1,
    color: content ? hookScoreColor(content.hook_score) : '#444',
    flexShrink: 0,
  };

  const thumbnailWrapStyle = {
    position: 'relative',
    width: '100%',
    aspectRatio: '16/9',
    background: '#0A0A0A',
    overflow: 'hidden',
    marginTop: 12,
  };

  const overlayStyle = {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
    padding: '32px 14px 12px',
  };

  const bodyStyle = {
    padding: '16px 16px 12px',
  };

  const tipStyle = {
    background: '#0A0A0A',
    border: '1px solid #1A1A1A',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 12,
    color: '#888',
    lineHeight: 1.5,
    marginBottom: 14,
  };

  const actionsStyle = {
    display: 'flex',
    gap: 8,
    padding: '0 16px 16px',
  };

  const buildAllText = () => {
    if (!content) return '';
    return [
      `HEADLINE: ${content.headline}`,
      `SEO OPENER: ${content.seo_opener}`,
      `CAPTION: ${content.caption}`,
      `HASHTAGS: ${content.hashtags}`,
    ].join('\n\n');
  };

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <div>
          <div style={filenameStyle}>{filename}</div>
          {content && (
            <div
              style={{
                marginTop: 6,
                display: 'inline-block',
                background: `${pillarColor}22`,
                border: `1px solid ${pillarColor}55`,
                color: pillarColor,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.08em',
                padding: '3px 8px',
                borderRadius: 4,
                textTransform: 'uppercase',
              }}
            >
              {content.content_pillar}
            </div>
          )}
        </div>
        <div style={scoreStyle}>
          {content ? `${content.hook_score}/10` : error ? 'ERR' : '...'}
        </div>
      </div>

      <div style={thumbnailWrapStyle}>
        {thumbnail ? (
          <img
            src={`data:image/jpeg;base64,${thumbnail}`}
            alt="Video frame"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#333',
              fontSize: 32,
            }}
          >
            🎬
          </div>
        )}
        {content && (
          <div style={overlayStyle}>
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 18,
                letterSpacing: '0.03em',
                color: '#FFFFFF',
                marginBottom: 4,
                lineHeight: 1.1,
              }}
            >
              {content.headline}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>
              {content.seo_opener}
            </div>
          </div>
        )}
        {error && (
          <div style={overlayStyle}>
            <div style={{ fontSize: 12, color: '#FF4444' }}>Error: {error}</div>
          </div>
        )}
      </div>

      {content && (
        <div style={bodyStyle}>
          <ContentField label="HEADLINE" value={content.headline} mono />
          <ContentField label="3-SEC SEO OPENER" value={content.seo_opener} />
          <ContentField label="CAPTION" value={content.caption} />
          <ContentField label="HASHTAGS" value={content.hashtags} />

          {content.hook_score_reason && (
            <div style={tipStyle}>
              <span style={{ color: '#E60306', fontWeight: 600 }}>Tip: </span>
              {content.hook_score_reason}
            </div>
          )}
        </div>
      )}

      <div style={actionsStyle}>
        {content && (
          <button
            onClick={() => navigator.clipboard.writeText(buildAllText()).catch(() => {})}
            style={{
              background: '#E60306',
              color: '#FFF',
              fontSize: 13,
              fontWeight: 600,
              padding: '8px 16px',
              borderRadius: 8,
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => (e.target.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.target.style.opacity = '1')}
          >
            Copy All
          </button>
        )}
        <button
          onClick={() => onRegenerate(id)}
          style={{
            background: '#1A1A1A',
            color: '#CCC',
            fontSize: 13,
            fontWeight: 600,
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid #333',
            transition: 'border-color 0.2s',
          }}
          onMouseEnter={(e) => (e.target.style.borderColor = '#E60306')}
          onMouseLeave={(e) => (e.target.style.borderColor = '#333')}
        >
          Regenerate
        </button>
        <button
          onClick={() => onRemove(id)}
          style={{
            background: 'transparent',
            color: '#666',
            fontSize: 13,
            fontWeight: 600,
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid transparent',
            transition: 'color 0.2s, border-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.target.style.color = '#FF4444';
            e.target.style.borderColor = '#FF4444';
          }}
          onMouseLeave={(e) => {
            e.target.style.color = '#666';
            e.target.style.borderColor = 'transparent';
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
