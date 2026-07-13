import React, { useState, useRef, useCallback, useEffect } from 'react';
import EditorStage from './EditorStage';
import TextControls from './TextControls';
import CaptionControls from './CaptionControls';
import CropControls from './CropControls';
import ExportPanel from './ExportPanel';
import { createDefaultSpec, makeTextElement, getCrop, isFullFrame } from '../../services/overlayRenderer';
import { groupWordsIntoCaptions } from '../../services/captionUtils';
import { exportVideo } from '../../services/videoExporter';
import { transcribeUploadedFile } from '../../services/claudeService';

function formatTime(t) {
  if (!Number.isFinite(t)) return '0:00';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function VideoEditorModal({ result, onClose, onSaveSpec, onWordsResolved, onContinueToPost }) {
  const videoRef = useRef(null);
  const [spec, setSpec] = useState(() => {
    const base =
      result.overlaySpec ||
      createDefaultSpec({
        onScreenText: result.content?.on_screen_text || '',
        words: result.words || [],
      });
    // ensure older saved specs get a crop field
    return base.crop ? base : { ...base, crop: { x: 0, y: 0, w: 1, h: 1 } };
  });
  const [words, setWords] = useState(result.words || []);
  // Composer items are blob: URLs (same-origin). Library items are remote
  // Firebase Storage URLs — route those through our same-origin media proxy so
  // the canvas preview AND export/bake work without any bucket CORS policy.
  const sourceUrl = !result.videoUrl
    ? null
    : result.videoUrl.startsWith('blob:')
      ? result.videoUrl
      : `/api/media?url=${encodeURIComponent(result.videoUrl)}`;
  const [selectedTextId, setSelectedTextId] = useState(spec.texts[0]?.id || null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [videoDims, setVideoDims] = useState(null);
  const [cropMode, setCropMode] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [continueProgress, setContinueProgress] = useState(0);
  const [exportState, setExportState] = useState({ status: 'idle', progress: 0, url: null, ext: null, error: null });

  const specRef = useRef(spec);
  specRef.current = spec;
  const continueJobRef = useRef(null);

  const handleClose = useCallback(() => {
    continueJobRef.current?.abort?.();
    onSaveSpec?.(result.id, specRef.current);
    onClose();
  }, [onSaveSpec, onClose, result.id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  // lock page scroll while the editor is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const patchText = useCallback((id, patch) => {
    setSpec((s) => ({ ...s, texts: s.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  }, []);

  const addText = useCallback(() => {
    const el = makeTextElement({ text: 'NEW TEXT', x: 0.5, y: 0.5 });
    setSpec((s) => ({ ...s, texts: [...s.texts, el] }));
    setSelectedTextId(el.id);
  }, []);

  const removeText = useCallback((id) => {
    setSpec((s) => ({ ...s, texts: s.texts.filter((t) => t.id !== id) }));
    setSelectedTextId((cur) => (cur === id ? null : cur));
  }, []);

  const patchCaptions = useCallback((patch) => {
    setSpec((s) => ({ ...s, captions: { ...s.captions, ...patch } }));
  }, []);

  const setCrop = useCallback((crop) => {
    setSpec((s) => ({ ...s, crop }));
  }, []);

  // "Generate captions" — transcribe this video on demand, inject the words
  const handleGenerateCaptions = useCallback(async (onProgress) => {
    const t = await transcribeUploadedFile(result._file, onProgress);
    setWords(t.words);
    setSpec((s) => ({ ...s, captions: { ...s.captions, enabled: true, lines: groupWordsIntoCaptions(t.words) } }));
    onWordsResolved?.(result.id, t.words);
  }, [result._file, result.id, onWordsResolved]);

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

  const handleScrub = useCallback((e) => {
    const v = videoRef.current;
    const t = Number(e.target.value);
    if (v) v.currentTime = t;
    setCurrentTime(t);
  }, []);

  // "Continue to Post": bake the edits (if any), then hand the file to the card
  const handleContinueToPost = useCallback(async () => {
    onSaveSpec?.(result.id, specRef.current);
    const s = specRef.current;
    const crop = getCrop(s);
    const bakeable =
      (s.texts || []).some((t) => t.text && t.text.trim()) ||
      s.captions?.enabled ||
      !isFullFrame(crop);

    if (!bakeable) {
      onContinueToPost?.(result.id, null);
      return;
    }

    setContinuing(true);
    setContinueProgress(0);
    const job = exportVideo({ videoUrl: sourceUrl, spec: s, onProgress: setContinueProgress });
    continueJobRef.current = job;
    try {
      const { blob, ext } = await job.promise;
      const base = (result.filename || 'video').replace(/\.[^.]+$/, '');
      const file = new File([blob], `${base}-edited.${ext}`, { type: blob.type || 'video/mp4' });
      onContinueToPost?.(result.id, file);
    } catch (err) {
      if (err?.message !== 'cancelled') {
        setExportState({ status: 'error', progress: 0, url: null, ext: null, error: err?.message || 'Could not prepare the edited video.' });
      }
      setContinuing(false);
    } finally {
      continueJobRef.current = null;
    }
  }, [onSaveSpec, onContinueToPost, result.id, result.filename, sourceUrl]);

  const isRendering = exportState.status === 'rendering' || continuing;
  const hasWords = words.length > 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: '#0A0A0A',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* HEADER */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '0 20px',
          height: 56,
          borderBottom: '1px solid #1A1A1A',
          flexShrink: 0,
        }}
      >
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: '0.05em' }}>
          <span style={{ color: '#E60306' }}>VIDEO</span>
          <span style={{ color: '#FFF', marginLeft: 6 }}>EDITOR</span>
        </div>
        <div style={{ flex: 1, fontSize: 12, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {result.filename}
        </div>
        <button
          onClick={handleClose}
          aria-label="Close editor"
          style={{
            background: 'transparent',
            border: '1px solid #333',
            color: '#CCC',
            fontSize: 14,
            width: 32,
            height: 32,
            borderRadius: 8,
            cursor: 'pointer',
            transition: 'border-color 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#E60306')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#333')}
        >
          ✕
        </button>
      </div>

      {/* STAGE + CONTROLS */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', padding: 16, minWidth: 0 }}>
          {sourceUrl ? (
          <EditorStage
            videoUrl={sourceUrl}
            spec={spec}
            selectedTextId={selectedTextId}
            onSelectText={setSelectedTextId}
            onMoveText={(id, x, y) => patchText(id, { x, y })}
            onTimeUpdate={setCurrentTime}
            onDurationKnown={setDuration}
            onDimsKnown={setVideoDims}
            onEnded={() => setPlaying(false)}
            videoRef={videoRef}
            cropMode={cropMode}
            onCropChange={setCrop}
          />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 14 }}>
              Loading video…
            </div>
          )}
        </div>

        <div
          style={{
            width: 320,
            flexShrink: 0,
            borderLeft: '1px solid #1A1A1A',
            background: '#111',
            overflowY: 'auto',
            padding: 18,
          }}
        >
          <TextControls
            texts={spec.texts}
            selectedId={selectedTextId}
            duration={duration}
            currentTime={currentTime}
            onChange={patchText}
            onAdd={addText}
            onRemove={removeText}
            onSelect={setSelectedTextId}
          />
          <div style={{ borderTop: '1px solid #1A1A1A', margin: '18px 0' }} />
          <CropControls
            crop={spec.crop}
            sourceDims={videoDims}
            cropMode={cropMode}
            onSetCrop={(c) => { setCrop(c); }}
            onToggleCropMode={setCropMode}
          />
          <div style={{ borderTop: '1px solid #1A1A1A', margin: '18px 0' }} />
          <CaptionControls
            captions={spec.captions}
            hasWords={hasWords}
            canGenerate={!!result._file}
            onGenerate={handleGenerateCaptions}
            onChange={patchCaptions}
          />
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '0 20px',
          height: 64,
          borderTop: '1px solid #1A1A1A',
          flexShrink: 0,
        }}
      >
        <button
          onClick={togglePlay}
          disabled={isRendering}
          aria-label={playing ? 'Pause' : 'Play'}
          style={{
            background: '#1A1A1A',
            border: '1px solid #333',
            color: '#FFF',
            fontSize: 14,
            width: 40,
            height: 40,
            borderRadius: '50%',
            cursor: isRendering ? 'not-allowed' : 'pointer',
            opacity: isRendering ? 0.5 : 1,
            flexShrink: 0,
          }}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.05}
          value={Math.min(currentTime, duration || 0)}
          onChange={handleScrub}
          disabled={isRendering}
          style={{ flex: 1, accentColor: '#E60306' }}
        />
        <span style={{ fontSize: 12, color: '#888', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        {/* Continue to Post — bakes edits then jumps to the publish panel */}
        <button
          onClick={handleContinueToPost}
          disabled={isRendering}
          style={{
            background: '#00C48C',
            color: '#03150F',
            fontSize: 13,
            fontWeight: 700,
            padding: '9px 18px',
            borderRadius: 8,
            border: 'none',
            cursor: isRendering ? 'not-allowed' : 'pointer',
            opacity: exportState.status === 'rendering' ? 0.5 : 1,
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {continuing ? `Preparing… ${Math.round(continueProgress * 100)}%` : 'Continue to Post →'}
        </button>

        <div style={{ pointerEvents: continuing ? 'none' : 'auto', opacity: continuing ? 0.5 : 1 }}>
          <ExportPanel
            videoUrl={sourceUrl}
            spec={spec}
            filename={result.filename}
            duration={duration}
            exportState={exportState}
            setExportState={setExportState}
          />
        </div>
      </div>
    </div>
  );
}
