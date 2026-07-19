import React, { useState, useMemo } from 'react';
import { SOCIAL_PLATFORMS, publishToSocial } from '../services/socialService';
import { createDefaultSpec } from '../services/overlayRenderer';

// datetime-local inputs are LOCAL time; toISOString() alone is UTC and would
// skew `min` by the user's timezone offset.
function minSchedule() {
  const d = new Date(Date.now() + 5 * 60000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function PublishPanel({ videoFile, content, onPublished, filename, thumbnail, mediaType, overlaySpec, words, preRendered = false }) {
  const isPhoto = mediaType === 'photo';

  // The overlay to burn in: the user's saved edits if any, else a default built
  // from the generated on-screen text + caption word timings. `preRendered`
  // means the caller already baked overlays into the file (e.g. Clips), so we
  // must not burn them in again.
  const editSpec = useMemo(() => {
    if (isPhoto || preRendered) return null;
    return overlaySpec || createDefaultSpec({ onScreenText: content?.on_screen_text || '', words: words || [] });
  }, [isPhoto, preRendered, overlaySpec, content, words]);
  const hasBurnable = Boolean(
    editSpec && (
      (editSpec.texts || []).some((t) => t.text && t.text.trim()) ||
      (editSpec.captions?.enabled && (editSpec.captions.lines || []).length)
    )
  );
  const [burnIn, setBurnIn] = useState(true);
  const [phase, setPhase] = useState(null); // 'rendering' | 'publishing'
  // YouTube is video-only; photos post to Instagram as regular feed posts, not Reels.
  const platforms = SOCIAL_PLATFORMS
    .filter(({ id }) => !(isPhoto && id === 'youtube'))
    .map(({ id, label }) => (isPhoto && id === 'instagram' ? { id, label: 'Instagram' } : { id, label }));
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState([]);
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
    // The input's `min` is advisory only — typed values bypass it.
    if (scheduleOn) {
      const t = new Date(scheduleAt).getTime();
      if (Number.isNaN(t)) {
        setStatus({ type: 'error', message: 'Pick a valid date and time.' });
        return;
      }
      if (t < Date.now() + 2 * 60000) {
        setStatus({ type: 'error', message: 'Schedule time must be at least 2 minutes in the future.' });
        return;
      }
    }

    setPosting(true);
    setStatus(null);
    setProgress(0);
    setPhase(null);
    const willBurn = burnIn && hasBurnable && !isPhoto;
    try {
      const result = await publishToSocial(videoFile, {
        post: caption,
        title,
        platforms: selected,
        scheduleDate,
        onProgress: setProgress,
        onPhase: setPhase,
        spec: willBurn ? editSpec : null,
        burnIn: willBurn,
      });
      // Ayrshare's post id lets us reconcile this record against real
      // outcomes later (scheduled posts can fail hours after being queued).
      const ayrshareId =
        result?.ayrshare?.id ??
        result?.ayrshare?.postId ??
        result?.ayrshare?.posts?.[0]?.id ??
        null;
      const isScheduled = Boolean(scheduleDate);
      const base = isScheduled
        ? `Scheduled for ${new Date(scheduleDate).toLocaleString()} on ${selected.length} platform${selected.length !== 1 ? 's' : ''}.`
        : `Posted to ${selected.length} platform${selected.length !== 1 ? 's' : ''}.`;
      setStatus({
        type: 'ok',
        message: willBurn ? `${base} On-screen text & captions burned in.` : base,
      });
      if (onPublished) {
        onPublished({
          id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          ayrshareId,
          caption,
          title,
          platforms: selected,
          filename,
          thumbnail: thumbnail || null,
          date: scheduleDate || new Date().toISOString(),
          status: isScheduled ? 'scheduled' : 'published',
          errors: [],
        });
      }
    } catch (err) {
      // A video publish can take longer than Firebase Hosting's 60s response
      // cap, so the app sees a 502/timeout even though Zernio went on to post
      // it. Treat those as "pending" (check Posts) instead of a hard failure;
      // real validation errors (4xx) still surface as errors.
      const m = err?.message || 'Publish failed.';
      // A failed burn-in means nothing was posted — always a real error, even
      // though its message can look like a network timeout to the regex below.
      const likelyTimedOut = !err?.renderFailed &&
        (/\b(502|503|504)\b/.test(m) || /reach|timeout|timed out|network|failed to fetch|load failed/i.test(m));
      if (likelyTimedOut) {
        setStatus({
          type: 'pending',
          message: 'Sent to Zernio, but confirmation timed out — large videos can take a minute to finish publishing. It’s likely live; open the Posts tab in a minute to confirm.',
        });
      } else {
        setStatus({ type: 'error', message: m });
      }
    } finally {
      setPosting(false);
      setPhase(null);
    }
  };

  const uploadPct = Math.round(progress * 100);

  const canPost = !posting && selected.length > 0 && caption.trim() && videoFile;

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
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: '#666', textTransform: 'uppercase', marginBottom: 10 }}>
        Publish to platforms
      </div>

      {/* PLATFORM CHIPS */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {platforms.map(({ id, label }) => {
          const active = selected.includes(id);
          return (
            <button
              key={id}
              onClick={() => togglePlatform(id)}
              style={{
                background: active ? '#00C48C22' : '#111',
                border: `1px solid ${active ? '#00C48C' : '#333'}`,
                color: active ? '#00C48C' : '#999',
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 20,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* TITLE (used for YouTube — hidden for photos, which can't post there) */}
      {!isPhoto && (
        <>
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
        </>
      )}

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

      {/* BURN-IN OVERLAYS */}
      {hasBurnable && !isPhoto && (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#CCC', marginBottom: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={burnIn}
            onChange={(e) => setBurnIn(e.target.checked)}
            style={{ accentColor: '#E63329', width: 15, height: 15, marginTop: 1, flexShrink: 0 }}
          />
          <span>
            Burn on-screen text &amp; captions into the video
            <span style={{ display: 'block', color: '#666', fontSize: 11, marginTop: 2 }}>
              Renders the text onto the video before posting (adds a little time).
            </span>
          </span>
        </label>
      )}

      {/* SCHEDULE */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#999', marginBottom: scheduleOn ? 8 : 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={scheduleOn}
          onChange={(e) => setScheduleOn(e.target.checked)}
          style={{ accentColor: '#E63329', width: 15, height: 15 }}
        />
        Schedule for later
      </label>
      {scheduleOn && (
        <input
          type="datetime-local"
          value={scheduleAt}
          min={minSchedule()}
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

      {!videoFile && (
        <div style={{ fontSize: 11, color: '#FFC107', marginBottom: 10, lineHeight: 1.45 }}>
          This card has no attached media file (e.g. loaded from Library), so it can’t be posted. Re-upload the file to post it.
        </div>
      )}

      {posting && (
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
            {phase === 'rendering'
              ? 'Burning in on-screen text & captions… (can take a few minutes — keep this tab open)'
              : phase === 'publishing' || uploadPct >= 100
                ? 'Publishing to platforms…'
                : `Uploading ${isPhoto ? 'photo' : 'video'}… ${uploadPct}%`}
          </div>
        </div>
      )}

      {status && (
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.5,
            color: status.type === 'ok' ? '#00C48C' : status.type === 'pending' ? '#FFC107' : '#FF4444',
            marginBottom: 10,
            wordBreak: 'break-word',
          }}
        >
          {status.type === 'ok' ? '✓ ' : status.type === 'pending' ? '⏳ ' : '✕ '}
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
