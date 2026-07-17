import React, { useState, useCallback, useRef } from 'react';
import DropZone from './DropZone';
import PublishPanel from './PublishPanel';
import ClipPreview from './ClipPreview';
import VideoEditorModal from './editor/VideoEditorModal';
import { generateClips, CLIP_LENGTHS } from '../services/clipService';
import { exportVideo } from '../services/videoExporter';

const RED = '#E60306';
const PHASE_LABEL = {
  upload: 'Uploading video',
  transcribe: 'Transcribing (finding the words)',
  select: 'AI is picking the best moments',
  done: 'Done',
};

function HookRing({ score }) {
  const pct = Math.max(0, Math.min(10, score || 0)) * 10;
  const hue = 8 + pct * 1.2; // red -> gold -> green
  return (
    <div
      title={`Hook score ${score}/10`}
      style={{
        width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
        background: `conic-gradient(hsl(${hue} 85% 52%) ${pct * 3.6}deg, #222 0deg)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: '#fff' }}>
        {Math.round(score || 0)}
      </div>
    </div>
  );
}

function ClipCard({ result, onEdit, onPublished, onSaveToLibrary }) {
  const [rendering, setRendering] = useState(false);
  const [renderPct, setRenderPct] = useState(0);
  const [exported, setExported] = useState(null); // { url, file }
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const abortRef = useRef(null);
  const clipLen = ((result.clip?.end ?? 0) - (result.clip?.start ?? 0));

  const render = useCallback(async () => {
    setRendering(true); setRenderPct(0); setError(null);
    try {
      const { promise, abort } = exportVideo({
        videoUrl: result.videoUrl,
        spec: result.overlaySpec,
        onProgress: (p) => setRenderPct(p),
      });
      abortRef.current = abort;
      const { blob, ext } = await promise;
      const url = URL.createObjectURL(blob);
      const base = (result.title || 'clip').replace(/[^\w]+/g, '-').slice(0, 40).toLowerCase() || 'clip';
      const file = new File([blob], `${base}.${ext}`, { type: blob.type });
      setExported({ url, file, ext });
    } catch (err) {
      if (err?.message !== 'cancelled') setError(err?.message || 'Render failed');
    } finally {
      setRendering(false);
      abortRef.current = null;
    }
  }, [result]);

  const save = useCallback(() => {
    onSaveToLibrary?.({
      id: result.id,
      filename: result.filename,
      mediaType: 'video',
      frames: { hookFrame: null },
      content: result.content,
      transcript: (result.words || []).map((w) => w.w).join(' '),
    });
    setSaved(true);
  }, [result, onSaveToLibrary]);

  return (
    <div style={{ background: '#111', border: '1px solid #1A1A1A', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <ClipPreview result={result} />

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <HookRing score={result.hookScore} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.title}</div>
            <div style={{ fontSize: 11, color: '#777' }}>
              {clipLen.toFixed(0)}s · {(result.clip?.start ?? 0).toFixed(0)}–{(result.clip?.end ?? 0).toFixed(0)}s
            </div>
          </div>
        </div>
        {result.reason && <div style={{ fontSize: 11, color: '#999', lineHeight: 1.4 }}>{result.reason}</div>}

        {/* actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {!exported && (
            <button onClick={render} disabled={rendering}
              style={{ background: RED, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: rendering ? 'default' : 'pointer', opacity: rendering ? 0.6 : 1 }}>
              {rendering ? `Rendering ${Math.round(renderPct * 100)}%` : 'Render clip'}
            </button>
          )}
          {exported && (
            <a href={exported.url} download={exported.file.name}
              style={{ background: '#0C0C0C', color: '#fff', border: '1px solid #2A2A2A', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
              Download
            </a>
          )}
          <button onClick={() => onEdit(result.id)}
            style={{ background: '#0C0C0C', color: '#fff', border: '1px solid #2A2A2A', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Edit
          </button>
          <button onClick={save} disabled={saved}
            style={{ background: '#0C0C0C', color: saved ? '#00C48C' : '#fff', border: '1px solid #2A2A2A', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: saved ? 'default' : 'pointer' }}>
            {saved ? 'Saved ✓' : 'Save to Library'}
          </button>
        </div>
        {rendering && (
          <div style={{ height: 4, background: '#222', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round(renderPct * 100)}%`, background: RED, transition: 'width 0.2s' }} />
          </div>
        )}
        {error && <div style={{ fontSize: 11, color: '#FF6B6B' }}>{error}</div>}

        {/* Publish — only after the clip is rendered (posts the trimmed clip, not the source). */}
        {exported ? (
          <PublishPanel
            videoFile={exported.file}
            content={result.content}
            onPublished={onPublished}
            filename={exported.file.name}
            thumbnail={null}
            mediaType="video"
          />
        ) : (
          <div style={{ fontSize: 11, color: '#666', borderTop: '1px solid #1A1A1A', paddingTop: 10 }}>
            Render the clip to download or publish it.
          </div>
        )}
      </div>
    </div>
  );
}

