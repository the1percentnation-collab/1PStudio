import React, { useState, useCallback, useRef } from 'react';
import DropZone from './DropZone';
import PublishPanel from './PublishPanel';
import ClipPreview from './ClipPreview';
import VideoEditorModal from './editor/VideoEditorModal';
import { generateClips, CLIP_LENGTHS } from '../services/clipService';
import { exportVideo } from '../services/videoExporter';
import { colors as c, fonts as f, radius as r } from '../theme';
import { Eyebrow, Display, Card, Button, ScoreRing } from './ui';

const PHASE_LABEL = {
  upload: 'Uploading video',
  transcribe: 'Transcribing — finding the words',
  select: 'AI is picking the best moments',
  done: 'Done',
};

function ClipCard({ result, onEdit, onPublished, onSaveToLibrary }) {
  const [rendering, setRendering] = useState(false);
  const [renderPct, setRenderPct] = useState(0);
  const [exported, setExported] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const abortRef = useRef(null);
  const clipLen = ((result.clip?.end ?? 0) - (result.clip?.start ?? 0));

  const render = useCallback(async () => {
    setRendering(true); setRenderPct(0); setError(null);
    try {
      const { promise, abort } = exportVideo({ videoUrl: result.videoUrl, spec: result.overlaySpec, onProgress: setRenderPct });
      abortRef.current = abort;
      const { blob, ext } = await promise;
      const url = URL.createObjectURL(blob);
      const base = (result.title || 'clip').replace(/[^\w]+/g, '-').slice(0, 40).toLowerCase() || 'clip';
      setExported({ url, file: new File([blob], `${base}.${ext}`, { type: blob.type }), ext });
    } catch (err) {
      if (err?.message !== 'cancelled') setError(err?.message || 'Render failed');
    } finally {
      setRendering(false); abortRef.current = null;
    }
  }, [result]);

  const save = useCallback(() => {
    onSaveToLibrary?.({
      id: result.id, filename: result.filename, mediaType: 'video',
      frames: { hookFrame: null }, content: result.content,
      transcript: (result.words || []).map((w) => w.w).join(' '),
    });
    setSaved(true);
  }, [result, onSaveToLibrary]);

  return (
    <Card pad={0} hover style={{ display: 'flex', flexDirection: 'column' }}>
      <ClipPreview result={result} />
      <div style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <ScoreRing score={result.hookScore} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.title}</div>
            <div style={{ fontFamily: f.mono, fontSize: 10.5, letterSpacing: '0.08em', color: c.textFaint, marginTop: 3 }}>
              {clipLen.toFixed(0)}S · {(result.clip?.start ?? 0).toFixed(0)}–{(result.clip?.end ?? 0).toFixed(0)}S
            </div>
          </div>
        </div>
        {result.reason && <div style={{ fontSize: 11.5, color: c.textDim, lineHeight: 1.45 }}>{result.reason}</div>}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {!exported && <Button onClick={render} disabled={rendering} style={{ padding: '9px 15px', fontSize: 12.5 }}>{rendering ? `Rendering ${Math.round(renderPct * 100)}%` : 'Render clip'}</Button>}
          {exported && <Button variant="ghost" style={{ padding: '9px 15px', fontSize: 12.5 }} onClick={() => { const a = document.createElement('a'); a.href = exported.url; a.download = exported.file.name; a.click(); }}>Download</Button>}
          <Button variant="ghost" onClick={() => onEdit(result.id)} style={{ padding: '9px 15px', fontSize: 12.5 }}>Edit</Button>
          <Button variant="ghost" onClick={save} disabled={saved} style={{ padding: '9px 15px', fontSize: 12.5, color: saved ? c.success : undefined }}>{saved ? 'Saved ✓' : 'Save'}</Button>
        </div>
        {rendering && (
          <div style={{ height: 4, background: c.inset, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round(renderPct * 100)}%`, background: c.red, transition: 'width 0.2s' }} />
          </div>
        )}
        {error && <div style={{ fontSize: 11.5, color: c.danger }}>{error}</div>}

        {exported ? (
          <PublishPanel videoFile={exported.file} content={result.content} onPublished={onPublished} filename={exported.file.name} thumbnail={null} mediaType="video" />
        ) : (
          <div style={{ fontSize: 11, color: c.textFaint, borderTop: `1px solid ${c.border}`, paddingTop: 11 }}>Render the clip to download or publish it.</div>
        )}
      </div>
    </Card>
  );
}

export default function ClipsView({ onPublished, onSaveToLibrary }) {
  const [clipCount, setClipCount] = useState(5);
  const [length, setLength] = useState('30-60s');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [clips, setClips] = useState([]);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [sourceName, setSourceName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const editing = clips.find((cl) => cl.id === editingId) || null;

  const onFiles = useCallback(async (files) => {
    const file = files.find((fl) => fl.type.startsWith('video/')) || files[0];
    if (!file) return;
    setBusy(true); setError(null); setWarning(null); setClips([]); setSourceName(file.name);
    try {
      const { results, warning: w } = await generateClips(file, { clipCount, length }, setProgress);
      setClips(results); setWarning(w);
    } catch (err) {
      setError(err?.message || 'Could not generate clips.');
    } finally {
      setBusy(false); setProgress(null);
    }
  }, [clipCount, length]);

  const onSaveSpec = useCallback((id, spec) => setClips((prev) => prev.map((cl) => (cl.id === id ? { ...cl, overlaySpec: spec } : cl))), []);

  const selWrap = { display: 'flex', alignItems: 'center', gap: 9, fontFamily: f.mono, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.textDim };
  const selCtl = { background: c.inset, color: '#fff', border: `1px solid ${c.border}`, borderRadius: r.sm, padding: '7px 9px', fontFamily: f.body, fontSize: 13 };

  return (
    <div>
      <Eyebrow style={{ marginBottom: 12 }}>AI Video Clipping</Eyebrow>
      <Display size={40} style={{ marginBottom: 12 }}>One long video, <span style={{ color: c.red }}>ten viral clips.</span></Display>
      <div style={{ fontSize: 14, color: c.textDim, lineHeight: 1.55, maxWidth: 640, marginBottom: 22 }}>
        Drop one long video. It gets transcribed, the AI picks the strongest moments, and each becomes a captioned vertical clip you can edit, download, or publish — all in this app.
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, marginBottom: 18 }}>
        <label style={selWrap}>Clips
          <input type="number" min={1} max={10} value={clipCount} disabled={busy} onChange={(e) => setClipCount(Math.max(1, Math.min(10, Number(e.target.value))))} style={{ ...selCtl, width: 58 }} />
        </label>
        <label style={selWrap}>Length
          <select value={length} disabled={busy} onChange={(e) => setLength(e.target.value)} style={selCtl}>
            {Object.keys(CLIP_LENGTHS).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
      </div>

      <DropZone onFilesSelected={onFiles} processing={busy} />

      {busy && progress && (
        <Card style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, color: '#fff', marginBottom: 10 }}>{PHASE_LABEL[progress.phase] || 'Working'}{sourceName ? ` — ${sourceName}` : ''}…</div>
          <div style={{ height: 6, background: c.inset, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: c.red, transition: 'width 0.3s', width: progress.phase === 'upload' ? `${Math.round((progress.pct || 0) * 100)}%` : progress.phase === 'transcribe' ? '55%' : progress.phase === 'select' ? '85%' : '100%' }} />
          </div>
        </Card>
      )}
      {error && <Card style={{ marginTop: 20, borderColor: 'rgba(255,90,90,0.4)', background: 'rgba(255,90,90,0.06)', color: '#FF9B9B', fontSize: 13 }}>{error}</Card>}
      {warning && !error && <Card style={{ marginTop: 20, borderColor: 'rgba(255,193,7,0.35)', background: 'rgba(255,193,7,0.06)', color: '#FFD98A', fontSize: 12.5 }}>{warning}</Card>}

      {clips.length > 0 && (
        <div style={{ marginTop: 30 }}>
          <Eyebrow dash dot={false} style={{ marginBottom: 16 }}>{clips.length} Clip{clips.length !== 1 ? 's' : ''} — Ranked by Hook</Eyebrow>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(244px, 1fr))', gap: 16 }}>
            {clips.map((cl) => <ClipCard key={cl.id} result={cl} onEdit={setEditingId} onPublished={onPublished} onSaveToLibrary={onSaveToLibrary} />)}
          </div>
        </div>
      )}

      {editing && <VideoEditorModal result={editing} onClose={() => setEditingId(null)} onSaveSpec={onSaveSpec} />}
    </div>
  );
}
