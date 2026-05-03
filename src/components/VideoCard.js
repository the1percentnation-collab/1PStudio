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
      /* ignore */
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
        cursor: 'pointer',
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function ContentField({ label, value, mono }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: '#666', textTransform: 'uppercase' }}>
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

function FrameStrip({ frames }) {
  const available = [
    { label: 'HOOK', data: frames?.hookFrame },
    { label: 'MID', data: frames?.midFrame },
    { label: 'END', data: frames?.endFrame },
  ].filter((f) => f.data);

  if (available.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: 6, padding: '0 16px 14px' }}>
      {available.map(({ label, data }) => (
        <div key={label} style={{ flex: 1, position: 'relative' }}>
          <img
            src={`data:image/jpeg;base64,${data}`}
            alt={`${label} frame`}
            style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 8, display: 'block' }}
          />
          <span
            style={{
              position: 'absolute',
              top: 6,
              left: 6,
              background: 'rgba(0,0,0,0.7)',
              color: label === 'HOOK' ? '#E60306' : '#888',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.1em',
              padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            {label}
          </span>
          <a
            href={`data:image/jpeg;base64,${data}`}
            download={`frame-${label.toLowerCase()}.jpg`}
            style={{
              position: 'absolute',
              bottom: 6,
              right: 6,
              background: 'rgba(0,0,0,0.7)',
              color: '#CCC',
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 4,
              textDecoration: 'none',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            ↓
          </a>
        </div>
      ))}
    </div>
  );
}

function TitleOptions({ titles }) {
  if (!titles || titles.length === 0) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: '#666', textTransform: 'uppercase', marginBottom: 8 }}>
        TITLE OPTIONS
      </div>
      {titles.map((t, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 8,
            background: '#0A0A0A',
            border: '1px solid #1A1A1A',
            borderRadius: 8,
            padding: '8px 10px',
            marginBottom: 6,
          }}
        >
          <span style={{ fontSize: 12, color: '#DDD', lineHeight: 1.45, flex: 1 }}>{t}</span>
          <CopyButton text={t} small />
        </div>
      ))}
    </div>
  );
}

function TranscriptPanel({ onRegenerate, isRegenerating }) {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState('');

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: 'transparent',
          border: '1px dashed #333',
          color: '#666',
          fontSize: 12,
          padding: '7px 14px',
          borderRadius: 8,
          cursor: 'pointer',
          transition: 'color 0.2s, border-color 0.2s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#AAA'; e.currentTarget.style.borderColor = '#555'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; e.currentTarget.style.borderColor = '#333'; }}
      >
        + Add Transcript
      </button>
    );
  }

  return (
    <div style={{ width: '100%', marginTop: 4 }}>
      <textarea
        placeholder="Paste your video transcript here for more accurate titles, hooks, and captions…"
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        rows={4}
        style={{
          width: '100%',
          background: '#0A0A0A',
          border: '1px solid #2A2A2A',
          borderRadius: 8,
          color: '#CCC',
          fontSize: 12,
          lineHeight: 1.5,
          padding: '10px 12px',
          resize: 'vertical',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          marginBottom: 8,
        }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onRegenerate(transcript)}
          disabled={isRegenerating || !transcript.trim()}
          style={{
            background: '#E60306',
            color: '#FFF',
            fontSize: 13,
            fontWeight: 600,
            padding: '7px 16px',
            borderRadius: 8,
            cursor: isRegenerating || !transcript.trim() ? 'not-allowed' : 'pointer',
            opacity: isRegenerating || !transcript.trim() ? 0.5 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          {isRegenerating ? 'Regenerating…' : 'Regenerate with Transcript'}
        </button>
        <button
          onClick={() => { setOpen(false); setTranscript(''); }}
          style={{
            background: 'transparent',
            border: '1px solid #333',
            color: '#666',
            fontSize: 13,
            padding: '7px 12px',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function VideoCard({ result, onRegenerate, onRemove }) {
  const { id, filename, frames, content, error } = result;
  const [isRegenerating, setIsRegenerating] = useState(false);
  const pillarColor = content ? (PILLAR_COLORS[content.content_pillar] || '#888') : '#888';

  const handleRegenerate = async (transcript) => {
    setIsRegenerating(true);
    await onRegenerate(id, transcript);
    setIsRegenerating(false);
  };

  const buildAllText = () => {
    if (!content) return '';
    const titleLines = content.titles?.length
      ? `TITLE OPTIONS:\n${content.titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n`
      : '';
    return [
      titleLines,
      `HEADLINE: ${content.headline}`,
      `SEO OPENER: ${content.seo_opener}`,
      `CAPTION: ${content.caption}`,
      `HASHTAGS: ${content.hashtags}`,
    ].join('\n\n');
  };

  return (
    <div style={{ background: '#111111', border: '1px solid #1A1A1A', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
      {/* CARD HEADER */}
      <div style={{ padding: '14px 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {filename}
          </div>
          {content && (
            <div style={{
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
            }}>
              {content.content_pillar}
            </div>
          )}
          {content?.transcript_summary && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#777', lineHeight: 1.45 }}>
              {content.transcript_summary}
            </div>
          )}
        </div>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 32,
          lineHeight: 1,
          color: content ? hookScoreColor(content.hook_score) : '#444',
          flexShrink: 0,
        }}>
          {content ? `${content.hook_score}/10` : error ? 'ERR' : '...'}
        </div>
      </div>

      {/* FRAME STRIP — hook screenshot + mid + end, all downloadable */}
      <FrameStrip frames={frames} />

      {/* CONTENT FIELDS */}
      {content && (
        <div style={{ padding: '4px 16px 12px' }}>
          <TitleOptions titles={content.titles} />
          <ContentField label="HEADLINE" value={content.headline} mono />
          <ContentField label="3-SEC SEO OPENER" value={content.seo_opener} />
          <ContentField label="CAPTION" value={content.caption} />
          <ContentField label="HASHTAGS" value={content.hashtags} />

          {content.hook_score_reason && (
            <div style={{
              background: '#0A0A0A',
              border: '1px solid #1A1A1A',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 12,
              color: '#888',
              lineHeight: 1.5,
              marginBottom: 14,
            }}>
              <span style={{ color: '#E60306', fontWeight: 600 }}>Tip: </span>
              {content.hook_score_reason}
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ padding: '0 16px 14px', fontSize: 12, color: '#FF4444' }}>
          Error: {error}
        </div>
      )}

      {/* ACTIONS */}
      <div style={{ display: 'flex', gap: 8, padding: '0 16px 16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
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
              cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Copy All
          </button>
        )}

        <button
          onClick={() => handleRegenerate('')}
          disabled={isRegenerating}
          style={{
            background: '#1A1A1A',
            color: '#CCC',
            fontSize: 13,
            fontWeight: 600,
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid #333',
            cursor: isRegenerating ? 'not-allowed' : 'pointer',
            opacity: isRegenerating ? 0.5 : 1,
            transition: 'border-color 0.2s',
          }}
          onMouseEnter={(e) => !isRegenerating && (e.currentTarget.style.borderColor = '#E60306')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#333')}
        >
          Regenerate
        </button>

        <TranscriptPanel onRegenerate={handleRegenerate} isRegenerating={isRegenerating} />

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
            cursor: 'pointer',
            transition: 'color 0.2s, border-color 0.2s',
            marginLeft: 'auto',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#FF4444'; e.currentTarget.style.borderColor = '#FF4444'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; e.currentTarget.style.borderColor = 'transparent'; }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
