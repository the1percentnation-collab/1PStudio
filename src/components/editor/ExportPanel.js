import React, { useRef, useEffect, useCallback } from 'react';
import { exportVideo, pickMimeType } from '../../services/videoExporter';

export default function ExportPanel({ videoUrl, spec, filename, duration, exportState, setExportState, compact = false, secondary = false }) {
  const jobRef = useRef(null);

  // revoke the exported blob URL when the panel unmounts (modal close)
  useEffect(() => () => {
    jobRef.current?.abort?.();
    if (exportState.url) URL.revokeObjectURL(exportState.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExport = useCallback(async () => {
    if (duration > 600 && !window.confirm(
      'This video is over 10 minutes. Export renders in real time (it will take about as long as the video). Continue?'
    )) return;

    if (exportState.url) URL.revokeObjectURL(exportState.url);
    setExportState({ status: 'rendering', progress: 0, url: null, ext: null, error: null });

    const job = exportVideo({
      videoUrl,
      spec,
      onProgress: (p) => setExportState((s) => (s.status === 'rendering' ? { ...s, progress: p } : s)),
    });
    jobRef.current = job;

    try {
      const { blob, ext } = await job.promise;
      setExportState({ status: 'done', progress: 1, url: URL.createObjectURL(blob), ext, error: null });
    } catch (err) {
      if (err?.message === 'cancelled') {
        setExportState({ status: 'idle', progress: 0, url: null, ext: null, error: null });
      } else {
        setExportState({ status: 'error', progress: 0, url: null, ext: null, error: err?.message || 'Export failed.' });
      }
    } finally {
      jobRef.current = null;
    }
  }, [videoUrl, spec, duration, exportState.url, setExportState]);

  const format = pickMimeType();
  const baseName = (filename || 'video').replace(/\.[^.]+$/, '');

  if (exportState.status === 'rendering') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 260 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
            Rendering… {Math.round(exportState.progress * 100)}% — keep this tab visible
          </div>
          <div style={{ height: 4, background: '#1A1A1A', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${exportState.progress * 100}%`, background: '#E63329', transition: 'width 0.3s' }} />
          </div>
        </div>
        <button
          onClick={() => jobRef.current?.abort()}
          style={{
            background: 'transparent',
            border: '1px solid #333',
            color: '#888',
            fontSize: 12,
            padding: '6px 12px',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: compact ? '100%' : undefined }}>
      {exportState.status === 'error' && (
        <span style={{ fontSize: 12, color: '#FF4444', maxWidth: 220 }}>{exportState.error}</span>
      )}
      {exportState.status === 'done' && exportState.url && (
        <a
          href={exportState.url}
          download={`${baseName}-edited.${exportState.ext}`}
          style={{
            background: '#00C48C',
            color: '#000',
            fontSize: 13,
            fontWeight: 700,
            padding: '11px 18px',
            borderRadius: 8,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            flex: compact ? 1 : undefined,
            textAlign: 'center',
          }}
        >
          ⬇ Download
        </a>
      )}
      <button
        onClick={handleExport}
        title="Render the edited video (captions & overlays baked in) and download it"
        style={{
          background: secondary ? 'transparent' : '#E63329',
          color: secondary ? '#CCC' : '#FFF',
          fontSize: 13,
          fontWeight: secondary ? 600 : 700,
          padding: '11px 18px',
          borderRadius: 8,
          border: secondary ? '1px solid #333' : 'none',
          cursor: 'pointer',
          transition: 'opacity 0.2s, border-color 0.2s',
          whiteSpace: 'nowrap',
          flex: compact ? 1 : undefined,
        }}
        onMouseEnter={(e) => {
          if (secondary) e.currentTarget.style.borderColor = '#E63329';
          else e.currentTarget.style.opacity = '0.85';
        }}
        onMouseLeave={(e) => {
          if (secondary) e.currentTarget.style.borderColor = '#333';
          else e.currentTarget.style.opacity = '1';
        }}
      >
        {exportState.status === 'done'
          ? 'Export again'
          : compact || secondary
            ? 'Export video'
            : `Export video${format ? ` (${format.label})` : ''}`}
      </button>
    </div>
  );
}
