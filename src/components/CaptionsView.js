import React, { useState } from 'react';
import DropZone from './DropZone';
import { CAPTION_STYLES, renderCaptions } from '../services/captionService';

function formatMB(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`;
}

export default function CaptionsView() {
  const [style, setStyle] = useState('bold');
  const [phase, setPhase] = useState('idle'); // idle | uploading | rendering | done | error
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null); // { videoUrl }
  const [error, setError] = useState(null);
  const [filename, setFilename] = useState('');
  const [fileSize, setFileSize] = useState(0);

  const busy = phase === 'uploading' || phase === 'rendering';
  const isLarge = fileSize > 250 * 1024 * 1024;

  const handleFile = async (files) => {
    const file = files && files[0];
    if (!file) return;
    setFilename(file.name);
    setFileSize(file.size);
    setResult(null);
    setError(null);
    setProgress(0);
    setPhase('uploading');
    try {
      const data = await renderCaptions(file, style, (p) => {
        setProgress(p);
        if (p >= 1) setPhase('rendering');
      });
      setResult(data);
      setPhase('done');
    } catch (err) {
      setError(err.message);
      setPhase('error');
    }
  };

  const reset = () => {
    setPhase('idle');
    setResult(null);
    setError(null);
    setProgress(0);
    setFilename('');
    setFileSize(0);
  };

  return (
    <div style={{ maxWidth: 760 }}>
      {/* INTRO */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(230,3,6,0.12), rgba(230,3,6,0.02))',
        border: '1px solid #2A1012',
        borderRadius: 16,
        padding: '18px 20px',
        marginBottom: 20,
      }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: '0.04em', color: '#FFF' }}>
          AUTO CAPTIONS
        </div>
        <div style={{ fontSize: 13, color: '#999', marginTop: 6, lineHeight: 1.5 }}>
          Upload a video — it gets auto-transcribed and word-synced captions are burned right into the video.
        </div>
      </div>

      {/* STYLE PICKER */}
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: '#666', textTransform: 'uppercase', marginBottom: 8 }}>
        Caption Style
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {CAPTION_STYLES.map((s) => {
          const active = style === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setStyle(s.id)}
              disabled={busy}
              style={{
                background: active ? 'rgba(230,3,6,0.12)' : '#111',
                border: `1px solid ${active ? '#E60306' : '#2A2A2A'}`,
                borderRadius: 10,
                padding: '10px 14px',
                textAlign: 'left',
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: active ? '#E60306' : '#DDD' }}>{s.label}</div>
              <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{s.desc}</div>
            </button>
          );
        })}
      </div>

      {/* UPLOAD / PROGRESS / RESULT */}
      {phase === 'idle' && <DropZone onFilesSelected={handleFile} processing={false} />}

      {busy && (
        <div style={{ background: '#111', border: '1px solid #1A1A1A', borderRadius: 14, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: '#CCC', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filename}</span>
            {fileSize > 0 && <span style={{ fontSize: 12, color: '#666', flexShrink: 0 }}>{formatMB(fileSize)}</span>}
          </div>
          <div style={{ height: 6, background: '#1A1A1A', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{
              width: phase === 'uploading' ? `${Math.round(progress * 100)}%` : '100%',
              height: '100%',
              background: '#00C48C',
              transition: 'width 0.2s',
            }} />
          </div>
          <div style={{ fontSize: 12, color: '#888' }}>
            {phase === 'uploading'
              ? `Uploading video… ${Math.round(progress * 100)}%${isLarge ? ' — large file, this can take a while on mobile' : ''}`
              : 'Transcribing audio & burning in captions… this can take a few minutes for longer videos.'}
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div style={{ background: '#111', border: '1px solid #3A1515', borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#FF6B6B', marginBottom: 14, lineHeight: 1.5 }}>✕ {error}</div>
          <button onClick={reset} style={{ background: '#1A1A1A', border: '1px solid #333', color: '#CCC', fontSize: 13, padding: '8px 16px', borderRadius: 8 }}>
            Try another video
          </button>
        </div>
      )}

      {phase === 'done' && result && (
        <div style={{ background: '#111', border: '1px solid #1A1A1A', borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 13, color: '#00C48C', marginBottom: 12 }}>✓ Captions burned in</div>
          <video
            src={result.videoUrl}
            controls
            style={{ width: '100%', maxHeight: 480, borderRadius: 10, background: '#000', display: 'block', marginBottom: 14 }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a href={result.videoUrl} target="_blank" rel="noreferrer" download>
              <button style={{ background: '#E60306', color: '#FFF', fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 9 }}>
                Download ↓
              </button>
            </a>
            <button onClick={reset} style={{ background: '#1A1A1A', border: '1px solid #333', color: '#CCC', fontSize: 13, padding: '9px 16px', borderRadius: 9 }}>
              Caption another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
