import React, { useState, useRef, useEffect } from 'react';
import { PHOTO_PLATFORMS, publishPhotoPost } from '../services/socialService';

// Standalone composer for photo + text posts. Uploads an image and publishes
// it with a caption to the same social channels the video flow uses (minus
// YouTube, which is video-only), via the Ayrshare-backed publish endpoint.
export default function PhotoComposer({ onPublished }) {
  const [photoFile, setPhotoFile] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [caption, setCaption] = useState('');
  const [selected, setSelected] = useState(() => PHOTO_PLATFORMS.map((p) => p.id));
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [posting, setPosting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(null); // { type: 'ok'|'error', message }
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!photoFile) { setPhotoUrl(null); return undefined; }
    const url = URL.createObjectURL(photoFile);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const pickFirstImage = (files) => {
    const img = Array.from(files).find((f) => f.type.startsWith('image/'));
    if (img) { setPhotoFile(img); setStatus(null); }
  };

  const togglePlatform = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const allSelected = selected.length === PHOTO_PLATFORMS.length;
  const toggleAll = () => setSelected(allSelected ? [] : PHOTO_PLATFORMS.map((p) => p.id));

  const uploadPct = Math.round(progress * 100);
  const canPost = !posting && photoFile && selected.length > 0 && caption.trim();

  const handlePost = async () => {
    const scheduleDate = scheduleOn && scheduleAt ? new Date(scheduleAt).toISOString() : null;
    if (scheduleOn && !scheduleAt) {
      setStatus({ type: 'error', message: 'Pick a date and time to schedule.' });
      return;
    }

    setPosting(true);
    setStatus(null);
    setProgress(0);
    try {
      await publishPhotoPost(photoFile, {
        post: caption,
        title: caption.slice(0, 99),
        platforms: selected,
        scheduleDate,
        onProgress: setProgress,
      });
      const isScheduled = Boolean(scheduleDate);
      setStatus({
        type: 'ok',
        message: isScheduled
          ? `Scheduled for ${new Date(scheduleDate).toLocaleString()} on ${selected.length} platform${selected.length !== 1 ? 's' : ''}.`
          : `Posted to ${selected.length} platform${selected.length !== 1 ? 's' : ''}.`,
      });
      if (onPublished) {
        onPublished({
          id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          caption,
          title: caption.slice(0, 99),
          platforms: selected,
          filename: photoFile.name,
          thumbnail: photoUrl || null,
          date: scheduleDate || new Date().toISOString(),
          status: isScheduled ? 'scheduled' : 'published',
        });
      }
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setPosting(false);
    }
  };

  const labelStyle = { display: 'block', fontSize: 10, fontWeight: 600, color: '#666', letterSpacing: '0.12em', marginBottom: 8, textTransform: 'uppercase' };

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 20, lineHeight: 1.5 }}>
        Add a photo and a caption, then publish it to all your channels at once — TikTok, Instagram, Facebook, X, and LinkedIn.
      </div>

      {/* PHOTO */}
      {photoUrl ? (
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <img
            src={photoUrl}
            alt="Post"
            style={{ width: '100%', maxHeight: 380, objectFit: 'contain', borderRadius: 12, background: '#0A0A0A', display: 'block' }}
          />
          <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
            <button
              onClick={() => inputRef.current?.click()}
              style={{ background: 'rgba(0,0,0,0.75)', color: '#CCC', border: '1px solid #333', fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer' }}
            >
              Replace
            </button>
            <button
              onClick={() => setPhotoFile(null)}
              style={{ background: 'rgba(0,0,0,0.75)', color: '#FF6B6B', border: '1px solid #402020', fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer' }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
          onDrop={(e) => { e.preventDefault(); setDragging(false); pickFirstImage(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? '#E60306' : '#1A1A1A'}`,
            borderRadius: 12,
            padding: '44px 32px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? 'rgba(230,3,6,0.05)' : 'transparent',
            transition: 'border-color 0.2s, background 0.2s',
            userSelect: 'none',
            marginBottom: 20,
          }}
        >
          <span style={{ fontSize: 44, display: 'block', marginBottom: 14 }}>🖼️</span>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: '0.05em', color: '#FFFFFF', marginBottom: 6 }}>
            DROP A PHOTO
          </div>
          <div style={{ fontSize: 13, color: '#888' }}>Drag &amp; drop an image, or click to browse</div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => { pickFirstImage(e.target.files || []); e.target.value = ''; }}
      />

      {/* CAPTION */}
      <label style={labelStyle}>Caption</label>
      <textarea
        placeholder="Write your caption… e.g. Stop waiting for permission to start. Your excuses are costing you the life you want."
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={5}
        style={{
          width: '100%',
          background: '#0A0A0A',
          border: '1px solid #2A2A2A',
          borderRadius: 8,
          color: '#CCC',
          fontSize: 13,
          lineHeight: 1.5,
          padding: '10px 12px',
          resize: 'vertical',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          marginBottom: 20,
        }}
      />

      {/* PLATFORMS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={labelStyle}>Post to channels</span>
        <button
          onClick={toggleAll}
          style={{ background: 'transparent', border: 'none', color: '#E60306', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          {allSelected ? 'Clear all' : 'Select all'}
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {PHOTO_PLATFORMS.map(({ id, label }) => {
          const active = selected.includes(id);
          return (
            <button
              key={id}
              onClick={() => togglePlatform(id)}
              style={{
                background: active ? '#00C48C22' : '#111',
                border: `1px solid ${active ? '#00C48C' : '#333'}`,
                color: active ? '#00C48C' : '#999',
                fontSize: 13,
                fontWeight: 600,
                padding: '7px 14px',
                borderRadius: 20,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {active ? '✓ ' : ''}{label}
            </button>
          );
        })}
      </div>

      {/* SCHEDULE */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#999', marginBottom: scheduleOn ? 10 : 20, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={scheduleOn}
          onChange={(e) => setScheduleOn(e.target.checked)}
          style={{ accentColor: '#E60306', width: 15, height: 15 }}
        />
        Schedule for later
      </label>
      {scheduleOn && (
        <input
          type="datetime-local"
          value={scheduleAt}
          min={new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16)}
          onChange={(e) => setScheduleAt(e.target.value)}
          style={{
            width: '100%',
            background: '#111',
            border: '1px solid #2A2A2A',
            borderRadius: 8,
            color: '#DDD',
            fontSize: 13,
            padding: '9px 11px',
            boxSizing: 'border-box',
            marginBottom: 20,
            fontFamily: 'inherit',
            colorScheme: 'dark',
          }}
        />
      )}

      {/* PROGRESS */}
      {posting && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ height: 6, background: '#1A1A1A', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${uploadPct}%`, height: '100%', background: '#00C48C', transition: 'width 0.2s' }} />
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
            {uploadPct < 100 ? `Uploading photo… ${uploadPct}%` : 'Publishing to platforms…'}
          </div>
        </div>
      )}

      {/* STATUS */}
      {status && (
        <div style={{ fontSize: 13, lineHeight: 1.5, color: status.type === 'ok' ? '#00C48C' : '#FF4444', marginBottom: 14, wordBreak: 'break-word' }}>
          {status.type === 'ok' ? '✓ ' : '✕ '}{status.message}
        </div>
      )}

      {/* ACTIONS */}
      <button
        onClick={handlePost}
        disabled={!canPost}
        style={{
          background: '#00C48C',
          color: '#03150F',
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 18,
          letterSpacing: '0.06em',
          padding: '12px 28px',
          borderRadius: 10,
          border: 'none',
          cursor: canPost ? 'pointer' : 'not-allowed',
          opacity: canPost ? 1 : 0.5,
          transition: 'opacity 0.2s',
        }}
      >
        {posting ? 'WORKING…' : scheduleOn ? 'SCHEDULE POST' : 'POST NOW'}
      </button>
    </div>
  );
}
