import React, { useState, useRef, useCallback, useEffect, useReducer } from 'react';
import EditorStage from './EditorStage';
import TextControls from './TextControls';
import CaptionControls from './CaptionControls';
import ExportPanel from './ExportPanel';
import Timeline from './Timeline';
import ToolSheet from './ToolSheet';
import { SpeedControls, CropControls, FilterControls, VolumeControls } from './ClipTools';
import { createDefaultSpec, makeTextElement } from '../../services/overlayRenderer';
import { uploadVideo } from '../../services/socialService';
import { groupWordsIntoCaptions } from '../../services/captionUtils';
import { colors as c, fonts as f, radius as r } from '../../theme';

function formatTime(t) {
  if (!Number.isFinite(t)) return '00:00';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Round-trip icons for the toolbar. Stroke-based so they inherit colour.
const ICONS = {
  trim: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" /><line x1="8.12" y1="8.12" x2="12" y2="12" /></>,
  speed: <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></>,
  crop: <><path d="M6.13 1 6 16a2 2 0 0 0 2 2h15" /><path d="M1 6.13 16 6a2 2 0 0 1 2 2v15" /></>,
  filter: <><path d="M12 2.5 6.5 9a6.5 6.5 0 1 0 11 0z" /></>,
  text: <><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></>,
  captions: <><rect x="3" y="5" width="18" height="14" rx="2" /><line x1="7" y1="11" x2="11" y2="11" /><line x1="14" y1="11" x2="17" y2="11" /><line x1="7" y1="15" x2="15" y2="15" /></>,
  volume: <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>,
  export: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
  undo: <><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></>,
  redo: <><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" /></>,
  expand: <><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></>,
  collapse: <><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></>,
  back: <><polyline points="15 18 9 12 15 6" /></>,
  next: <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
};

function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}