export default function ClipsView({ onPublished, onSaveToLibrary }) {
  const [clipCount, setClipCount] = useState(5);
  const [length, setLength] = useState('30-60s');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { phase, pct }
  const [clips, setClips] = useState([]);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [sourceName, setSourceName] = useState('');
  const [editingId, setEditingId] = useState(null);

  const editing = clips.find((c) => c.id === editingId) || null;

  const onFiles = useCallback(async (files) => {
    const file = files.find((f) => f.type.startsWith('video/')) || files[0];
    if (!file) return;
    setBusy(true); setError(null); setWarning(null); setClips([]); setSourceName(file.name);
    try {
      const { results, warning: w } = await generateClips(file, { clipCount, length }, setProgress);
      setClips(results);
      setWarning(w);
    } catch (err) {
      setError(err?.message || 'Could not generate clips.');
    } finally {
      setBusy(false); setProgress(null);
    }
  }, [clipCount, length]);

  const onSaveSpec = useCallback((id, spec) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, overlaySpec: spec } : c)));
  }, []);

  const selWrap = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#ccc' };
  const selCtl = { background: '#0C0C0C', color: '#fff', border: '1px solid #2A2A2A', borderRadius: 8, padding: '6px 8px' };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: '#999', lineHeight: 1.5, maxWidth: 640 }}>
          Drop one long video. It gets transcribed, the AI picks the strongest moments, and each becomes a
          captioned vertical clip you can edit, download, or publish — all in this app.
        </div>
      </div>

      {/* options */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginBottom: 16 }}>
        <label style={selWrap}>Clips
          <input type="number" min={1} max={10} value={clipCount} disabled={busy}
            onChange={(e) => setClipCount(Math.max(1, Math.min(10, Number(e.target.value))))} style={{ ...selCtl, width: 60 }} />
        </label>
        <label style={selWrap}>Length
          <select value={length} disabled={busy} onChange={(e) => setLength(e.target.value)} style={selCtl}>
            {Object.keys(CLIP_LENGTHS).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
      </div>

      <DropZone onFilesSelected={onFiles} processing={busy} />

      {busy && progress && (
        <div style={{ marginTop: 20, background: '#111', border: '1px solid #1A1A1A', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 13, color: '#fff', marginBottom: 8 }}>
            {PHASE_LABEL[progress.phase] || 'Working'}{sourceName ? ` — ${sourceName}` : ''}…
          </div>
          <div style={{ height: 6, background: '#222', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: RED, transition: 'width 0.3s',
              width: progress.phase === 'upload' ? `${Math.round((progress.pct || 0) * 100)}%` : progress.phase === 'transcribe' ? '55%' : progress.phase === 'select' ? '85%' : '100%',
            }} />
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 20, background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.4)', borderRadius: 10, padding: 14, color: '#FF9B9B', fontSize: 13 }}>
          {error}
        </div>
      )}
      {warning && !error && (
        <div style={{ marginTop: 20, background: 'rgba(255,193,7,0.08)', border: '1px solid rgba(255,193,7,0.35)', borderRadius: 10, padding: 14, color: '#FFD98A', fontSize: 12 }}>
          {warning}
        </div>
      )}

      {clips.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: '0.06em', color: '#555', marginBottom: 16 }}>
            {clips.length} CLIP{clips.length !== 1 ? 'S' : ''} — RANKED BY HOOK
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {clips.map((c) => (
              <ClipCard key={c.id} result={c} onEdit={setEditingId} onPublished={onPublished} onSaveToLibrary={onSaveToLibrary} />
            ))}
          </div>
        </div>
      )}

      {editing && (
        <VideoEditorModal result={editing} onClose={() => setEditingId(null)} onSaveSpec={onSaveSpec} />
      )}
    </div>
  );
}
