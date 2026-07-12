// Burns overlays into the video in-browser: plays a hidden copy of the video
// in real time, composites frames + overlays on a canvas, and records the
// canvas stream with MediaRecorder. Export duration ≈ video duration.

import { drawOverlays, ensureFontsLoaded } from './overlayRenderer';

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

    const canvas = document.createElement('canvas');
    canvas.width = videoW;
    canvas.height = videoH;
    const ctx = canvas.getContext('2d');

    // Audio: reroute the element's output into a recording-only graph. The
    // user hears nothing (never connected to speakers) and the captured
    // track carries full-level audio. Do NOT mute the element — muting can
    // silence the MediaElementSource tap.
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();
    await audioCtx.resume().catch(() => {});
    const sourceNode = audioCtx.createMediaElementSource(video);
    const destNode = audioCtx.createMediaStreamDestination();
    sourceNode.connect(destNode);

    const canvasStream = canvas.captureStream(30);
    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destNode.stream.getAudioTracks(),
    ]);

    // cap bitrate so long clips don't balloon in memory
    const videoBitsPerSecond = Math.min(12_000_000, Math.round(videoW * videoH * 8));
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
      ctx.drawImage(video, 0, 0, videoW, videoH);
      drawOverlays(ctx, spec, video.currentTime, videoW, videoH);
      if (Number.isFinite(duration) && duration > 0) onProgress?.(Math.min(1, video.currentTime / duration));
    };

    // rAF for smooth frame-paced drawing, plus a timer backstop so frames
    // keep flowing even when rAF is throttled (off-viewport video, hidden
    // element rendering optimizations, backgrounded tab).
    const loop = () => {
      if (aborted) return;
      drawFrame();
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
      // nothing should seek the hidden element; if something does, bail out
      // rather than record a glitched file
      video.onseeking = () => {
        if (!aborted && video.currentTime > 0.01 && recorder.state === 'recording') {
          reject(new Error('Export interrupted by seek.'));
        }
      };

      video.currentTime = 0;
      video.play()
        .then(() => {
          recorder.start(1000); // timesliced so memory pressure surfaces progressively
          loop();
          intervalId = setInterval(() => { if (!aborted && !video.paused) drawFrame(); }, 33);
        })
        .catch(() => reject(new Error('Could not start video playback for export.')));
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
