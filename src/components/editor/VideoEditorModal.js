import React, { useState, useRef, useCallback, useEffect } from 'react';
import EditorStage from './EditorStage';
import TextControls from './TextControls';
import CaptionControls from './CaptionControls';
import ExportPanel from './ExportPanel';
import { createDefaultSpec, makeTextElement } from '../../services/overlayRenderer';
import { uploadVideo } from '../../services/socialService';
import { groupWordsIntoCaptions } from '../../services/captionUtils';

function formatTime(t) {
  if (!Number.isFinite(t)) return '0:00';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function VideoEditorModal({ result, onClose, onSaveSpec }) {
  const videoRef = useRef(null);
  const [spec, setSpec] = useState(() =>
    result.overlaySpec ||
    createDefaultSpec({
      onScreenText: result.content?.on_screen_text || '',
      words: result.words || [],
    })
  );
  const [selectedTextId, setSelectedTextId] = useState(spec.texts[0]?.id || null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exportState, setExportState] = useState({ status: 'idle', progress: 0, url: null, ext: null, error: null });
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const specRef = useRef(spec);
  specRef.current = spec;

  const handleClose = useCallback(() => {
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

  // Word timings may be missing (re-linked Library video, or transcription
  // failed during generation). Let the user transcribe on demand right here:
  // upload the video, hit /api/transcribe, and drop the timed lines into the
  // spec — no full Regenerate needed.
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

  const handleScrub = useCallback((e) => {
    const v = videoRef.current;
    const t = Number(e.target.value);
    if (v) v.currentTime = t;
    setCurrentTime(t);
  }, []);

  const isRendering = exportState.status === 'rendering';

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
          <span style={{ color: '#E63329' }}>VIDEO</span>
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
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#E63329')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#333')}
        >
          ✕
        </button>
      </div>

      {/* STAGE + CONTROLS — side by side on desktop, stacked (video on top) on mobile */}
      <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: 0, overflowY: isMobile ? 'auto' : 'hidden' }}>
        <div style={{
          display: 'flex',
          padding: isMobile ? '10px 10px 4px' : 16,
          minWidth: 0,
          flex: isMobile ? '0 0 auto' : 1,
          height: isMobile ? '48vh' : 'auto',
        }}>
          <EditorStage
            videoUrl={result.videoUrl}
            spec={spec}
            selectedTextId={selectedTextId}
            onSelectText={setSelectedTextId}
            onMoveText={(id, x, y) => patchText(id, { x, y })}
            onTimeUpdate={setCurrentTime}
            onDurationKnown={setDuration}
            onEnded={() => setPlaying(false)}
            videoRef={videoRef}
          />
        </div>

        <div
          style={{
            width: isMobile ? '100%' : 320,
            flexShrink: 0,
            borderLeft: isMobile ? 'none' : '1px solid #1A1A1A',
            borderTop: isMobile ? '1px solid #1A1A1A' : 'none',
            background: '#111',
            overflowY: isMobile ? 'visible' : 'auto',
            padding: 18,
          }}
        >
          <TextControls
            texts={spec.texts}
            selectedId={selectedTextId}
            duration={duration}
            onChange={patchText}
            onAdd={addText}
            onRemove={removeText}
            onSelect={setSelectedTextId}
          />
          <div style={{ borderTop: '1px solid #1A1A1A', margin: '18px 0' }} />
          <CaptionControls
            captions={spec.captions}
            hasWords={words.length > 0}
            onChange={patchCaptions}
            onGenerate={generateCaptions}
            generating={capGen.busy}
            generateMessage={capGen.message}
            generateError={capGen.error}
          />
        </div>
      </div>

      {/* BOTTOM BAR — playback + export; wraps to two rows on mobile */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 10 : 14,
          padding: isMobile ? '10px 14px' : '0 20px',
          minHeight: 64,
          borderTop: '1px solid #1A1A1A',
          flexShrink: 0,
          flexWrap: isMobile ? 'wrap' : 'nowrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14, flex: '1 1 220px', minWidth: 0 }}>
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
              flexShrink: 0,
              cursor: isRendering ? 'not-allowed' : 'pointer',
              opacity: isRendering ? 0.5 : 1,
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
            style={{ flex: 1, minWidth: 0, accentColor: '#E63329' }}
          />
          <span style={{ fontSize: 12, color: '#888', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
        <div style={{ flex: isMobile ? '1 1 100%' : '0 0 auto', display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 12 }}>
          <ExportPanel
            videoUrl={result.videoUrl}
            spec={spec}
            filename={result.filename}
            duration={duration}
            exportState={exportState}
            setExportState={setExportState}
            compact={isMobile}
            secondary
          />
          <button
            onClick={handleClose}
            disabled={isRendering}
            style={{
              background: '#E63329',
              color: '#FFF',
              fontSize: 14,
              fontWeight: 700,
              padding: '11px 22px',
              borderRadius: 8,
              border: 'none',
              cursor: isRendering ? 'not-allowed' : 'pointer',
              opacity: isRendering ? 0.5 : 1,
              whiteSpace: 'nowrap',
              flex: isMobile ? 1 : '0 0 auto',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => { if (!isRendering) e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={(e) => { if (!isRendering) e.currentTarget.style.opacity = '1'; }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
