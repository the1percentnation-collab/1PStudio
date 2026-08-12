// Burns overlays into the video in-browser: plays a hidden copy of the video
// in real time, composites frames + overlays on a canvas, and records the
// canvas stream with MediaRecorder. Export duration ≈ video duration.

import { drawOverlays, ensureFontsLoaded, filterToCss } from './overlayRenderer';

const MIME_CANDIDATES = [
  { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4', label: 'MP4 · H.264' },
  { mime: 'video/mp4;codecs=avc1', ext: 'mp4', label: 'MP4 · H.264' },
  { mime: 'video/mp4', ext: 'mp4', label: 'MP4' },
  { mime: 'video/webm;codecs=vp9,opus', ext: 'webm', label: 'WebM · VP9' },
  { mime: 'video/webm;codecs=vp8,opus', ext: 'webm', label: 'WebM · VP8' },
  { mime: 'video/webm', ext: 'webm', label: 'WebM' },
];

export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const candidate of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate.mime)) return candidate;
    } catch {
      /* keep looking */
    }
  }
  // some older Safari versions return false for everything but still record —
  // let MediaRecorder pick its own default
  return { mime: '', ext: 'webm', label: 'video' };
}

// Returns { promise, abort }. promise resolves { blob, mimeType, ext }.
export function exportVideo({ videoUrl, spec, onProgress }) {
  let aborted = false;
  let cleanup = () => {};
  let abortReject = () => {};

  const promise = (async () => {
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('Video export is not supported in this browser.');
    }

    await ensureFontsLoaded();

    const picked = pickMimeType();

    const video = document.createElement('video');
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.src = videoUrl;
    // keep it technically on-screen so the browser doesn't throttle decode
    video.style.cssText = 'position:fixed;left:-99999px;top:0;width:2px;height:2px;';
    document.body.appendChild(video);

    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('Could not load video for export.'));
    });

    const videoW = video.videoWidth || 720;
    const videoH = video.videoHeight || 1280;
    const duration = video.duration || 0;

    // Optional clip trim: spec.clip = { start, end } records only that sub-range.
    const clip = spec && spec.clip;
    const clipStart = Math.max(0, Number(clip && clip.start) || 0);
    const clipEnd = clip && Number(clip.end) > clipStart ? Math.min(duration || Infinity, Number(clip.end)) : duration;
    const effDuration = Math.max(0.1, (clipEnd || duration) - clipStart);
    // Whether we must stop recording BEFORE the natural end of the source.
    const endBounded = Number.isFinite(clipEnd) && clipEnd > 0 && clipEnd < duration - 0.05;
    let finished = false;

    // Reframe: everything downstream (canvas size, overlay coords) works on the
    // cropped region, matching the editor preview and the server render.
    const crop = spec && spec.crop;
    const cw = crop ? Math.max(0.01, Number(crop.w) || 1) : 1;
    const ch = crop ? Math.max(0.01, Number(crop.h) || 1) : 1;
    const cx = crop ? Math.max(0, Number(crop.x) || 0) : 0;
    const cy = crop ? Math.max(0, Number(crop.y) || 0) : 0;
    const srcX = Math.round(videoW * cx);
    const srcY = Math.round(videoH * cy);
    const srcW = Math.max(2, Math.round(videoW * cw));
    const srcH = Math.max(2, Math.round(videoH * ch));
    // even dimensions keep H.264 encoders happy
    const outW = srcW % 2 ? srcW - 1 : srcW;
    const outH = srcH % 2 ? srcH - 1 : srcH;

    const speed = Math.min(4, Math.max(0.25, Number(spec && spec.speed) || 1));
    const volume = spec && spec.volume != null ? Math.max(0, Number(spec.volume)) : 1;
    const cssFilter = filterToCss(spec && spec.filter);

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');

    // Audio: reroute the element's output into a recording-only graph. The
    // user hears nothing (never connected to speakers) and the captured
    // track carries full-level audio. Do NOT mute the element — muting can
    // silence the MediaElementSource tap.
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();
    await audioCtx.resume().catch(() => {});
    const sourceNode = audioCtx.createMediaElementSource(video);
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = volume;
    const destNode = audioCtx.createMediaStreamDestination();
    sourceNode.connect(gainNode);
    gainNode.connect(destNode);

    const canvasStream = canvas.captureStream(30);
    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destNode.stream.getAudioTracks(),
    ]);

    // cap bitrate so long clips don't balloon in memory
    const videoBitsPerSecond = Math.min(12_000_000, Math.round(outW * outH * 8));
    const recorder = picked.mime
      ? new MediaRecorder(combined, { mimeType: picked.mime, videoBitsPerSecond })
      : new MediaRecorder(combined, { videoBitsPerSecond });
    const actualMime = recorder.mimeType || picked.mime || 'video/webm';
    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    let rafId = null;
    let intervalId = null;

    const drawFrame = () => {
      // ctx.filter is unsupported on some older WebKit builds; the grade is
      // then simply skipped rather than failing the export.
      if (cssFilter && cssFilter !== 'none') ctx.filter = cssFilter;
      ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
      ctx.filter = 'none';
      drawOverlays(ctx, spec, video.currentTime, outW, outH);
      onProgress?.(Math.min(1, (video.currentTime - clipStart) / effDuration));
    };

    // When trimming to a clip, stop recording once we reach the clip's end
    // (the source video keeps playing past it, but we don't record it).
    const maybeStopAtClipEnd = () => {
      if (endBounded && !finished && video.currentTime >= clipEnd) {
        finished = true;
        onProgress?.(1);
        try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* already stopped */ }
      }
    };

    // rAF for smooth frame-paced drawing, plus a timer backstop so frames
    // keep flowing even when rAF is throttled (off-viewport video, hidden
    // element rendering optimizations, backgrounded tab).
    const loop = () => {
      if (aborted) return;
      drawFrame();
      maybeStopAtClipEnd();
      rafId = requestAnimationFrame(loop);
    };

    cleanup = () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      if (intervalId != null) clearInterval(intervalId);
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* already stopped */ }
      combined.getTracks().forEach((t) => t.stop());
      audioCtx.close().catch(() => {});
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
    };

    const result = await new Promise((resolve, reject) => {
      abortReject = reject;

      recorder.onstop = () => {
        if (aborted) return;
        drawFrame(); // final frame
        resolve(new Blob(chunks, { type: actualMime.split(';')[0] }));
      };
      recorder.onerror = (e) => reject(e.error || new Error('Recording failed.'));

      video.onended = () => {
        onProgress?.(1);
        try { if (recorder.state !== 'inactive') recorder.stop(); } catch { reject(new Error('Recorder stop failed.')); }
      };
      // Once recording, nothing should seek the hidden element; if something
      // does, bail rather than record a glitched file. (The initial seek to
      // clipStart below happens BEFORE recording, so it's allowed.)
      video.onseeking = () => {
        if (!aborted && recorder.state === 'recording') {
          reject(new Error('Export interrupted by seek.'));
        }
      };

      const startPlayback = () => {
        // Recording is real-time off the canvas, so playing faster IS the speed
        // change — the captured stream and its audio come out re-timed.
        video.playbackRate = speed;
        video.play()
          .then(() => {
            recorder.start(1000); // timesliced so memory pressure surfaces progressively
            loop();
            intervalId = setInterval(() => {
              if (!aborted && !video.paused) { drawFrame(); maybeStopAtClipEnd(); }
            }, 33);
          })
          .catch(() => reject(new Error('Could not start video playback for export.')));
      };

      if (clipStart > 0.01) {
        // Seek to the clip's start, then begin recording from there.
        video.onseeked = () => { video.onseeked = null; startPlayback(); };
        video.currentTime = clipStart;
      } else {
        video.currentTime = 0;
        startPlayback();
      }
    }).finally(cleanup);

    return { blob: result, mimeType: actualMime, ext: picked.ext };
  })();

  return {
    promise,
    abort: () => {
      aborted = true;
      cleanup();
      abortReject(new Error('cancelled'));
    },
  };
}
