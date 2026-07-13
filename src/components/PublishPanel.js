import React, { useState, useEffect } from 'react';
import { SOCIAL_PLATFORMS, publishToSocial, publishByUrl } from '../services/socialService';

// Posts a video to social platforms. Pass EITHER a `videoFile` (uploaded to
// Storage first, with a progress bar) OR a `mediaUrl` for a clip that's already
// hosted (e.g. a Higgsfield-generated / imported video) — that path skips upload.
export default function PublishPanel({ videoFile, mediaUrl, content, onPublished, onShared, sharedPlatforms, filename, thumbnail, autoOpen }) {
  // Library mode: sharedPlatforms is an array (even empty) — we mark already-
  // shared platforms and pre-select the ones this video hasn't gone to yet.
  const libraryMode = Array.isArray(sharedPlatforms);
  const unshared = () =>
    libraryMode ? SOCIAL_PLATFORMS.filter((p) => !sharedPlatforms.includes(p.id)).map((p) => p.id) : [];

  const [open, setOpen] = useState(false);

  // open automatically when the editor sends us here via "Continue to Post"
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);
  const [selected, setSelected] = useState(unshared);
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [caption, setCaption] = useState(() => {
    const parts = [];
    if (content?.caption) parts.push(content.caption);
    if (content?.hashtags) parts.push(content.hashtags);
    return parts.join('\n\n');
  });
  const [title, setTitle] = useState(content?.best_title || content?.headline || '');
  const [status, setStatus] = useState(null); // { type: 'ok'|'error', message }
  const [posting, setPosting] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 upload progress

  const togglePlatform = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

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
      if (mediaUrl) {
        // Already-hosted clip — no upload step.
        await publishByUrl(mediaUrl, { post: caption, title, platforms: selected, scheduleDate });
      } else {
        await publishToSocial(videoFile, {
          post: caption,
          title,
          platforms: selected,
          scheduleDate,
          onProgress: setProgress,
        });
      }
      const isScheduled = Boolean(scheduleDate);
      setStatus({
        type: 'ok',
        message: isScheduled
          ? `Scheduled for ${new Date(scheduleDate).toLocaleString()} on ${selected.length} platform${selected.length !== 1 ? 's' : ''}.`
          : `Posted to ${selected.length} platform${selected.length !== 1 ? 's' : ''}.`,
      });
      if (onPublished) {
        onPublished({
          id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          caption,
          title,
          platforms: selected,
          filename,
          thumbnail: thumbnail || null,
          date: scheduleDate || new Date().toISOString(),
          status: isScheduled ? 'scheduled' : 'published',
        });
      }
      if (onShared) onShared(selected);
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setPosting(false);
    }
  };

  const uploadPct = Math.round(progress * 100);

  const canPost = !posting && selected.length > 0 && caption.trim() && (videoFile || mediaUrl);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: '#00C48C',
          color: '#03150F',
          fontSize: 13,
          fontWeight: 700,
          padding: '8px 16px',
          borderRadius: 8,
          cursor: 'pointer',
          border: 'none',
          transition: 'opacity 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
      >
        Post to Social
      </button>
    );
  }

  // SUCCESS STATE — replaces the compose form so it's unmistakable it posted
  if (status?.type === 'ok' && !posting) {
    const scheduled = status.message.startsWith('Scheduled');
    return (
      <div
        style={{
          width: '100%',
          marginTop: 8,
          background: '#03150F',
          border: '1px solid #00C48C',
          borderRadius: 10,
          padding: 18,
          boxSizing: 'border-box',
          textAlign: 'center',
        }}
      >
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#00C48C22', border: '1px solid #00C48C', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', color: '#00C48C', fontSize: 22 }}>
          ✓
        </div>
        <div style={{ color: '#00C48C', fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          {scheduled ? 'Scheduled!' : 'Posted!'}
        </div>
        <div style={{ color: '#9FE7CF', fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
          {status.message}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            onClick={() => { setStatus(null); setOpen(false); }}
            style={{ background: '#00C48C', color: '#03150F', fontSize: 13, fontWeight: 700, padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer' }}
          >
            Done
          </button>
          <button
            onClick={() => { setStatus(null); setSelected(unshared()); }}
            style={{ background: 'transparent', border: '1px solid #2A6B57', color: '#9FE7CF', fontSize: 13, padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}
          >
            Post another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        marginTop: 8,
        background: '#0A0A0A',
        border: '1px solid #2A2A2A',
        borderRadius: 10,
        padding: 14,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: '#666', textTransform: 'uppercase' }}>
          {libraryMode ? 'Share to platforms' : 'Publish to platforms'}
        </span>
        {libraryMode && sharedPlatforms.length > 0 && (
          <button
            onClick={() => setSelected([...sharedPlatforms])}
            style={{ background: 'transparent', border: '1px solid #333', color: '#888', fontSize: 11, padding: '3px 10px', borderRadius: 6, cursor: 'pointer' }}
          >
            ↻ Reshare posted
          </button>
        )}
      </div>

      {/* PLATFORM CHIPS */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {SOCIAL_PLATFORMS.map(({ id, label }) => {
          const active = selected.includes(id);
          const shared = libraryMode && sharedPlatforms.includes(id);
          return (
            <button
              key={id}
              onClick={() => togglePlatform(id)}
              title={shared ? 'Already shared — select to reshare' : ''}
              style={{
                background: active ? '#00C48C22' : '#111',
                border: `1px solid ${active ? '#00C48C' : shared ? '#2A6B57' : '#333'}`,
                color: active ? '#00C48C' : shared ? '#6FBFA3' : '#999',
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 20,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {shared ? '✓ ' : ''}{label}
            </button>
          );
        })}
      </div>
      {libraryMode && (
        <div style={{ fontSize: 11, color: '#666', marginBottom: 12, lineHeight: 1.45 }}>
          {sharedPlatforms.length > 0
            ? `Already shared to ${sharedPlatforms.length} platform${sharedPlatforms.length !== 1 ? 's' : ''} (✓). New platforms are pre-selected.`
            : 'Not shared anywhere yet — all platforms are pre-selected.'}
        </div>
      )}

      {/* TITLE (used for YouTube) */}
      <label style={{ display: 'block', fontSize: 10, color: '#666', letterSpacing: '0.1em', marginBottom: 4, textTransform: 'uppercase' }}>
        Title (YouTube)
      </label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={100}
        style={{
          width: '100%',
          background: '#111',
          border: '1px solid #2A2A2A',
          borderRadius: 8,
          color: '#DDD',
          fontSize: 12,
          padding: '8px 10px',
          boxSizing: 'border-box',
          marginBottom: 10,
          fontFamily: 'inherit',
        }}
      />

      {/* CAPTION */}
      <label style={{ display: 'block', fontSize: 10, color: '#666', letterSpacing: '0.1em', marginBottom: 4, textTransform: 'uppercase' }}>
        Caption
      </label>
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={4}
        style={{
          width: '100%',
          background: '#111',
          border: '1px solid #2A2A2A',
          borderRadius: 8,
          color: '#CCC',
          fontSize: 12,
          lineHeight: 1.5,
          padding: '10px 12px',
          resize: 'vertical',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          marginBottom: 10,
        }}
      />

      {/* SCHEDULE */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#999', marginBottom: scheduleOn ? 8 : 10, cursor: 'pointer' }}>
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
            fontSize: 12,
            padding: '8px 10px',
            boxSizing: 'border-box',
            marginBottom: 10,
            fontFamily: 'inherit',
            colorScheme: 'dark',
          }}
        />
      )}

      {!videoFile && !mediaUrl && (
        <div style={{ fontSize: 11, color: '#FFC107', marginBottom: 10, lineHeight: 1.45 }}>
          This card has no attached video file (e.g. loaded from Library), so it can’t be posted. Re-upload the video to post it.
        </div>
      )}

      {posting && !mediaUrl && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ height: 6, background: '#1A1A1A', borderRadius: 3, overflow: 'hidden' }}>
            <div
              style={{
                width: `${uploadPct}%`,
                height: '100%',
                background: '#00C48C',
                transition: 'width 0.2s',
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
            {uploadPct < 100 ? `Uploading video… ${uploadPct}%` : 'Publishing to platforms…'}
          </div>
        </div>
      )}

      {status && (
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.5,
            color: status.type === 'ok' ? '#00C48C' : '#FF4444',
            marginBottom: 10,
            wordBreak: 'break-word',
          }}
        >
          {status.type === 'ok' ? '✓ ' : '✕ '}
          {status.message}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handlePost}
          disabled={!canPost}
          style={{
            background: '#00C48C',
            color: '#03150F',
            fontSize: 13,
            fontWeight: 700,
            padding: '8px 18px',
            borderRadius: 8,
            border: 'none',
            cursor: canPost ? 'pointer' : 'not-allowed',
            opacity: canPost ? 1 : 0.5,
            transition: 'opacity 0.2s',
          }}
        >
          {posting ? 'Working…' : scheduleOn ? 'Schedule Post' : 'Post Now'}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: 'transparent',
            border: '1px solid #333',
            color: '#666',
            fontSize: 13,
            padding: '8px 12px',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
