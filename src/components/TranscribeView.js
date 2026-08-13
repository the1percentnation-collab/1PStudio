import React, { useState, useMemo, useRef } from 'react';
import DropZone from './DropZone';
import { Button, Card, Eyebrow } from './ui';
import { colors as c, fonts as f } from '../theme';
import {
  transcribeFile,
  toPlainText,
  toTimestampedText,
  toSRT,
  formatTime,
} from '../services/transcribeService';
import { reportError } from '../services/errorReporter';

function formatMB(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`;
}

// Downloads a string as a file without touching the network.
function downloadText(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const baseName = (name) => (name || 'transcript').replace(/\.[^.]+$/, '');

export default function TranscribeView() {
  const [phase, setPhase] = useState('idle'); // idle | uploading | transcribing | done | error
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null); // { transcript, words, paragraphs, durationSec }
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('plain'); // plain | stamped
  // The plain text is editable so you can tidy it before pasting.
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(null); // 'plain' | 'stamped'
  const copyTimer = useRef(null);

  const busy = phase === 'uploading' || phase === 'transcribing';

  const stampedText = useMemo(
    () => (result ? toTimestampedText(result.paragraphs) : ''),
    [result]
  );
  const wordCount = useMemo(
    () => (draft.trim() ? draft.trim().split(/\s+/).length : 0),
    [draft]
  );

  const handleFile = async (files) => {
    const picked = files && files[0];
    if (!picked) return;
    setFile(picked);
    setResult(null);
    setError(null);
    setProgress(0);
    setPhase('uploading');
    try {
      const data = await transcribeFile(picked, ({ phase: p, pct }) => {
        if (p === 'upload') {
          setProgress(pct || 0);
        } else if (p === 'transcribe') {
          setPhase('transcribing');
        }
      });
      setResult(data);
      setDraft(toPlainText(data.paragraphs));
      setTab('plain');
      setPhase('done');
    } catch (err) {
      reportError(err, { kind: 'transcribe', filename: picked.name });
      setError(err);
      setPhase('error');
    }
  };

  const copy = async (kind) => {
    const text = kind === 'stamped' ? stampedText : draft;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API is blocked outside https / on older Safari — fall back.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* nothing else to try */ }
      ta.remove();
    }
    setCopied(kind);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), 2000);
  };

  const reset = () => {
    setPhase('idle');
    setResult(null);
    setError(null);
    setProgress(0);
    setFile(null);
    setDraft('');
  };

  return (
    <div style={{ maxWidth: 860 }}>
      {/* INTRO */}
      <div
        style={{
          background: `linear-gradient(135deg, ${c.redGlow}, rgba(230,51,41,0.02))`,
          border: `1px solid ${c.border}`,
          borderRadius: 16,
          padding: '18px 20px',
          marginBottom: 20,
        }}
      >
        <div style={{ fontFamily: f.display, fontSize: 24, letterSpacing: '0.03em', color: '#FFF', textTransform: 'uppercase' }}>
          Video → Text
        </div>
        <div style={{ fontSize: 13, color: c.textDim, marginTop: 6, lineHeight: 1.55 }}>
          Drop a video or an audio file and get the full spoken transcript back — edit it,
          copy it, or download it as .txt / .srt. Nothing is captioned or posted here.
        </div>
      </div>

      {phase === 'idle' && (
        <DropZone
          onFilesSelected={handleFile}
          processing={false}
          accept="video/*,audio/*"
          multiple={false}
          heading="DROP A VIDEO OR AUDIO FILE"
          sub="Drag & drop one file, or click to browse"
          tip="Works with .mp4 / .mov / .m4a / .mp3 and more. Longer recordings take longer to come back — keep this tab open."
        />
      )}

      {busy && (
        <Card pad={22}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file?.name}
            </span>
            {file?.size > 0 && (
              <span style={{ fontSize: 12, color: c.textFaint, flexShrink: 0 }}>{formatMB(file.size)}</span>
            )}
          </div>
          <div style={{ height: 6, background: c.surfaceHi, borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
            <div
              style={{
                width: phase === 'uploading' ? `${Math.round(progress * 100)}%` : '100%',
                height: '100%',
                background: c.success,
                transition: 'width 0.2s',
              }}
            />
          </div>
          <div style={{ fontSize: 12.5, color: c.textDim, lineHeight: 1.5 }}>
            {phase === 'uploading'
              ? `Uploading… ${Math.round(progress * 100)}%${file?.size > 250 * 1024 * 1024 ? ' — large file, this can take a while on mobile' : ''}`
              : 'Transcribing the audio… this can take a couple of minutes for a long recording.'}
          </div>
        </Card>
      )}

      {phase === 'error' && (
        <Card pad={20} style={{ borderColor: '#3A1515' }}>
          <div style={{ fontSize: 13.5, color: c.danger, marginBottom: 8, lineHeight: 1.55 }}>
            ✕ {error?.message}
          </div>
          {error?.code === 'NOT_CONFIGURED' && (
            <div style={{ fontSize: 12.5, color: c.textDim, marginBottom: 14, lineHeight: 1.55 }}>
              Open <strong style={{ color: c.text }}>Settings</strong> and paste a Deepgram API key —
              the same key powers the Captions and Clips tabs.
            </div>
          )}
          <Button variant="ghost" onClick={reset}>Try another file</Button>
        </Card>
      )}

      {phase === 'done' && result && (
        <>
          {/* SUMMARY BAR */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
            <Eyebrow dash dot={false}>Transcript</Eyebrow>
            <span style={{ fontFamily: f.mono, fontSize: 11.5, color: c.textFaint, letterSpacing: '0.08em' }}>
              {wordCount} WORDS
              {result.durationSec > 0 && ` · ${formatTime(result.durationSec)}`}
              {file?.name && ` · ${file.name}`}
            </span>
          </div>

          {/* VIEW TOGGLE */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {[
              { id: 'plain', label: 'Plain text' },
              { id: 'stamped', label: 'With timestamps' },
            ].map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    background: active ? c.redGlow : c.inset,
                    border: `1px solid ${active ? c.redDim : c.border}`,
                    color: active ? c.red : c.textDim,
                    borderRadius: 9,
                    padding: '7px 14px',
                    fontFamily: f.body,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {tab === 'plain' ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck
              style={{
                width: '100%',
                minHeight: 340,
                background: c.inset,
                border: `1px solid ${c.border}`,
                borderRadius: 12,
                padding: 16,
                color: c.text,
                fontFamily: f.body,
                fontSize: 14.5,
                lineHeight: 1.7,
                outline: 'none',
                resize: 'vertical',
              }}
            />
          ) : (
            <div
              style={{
                background: c.inset,
                border: `1px solid ${c.border}`,
                borderRadius: 12,
                padding: 16,
                maxHeight: 460,
                overflowY: 'auto',
              }}
            >
              {result.paragraphs.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                  <span style={{ fontFamily: f.mono, fontSize: 12, color: c.red, flexShrink: 0, paddingTop: 2 }}>
                    {formatTime(p.start)}
                  </span>
                  <span style={{ fontSize: 14.5, color: c.text, lineHeight: 1.7 }}>{p.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* ACTIONS */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            <Button onClick={() => copy(tab)}>
              {copied === tab ? 'Copied ✓' : tab === 'stamped' ? 'Copy with timestamps' : 'Copy transcript'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => downloadText(tab === 'stamped' ? stampedText : draft, `${baseName(file?.name)}.txt`)}
            >
              Download .txt
            </Button>
            {result.words.length > 0 && (
              <Button
                variant="ghost"
                onClick={() => downloadText(toSRT(result.words), `${baseName(file?.name)}.srt`)}
              >
                Download .srt
              </Button>
            )}
            <Button variant="ghost" onClick={reset}>Transcribe another</Button>
          </div>
        </>
      )}
    </div>
  );
}