function RoundButton({ onClick, disabled, label: aria, children, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 38,
        height: 38,
        borderRadius: '50%',
        background: 'transparent',
        border: 'none',
        color: disabled ? c.textGhost : c.textDim,
        cursor: disabled ? 'default' : 'pointer',
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

const TOOLS = [
  { id: 'trim', label: 'Trim', icon: 'trim' },
  { id: 'text', label: 'Text', icon: 'text' },
  { id: 'captions', label: 'Captions', icon: 'captions' },
  { id: 'speed', label: 'Speed', icon: 'speed' },
  { id: 'crop', label: 'Reframe', icon: 'crop' },
  { id: 'filter', label: 'Filters', icon: 'filter' },
  { id: 'volume', label: 'Volume', icon: 'volume' },
  { id: 'export', label: 'Export', icon: 'export' },
];

export default function VideoEditorModal({ result, onClose, onSaveSpec }) {
  const videoRef = useRef(null);
  const initialSpec =
    result.overlaySpec ||
    createDefaultSpec({
      onScreenText: result.content?.on_screen_text || '',
      words: result.words || [],
    });

  const [spec, setSpec] = useState(initialSpec);
  const specRef = useRef(spec);
  specRef.current = spec;

  // History lives in refs and every transition is computed in one place. An
  // earlier version nested setState calls inside other setState updaters, which
  // left redo silently doing nothing.
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const lastPushRef = useRef(0);
  const [, bumpHistory] = useReducer((n) => n + 1, 0);

  const applySpec = useCallback((next) => {
    specRef.current = next;
    setSpec(next);
    bumpHistory();
  }, []);

  // Every mutation goes through this so undo/redo stays honest. Continuous
  // gestures (dragging a slider or a text block) pass coalesce so one drag is
  // one undo step instead of two hundred.
  const update = useCallback((updater, { coalesce = false } = {}) => {
    const prev = specRef.current;
    const next = typeof updater === 'function' ? updater(prev) : updater;
    if (next === prev) return;
    const now = Date.now();
    if (!(coalesce && now - lastPushRef.current < 600)) {
      pastRef.current = [...pastRef.current.slice(-49), prev];
    }
    lastPushRef.current = now;
    futureRef.current = [];
    applySpec(next);
  }, [applySpec]);

  const undo = useCallback(() => {
    if (!pastRef.current.length) return;
    const prev = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [specRef.current, ...futureRef.current];
    lastPushRef.current = 0; // never coalesce across an undo
    applySpec(prev);
  }, [applySpec]);

  const redo = useCallback(() => {
    if (!futureRef.current.length) return;
    const next = futureRef.current[0];
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current, specRef.current];
    lastPushRef.current = 0;
    applySpec(next);
  }, [applySpec]);

  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  const [selectedTextId, setSelectedTextId] = useState(initialSpec.texts[0]?.id || null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [videoDims, setVideoDims] = useState(null);
  const [tool, setTool] = useState(null);
  const [previewOnly, setPreviewOnly] = useState(false);
  const [exportState, setExportState] = useState({ status: 'idle', progress: 0, url: null, ext: null, error: null });

  const handleClose = useCallback(() => {
    onSaveSpec?.(result.id, specRef.current);
    onClose();
  }, [onSaveSpec, onClose, result.id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') handleClose();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose, undo, redo]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const patchText = useCallback((id, patch, opts) => {
    update((s) => ({ ...s, texts: s.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) }), opts);
  }, [update]);

  const addText = useCallback(() => {
    const el = makeTextElement({ text: 'NEW TEXT', x: 0.5, y: 0.5 });
    update((s) => ({ ...s, texts: [...s.texts, el] }));
    setSelectedTextId(el.id);
  }, [update]);

  const removeText = useCallback((id) => {
    update((s) => ({ ...s, texts: s.texts.filter((t) => t.id !== id) }));
    setSelectedTextId((cur) => (cur === id ? null : cur));
  }, [update]);

  const patchCaptions = useCallback((patch) => {
    update((s) => ({ ...s, captions: { ...s.captions, ...patch } }));
  }, [update]);

  const [words, setWords] = useState(() => result.words || []);
  const [capGen, setCapGen] = useState({ busy: false, message: null, error: null });

  const generateCaptions = useCallback(async () => {
    setCapGen({ busy: true, message: 'Preparing video…', error: null });
    try {
      const blob = await (await fetch(result.videoUrl)).blob();
      const file = new File([blob], result.filename || 'video.mp4', { type: blob.type || 'video/mp4' });
      const mediaUrl = await uploadVideo(file, (p) =>
        setCapGen({ busy: true, message: `Uploading… ${Math.round(p * 100)}%`, error: null })
      );
      setCapGen({ busy: true, message: 'Transcribing…', error: null });
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Transcription failed (${res.status})`);
      if (data.configured === false) throw new Error('Transcription isn’t configured on the server (Deepgram key missing).');
      const newWords = Array.isArray(data.words) ? data.words : [];
      if (newWords.length === 0) throw new Error('No speech was detected in this video.');
      setWords(newWords);
      patchCaptions({ enabled: true, lines: groupWordsIntoCaptions(newWords) });
      setCapGen({ busy: false, message: null, error: null });
    } catch (err) {
      setCapGen({ busy: false, message: null, error: err?.message || 'Caption generation failed.' });
    }
  }, [result.videoUrl, result.filename, patchCaptions]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }, []);

  const seek = useCallback((t) => {
    const v = videoRef.current;
    if (v) v.currentTime = t;
    setCurrentTime(t);
  }, []);

  const isRendering = exportState.status === 'rendering';
  const clip = spec.clip || null;
  const poster = result.frames?.hookFrame ? `data:image/jpeg;base64,${result.frames.hookFrame}` : null;

  const sheetTitle = TOOLS.find((t) => t.id === tool)?.label || '';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* TOP BAR */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'calc(10px + env(safe-area-inset-top, 0px)) 14px 10px',
          flexShrink: 0,
        }}
      >
        <RoundButton onClick={handleClose} label="Close editor" style={{ background: c.surface, color: '#FFF' }}>
          <Icon name="back" />
        </RoundButton>

        <div style={{ fontSize: 11.5, color: c.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 12px', flex: 1, textAlign: 'center' }}>
          {result.filename}
        </div>

        <RoundButton
          onClick={handleClose}
          disabled={isRendering}
          label="Done"
          style={{ background: isRendering ? c.surface : c.red, color: '#FFF' }}
        >
          <Icon name="next" />
        </RoundButton>
      </div>

      {/* PREVIEW */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, padding: '0 12px' }}>
        <EditorStage
          videoUrl={result.videoUrl}
          spec={spec}
          selectedTextId={selectedTextId}
          onSelectText={setSelectedTextId}
          onMoveText={(id, x, y) => patchText(id, { x, y }, { coalesce: true })}
          onTimeUpdate={setCurrentTime}
          onDurationKnown={setDuration}
          onDimsKnown={setVideoDims}
          onEnded={() => setPlaying(false)}
          videoRef={videoRef}
        />
      </div>

      {/* TRANSPORT */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 2px', flexShrink: 0 }}>
        <span style={{ fontFamily: f.mono, fontSize: 12.5, color: '#FFF', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {formatTime(currentTime)}
          <span style={{ color: c.textFaint }}>/{formatTime(duration)}</span>
        </span>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
            style={{ background: 'transparent', border: 'none', color: '#FFF', fontSize: 20, cursor: 'pointer', padding: 6, lineHeight: 1 }}
          >
            {playing ? '❚❚' : '▶'}
          </button>
        </div>

        <RoundButton onClick={undo} disabled={!canUndo} label="Undo"><Icon name="undo" /></RoundButton>
        <RoundButton onClick={redo} disabled={!canRedo} label="Redo"><Icon name="redo" /></RoundButton>
        <RoundButton onClick={() => setPreviewOnly((v) => !v)} label={previewOnly ? 'Show controls' : 'Hide controls'}>
          <Icon name={previewOnly ? 'collapse' : 'expand'} />
        </RoundButton>
      </div>

      {!previewOnly && (
        <>
          <Timeline
            videoUrl={result.videoUrl}
            duration={duration}
            currentTime={currentTime}
            clip={clip}
            onSeek={seek}
            onClipChange={(next) => update((s) => ({ ...s, clip: next }), { coalesce: true })}
          />

      {/* TOOL SHEET */}
      {tool && (
        <ToolSheet title={sheetTitle} onDone={() => setTool(null)}>
          {tool === 'trim' && (
            <div style={{ fontSize: 13, color: c.textDim, lineHeight: 1.6 }}>
              Drag the red handles on the timeline to set where the clip starts and ends. Everything
              outside them is cut from the export.
              {clip && (
                <button
                  onClick={() => update((s) => ({ ...s, clip: null }))}
                  style={{
                    display: 'block',
                    marginTop: 14,
                    background: c.inset,
                    border: `1px solid ${c.border}`,
                    color: '#FFF',
                    fontSize: 13,
                    padding: '10px 16px',
                    borderRadius: r.md,
                    cursor: 'pointer',
                  }}
                >
                  Reset trim
                </button>
              )}
            </div>
          )}

          {tool === 'text' && (
            <TextControls
              texts={spec.texts}
              selectedId={selectedTextId}
              duration={duration}
              onChange={(id, patch) => patchText(id, patch, { coalesce: true })}
              onAdd={addText}
              onRemove={removeText}
              onSelect={setSelectedTextId}
            />
          )}

          {tool === 'captions' && (
            <CaptionControls
              captions={spec.captions}
              hasWords={words.length > 0}
              onChange={patchCaptions}
              onGenerate={generateCaptions}
              generating={capGen.busy}
              generateMessage={capGen.message}
              generateError={capGen.error}
            />
          )}

          {tool === 'speed' && (
            <SpeedControls
              speed={spec.speed || 1}
              duration={duration}
              onChange={(speed) => update((s) => ({ ...s, speed }))}
            />
          )}

          {tool === 'crop' && (
            <CropControls
              crop={spec.crop || null}
              videoDims={videoDims}
              onChange={(crop) => update((s) => ({ ...s, crop }), { coalesce: true })}
            />
          )}

          {tool === 'filter' && (
            <FilterControls
              filter={spec.filter || 'none'}
              poster={poster}
              onChange={(filter) => update((s) => ({ ...s, filter }))}
            />
          )}

          {tool === 'volume' && (
            <VolumeControls
              volume={spec.volume == null ? 1 : spec.volume}
              onChange={(volume) => update((s) => ({ ...s, volume }), { coalesce: true })}
            />
          )}

          {tool === 'export' && (
            <ExportPanel
              videoUrl={result.videoUrl}
              spec={spec}
              filename={result.filename}
              duration={duration}
              exportState={exportState}
              setExportState={setExportState}
              compact
            />
          )}
        </ToolSheet>
      )}

          {/* TOOLBAR */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              padding: '8px 12px calc(10px + env(safe-area-inset-bottom, 0px))',
              flexShrink: 0,
              borderTop: `1px solid ${c.border}`,
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
            }}
            className="teleprompter-scroll"
          >
            {TOOLS.map((t) => {
              const active = tool === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTool(active ? null : t.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    minWidth: 74,
                    padding: '10px 8px',
                    borderRadius: r.md,
                    background: active ? c.redGlow : c.surface,
                    border: `1px solid ${active ? c.redDim : 'transparent'}`,
                    color: active ? c.red : '#FFF',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <Icon name={t.icon} />
                  <span style={{ fontSize: 11.5, fontWeight: 600 }}>{t.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

    </div>
  );
}
