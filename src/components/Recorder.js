import React, { useCallback, useEffect, useRef, useState } from 'react';
import Teleprompter from './Teleprompter';
import { Button, Card, Display, Eyebrow, Red, SectionTitle } from './ui';
import { colors as c, fonts as f, radius as r } from '../theme';

const SCRIPT_KEY = '1p-studio-teleprompter';
const MAX_SECONDS = 600; // 10 min safety cap — the take is held in memory

const ASPECTS = {
  '9:16': { label: '9:16', css: '9 / 16', w: 1080, h: 1920 },
  '1:1': { label: '1:1', css: '1 / 1', w: 1080, h: 1080 },
  '16:9': { label: '16:9', css: '16 / 9', w: 1920, h: 1080 },
};

// MP4/H.264 first. It is the only container every target handles: iOS Safari
// cannot decode WebM (a WebM take plays as a black rectangle on iPhone), and
// TikTok/Reels/Shorts all expect MP4. WebM is the fallback for browsers that
// can't record MP4.
const MIME_CANDIDATES = [
  'video/mp4;codecs=h264,aac',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  if (!MediaRecorder.isTypeSupported) return '';

  const recordable = MIME_CANDIDATES.filter((t) => MediaRecorder.isTypeSupported(t));
  // Prefer a container this browser can also play back — Safari accepts a WebM
  // recording request and then refuses to decode the result.
  const probe = document.createElement('video');
  return recordable.find((t) => probe.canPlayType(t) !== '') ?? recordable[0] ?? '';
}

function extensionFor(type) {
  if (type.includes('mp4')) return 'mp4';
  if (type.includes('quicktime')) return 'mov';
  return 'webm';
}

function fmtTime(totalSeconds) {
  const s = Math.floor(totalSeconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function describeMediaError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera/mic access was blocked. Allow it in your browser’s site settings and try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera or microphone matched — check that a device is connected and try another one.';
    case 'NotReadableError':
      return 'Your camera or mic is already in use by another app. Close it and try again.';
    default:
      return err?.message || 'Could not start the camera.';
  }
}

function loadScript() {
  try {
    return localStorage.getItem(SCRIPT_KEY) || '';
  } catch {
    return '';
  }
}

const labelStyle = {
  fontFamily: f.mono,
  fontSize: 11,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: c.textDim,
  marginBottom: 8,
  display: 'block',
};

const selectStyle = {
  width: '100%',
  background: c.inset,
  border: `1px solid ${c.border}`,
  borderRadius: r.md,
  color: c.text,
  fontSize: 13.5,
  padding: '11px 13px',
  fontFamily: f.body,
  outline: 'none',
  cursor: 'pointer',
};

// Fullscreen transport sits on a phone-width row — keep it to one line.
const compactBtn = { fontSize: 13, padding: '10px 14px' };

function Chip({ active, onClick, children, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: active ? c.redGlow : c.inset,
        border: `1px solid ${active ? c.redDim : c.border}`,
        color: active ? c.red : c.textDim,
        fontFamily: f.mono,
        fontSize: 11.5,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        padding: '8px 13px',
        borderRadius: r.sm,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background 0.18s, border-color 0.18s, color 0.18s',
      }}
    >
      {children}
    </button>
  );
}

function Slider({ label, value, min, max, step = 1, onChange, suffix = '' }) {
  return (
    <div style={{ flex: 1, minWidth: 140 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={labelStyle}>{label}</span>
        <span style={{ fontSize: 12, color: c.textFaint }}>{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: c.red, cursor: 'pointer' }}
      />
    </div>
  );
}

export default function Recorder({ onUseRecording, busy }) {
  const [status, setStatus] = useState('idle'); // idle | countdown | recording | paused | review
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const [devices, setDevices] = useState({ cameras: [], mics: [] });
  const [cameraId, setCameraId] = useState('');
  const [micId, setMicId] = useState('');
  const [aspect, setAspect] = useState('9:16');
  const [mirrorPreview, setMirrorPreview] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [recording, setRecording] = useState(null); // { file, url, size }
  const [focus, setFocus] = useState(false);

  // teleprompter
  const [script, setScript] = useState(loadScript);
  const [showPrompter, setShowPrompter] = useState(true);
  const [promptPlaying, setPromptPlaying] = useState(false);
  const [fontSize, setFontSize] = useState(34);
  const [speed, setSpeed] = useState(4);
  const [dim, setDim] = useState(50);
  const [mirrorText, setMirrorText] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const sessionRef = useRef(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const mimeRef = useRef('');
  const stampRef = useRef('');
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);
  const accumulatedRef = useRef(0);
  const countdownRef = useRef(null);
  const meterRef = useRef(null);
  const meterRafRef = useRef(null);
  const audioCtxRef = useRef(null);
  const recordingRef = useRef(null);

  recordingRef.current = recording;

  useEffect(() => {
    try {
      localStorage.setItem(SCRIPT_KEY, script);
    } catch {
      /* storage full or unavailable — not worth failing over */
    }
  }, [script]);

  // Focus mode covers the viewport — stop the page behind it from scrolling.
  useEffect(() => {
    if (!focus) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [focus]);

  const stopMeter = useCallback(() => {
    cancelAnimationFrame(meterRafRef.current);
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (meterRef.current) meterRef.current.style.transform = 'scaleX(0)';
  }, []);

  const startMeter = useCallback(
    (stream) => {
      stopMeter();
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx || stream.getAudioTracks().length === 0) return;

      try {
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        ctx.resume().catch(() => {});

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i += 1) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const level = Math.min(Math.sqrt(sum / data.length) * 3.5, 1);
          // written straight to the DOM — a 60fps setState would re-render the
          // whole recorder (and the teleprompter) for a 4px bar
          if (meterRef.current) meterRef.current.style.transform = `scaleX(${level.toFixed(3)})`;
          meterRafRef.current = requestAnimationFrame(tick);
        };
        meterRafRef.current = requestAnimationFrame(tick);
      } catch {
        /* the meter is a nicety — never block recording on it */
      }
    },
    [stopMeter]
  );

  const stopStream = useCallback(() => {
    stopMeter();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [stopMeter]);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        window.isSecureContext === false
          ? 'Recording needs a secure connection (https:// or localhost).'
          : 'This browser does not support camera capture.'
      );
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setError('This browser does not support MediaRecorder. Try Chrome, Edge, or Firefox.');
      return;
    }

    const token = (sessionRef.current += 1);
    stopStream();

    const { w, h } = ASPECTS[aspect];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'user' }),
          width: { ideal: w },
          height: { ideal: h },
          aspectRatio: { ideal: w / h },
        },
        audio: {
          ...(micId ? { deviceId: { exact: micId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // a newer start (or unmount) won the race — throw this stream away
      if (token !== sessionRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      startMeter(stream);
      setReady(true);
      setError(null);

      // labels are only populated once permission has been granted
      const list = await navigator.mediaDevices.enumerateDevices();
      if (token !== sessionRef.current) return;
      setDevices({
        cameras: list.filter((d) => d.kind === 'videoinput'),
        mics: list.filter((d) => d.kind === 'audioinput'),
      });
    } catch (err) {
      if (token !== sessionRef.current) return;
      setReady(false);
      setError(describeMediaError(err));
    }
  }, [aspect, cameraId, micId, startMeter, stopStream]);

  useEffect(() => {
    startCamera();
  }, [startCamera]);

  // teardown on unmount (App unmounts this when you navigate away)
  useEffect(
    () => () => {
      sessionRef.current += 1;
      clearInterval(timerRef.current);
      clearInterval(countdownRef.current);
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {
          /* already torn down */
        }
      }
      stopStream();
      if (recordingRef.current?.url) URL.revokeObjectURL(recordingRef.current.url);
    },
    [stopStream]
  );

  const stopTimer = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    stopTimer();
    setPromptPlaying(false);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, [stopTimer]);

  const startTimer = useCallback(() => {
    startedAtRef.current = Date.now();
    stopTimer();
    timerRef.current = setInterval(() => {
      const secs = accumulatedRef.current + (Date.now() - startedAtRef.current) / 1000;
      setElapsed(secs);
      if (secs >= MAX_SECONDS) stopRecording();
    }, 250);
  }, [stopRecording, stopTimer]);

  const beginRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const mime = pickMimeType();
    if (mime === null) {
      setError('This browser does not support MediaRecorder.');
      setStatus('idle');
      return;
    }

    chunksRef.current = [];
    mimeRef.current = mime;
    stampRef.current = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    let recorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        videoBitsPerSecond: 6000000,
      });
    } catch (err) {
      setError(`Could not start recording: ${err.message}`);
      setStatus('idle');
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onerror = () => {
      setError('Recording stopped unexpectedly.');
      stopTimer();
      setStatus('idle');
    };

    recorder.onstop = () => {
      // Trust what actually came out over what we asked for: Safari can hand
      // back chunks in a different container than the one requested, and a
      // mislabelled blob is one the browser then refuses to decode.
      const type = chunksRef.current[0]?.type || recorder.mimeType || mimeRef.current || 'video/webm';
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];

      if (blob.size === 0) {
        setError('Nothing was captured — try recording again.');
        setStatus('idle');
        return;
      }

      const ext = extensionFor(type);
      const file = new File([blob], `1p-recording-${stampRef.current}.${ext}`, { type: blob.type });
      setRecording({ file, url: URL.createObjectURL(blob), size: blob.size });
      setStatus('review');
      setFocus(false); // reviewing is easier in the normal layout
      stopStream(); // no reason to hold the camera open while reviewing
    };

    recorderRef.current = recorder;
    recorder.start(1000);

    accumulatedRef.current = 0;
    setElapsed(0);
    setStatus('recording');
    startTimer();
    if (showPrompter && script.trim()) setPromptPlaying(true);
  }, [script, showPrompter, startTimer, stopStream, stopTimer]);

  const handleStart = useCallback(() => {
    if (!ready) return;
    setError(null);
    setResetSignal((n) => n + 1);
    setCountdown(3);
    setStatus('countdown');
    // On a phone the stage doesn't fit alongside the controls, so go fullscreen
    // for the take — otherwise you can't watch yourself and read at once.
    if (typeof window !== 'undefined' && window.innerWidth < 768) setFocus(true);

    clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          clearInterval(countdownRef.current);
          beginRecording();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
  }, [beginRecording, ready]);

  const handlePause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    if (status === 'recording' && recorder.state === 'recording') {
      recorder.pause();
      accumulatedRef.current += (Date.now() - startedAtRef.current) / 1000;
      stopTimer();
      setPromptPlaying(false);
      setStatus('paused');
    } else if (status === 'paused' && recorder.state === 'paused') {
      recorder.resume();
      startTimer();
      if (showPrompter && script.trim()) setPromptPlaying(true);
      setStatus('recording');
    }
  }, [script, showPrompter, startTimer, status, stopTimer]);

  const handleRetake = useCallback(() => {
    if (recording?.url) URL.revokeObjectURL(recording.url);
    setRecording(null);
    setElapsed(0);
    accumulatedRef.current = 0;
    setResetSignal((n) => n + 1);
    setStatus('idle');
    if (!streamRef.current) startCamera();
  }, [recording, startCamera]);

  const handleUse = useCallback(() => {
    if (!recording) return;
    onUseRecording(recording.file, script);
  }, [onUseRecording, recording, script]);

  const isRecording = status === 'recording' || status === 'paused';
  const locked = isRecording || status === 'countdown' || status === 'review';
  const canPause = typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.prototype.pause === 'function';
  const stageWidth = aspect === '9:16' ? 430 : '100%';

  // Focus mode blows the stage up to the whole viewport. On a phone the 9:16
  // stage is taller than the screen, so in the normal layout you cannot see
  // your face and the script at the same time — which is the entire point.
  const stageStyle = focus
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        width: '100%',
        maxWidth: 'none',
        margin: 0,
        aspectRatio: 'auto',
        background: '#000',
        borderRadius: 0,
        border: 'none',
        overflow: 'hidden',
      }
    : {
        position: 'relative',
        width: '100%',
        maxWidth: stageWidth,
        margin: '0 auto',
        aspectRatio: ASPECTS[aspect].css,
        background: '#000',
        borderRadius: r.lg,
        overflow: 'hidden',
        border: `1px solid ${isRecording ? c.red : c.border}`,
        transition: 'border-color 0.2s',
      };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Eyebrow style={{ marginBottom: 12 }}>Camera & Teleprompter</Eyebrow>
        <Display size={34}>
          Record your <Red>next post.</Red>
        </Display>
      </div>

      {/* STAGE — the same element in both modes, so switching never tears down
          the camera stream (a remount would drop srcObject). */}
      <div style={stageStyle}>
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: status === 'review' ? 'none' : 'block',
            transform: mirrorPreview ? 'scaleX(-1)' : 'none',
            background: '#000',
          }}
        />

        {status === 'review' && recording && (
          <video
            key={recording.url}
            src={recording.url}
            controls
            playsInline
            // MediaRecorder files report an infinite duration until they have been
            // seeked past the end — do that once so the scrubber shows real length.
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (Number.isFinite(v.duration)) return;
              const onUpdate = () => {
                v.removeEventListener('timeupdate', onUpdate);
                v.currentTime = 0;
              };
              v.addEventListener('timeupdate', onUpdate);
              v.currentTime = 1e101;
            }}
            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: 'block' }}
          />
        )}

        {status !== 'review' && showPrompter && (
          <Teleprompter
            script={script}
            fontSize={fontSize}
            speed={speed}
            playing={promptPlaying}
            mirrored={mirrorText}
            dim={dim / 100}
            resetSignal={resetSignal}
            onFinish={() => setPromptPlaying(false)}
          />
        )}

        {/* REC badge + timer */}
        {isRecording && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(0,0,0,0.66)',
              padding: '6px 11px',
              borderRadius: r.pill,
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: status === 'paused' ? c.warn : c.red,
                animation: status === 'paused' ? 'none' : 'pulse 1.2s ease-in-out infinite',
              }}
            />
            <span style={{ fontFamily: f.mono, fontSize: 12, letterSpacing: '0.12em', color: '#FFF' }}>
              {status === 'paused' ? 'PAUSED' : 'REC'} {fmtTime(elapsed)}
            </span>
          </div>
        )}

        {/* countdown */}
        {status === 'countdown' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.55)',
            }}
          >
            <span style={{ fontFamily: f.display, fontSize: 120, color: '#FFF', lineHeight: 1 }}>{countdown}</span>
          </div>
        )}

        {/* camera permission / error state */}
        {!ready && status !== 'review' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              padding: 24,
              textAlign: 'center',
              background: 'rgba(10,10,10,0.92)',
            }}
          >
            <span style={{ fontSize: 40 }}>{error ? '🚫' : '📷'}</span>
            <div style={{ fontSize: 13.5, color: error ? c.danger : c.textDim, lineHeight: 1.55, maxWidth: 330 }}>
              {error || 'Waiting for camera permission…'}
            </div>
            {error && (
              <Button variant="ghost" onClick={startCamera} style={{ padding: '9px 16px', fontSize: 13 }}>
                Try again
              </Button>
            )}
          </div>
        )}

        {/* FULLSCREEN CONTROLS — floated over the camera so the script stays
            readable while recording. Only rendered in focus mode. */}
        {focus && status !== 'review' && (
          <>
            <button
              onClick={() => setFocus(false)}
              aria-label="Exit fullscreen"
              style={{
                position: 'absolute',
                top: 'calc(12px + env(safe-area-inset-top, 0px))',
                right: 12,
                background: 'rgba(0,0,0,0.6)',
                border: `1px solid ${c.border}`,
                borderRadius: r.pill,
                color: '#FFF',
                fontFamily: f.mono,
                fontSize: 11,
                letterSpacing: '0.14em',
                padding: '8px 14px',
              }}
            >
              EXIT
            </button>

            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                // scrim so the scrolling script never collides with the controls
                background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.82) 42%)',
                padding: '56px 12px calc(18px + env(safe-area-inset-bottom, 0px))',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.55)', padding: '7px 12px', borderRadius: r.pill }}>
                <span style={{ fontFamily: f.mono, fontSize: 10.5, letterSpacing: '0.16em', color: c.textDim }}>SPEED</span>
                <button
                  onClick={() => setSpeed((s) => Math.max(1, s - 1))}
                  style={{ background: 'transparent', color: '#FFF', fontSize: 18, lineHeight: 1, padding: '0 8px' }}
                  aria-label="Slower"
                >
                  −
                </button>
                <span style={{ fontFamily: f.mono, fontSize: 13, color: '#FFF', minWidth: 16, textAlign: 'center' }}>{speed}</span>
                <button
                  onClick={() => setSpeed((s) => Math.min(10, s + 1))}
                  style={{ background: 'transparent', color: '#FFF', fontSize: 18, lineHeight: 1, padding: '0 8px' }}
                  aria-label="Faster"
                >
                  +
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Button
                  variant={isRecording ? 'outline' : 'primary'}
                  onClick={isRecording ? stopRecording : handleStart}
                  disabled={!ready || status === 'countdown'}
                  style={{ ...compactBtn, background: isRecording ? 'rgba(0,0,0,0.6)' : undefined }}
                >
                  {isRecording ? '■ Stop' : '● Record'}
                </Button>
                {isRecording && canPause && (
                  <Button variant="ghost" onClick={handlePause} style={{ ...compactBtn, background: 'rgba(0,0,0,0.6)' }}>
                    {status === 'paused' ? 'Resume' : 'Pause'}
                  </Button>
                )}
                {showPrompter && (
                  <>
                    <Button
                      variant="ghost"
                      onClick={() => setPromptPlaying((p) => !p)}
                      disabled={!script.trim()}
                      style={{ ...compactBtn, background: 'rgba(0,0,0,0.6)' }}
                    >
                      {promptPlaying ? 'Pause Text' : 'Scroll Text'}
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label="Restart script"
                      onClick={() => {
                        setPromptPlaying(false);
                        setResetSignal((n) => n + 1);
                      }}
                      style={{ ...compactBtn, background: 'rgba(0,0,0,0.6)' }}
                    >
                      ↺
                    </Button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Everything below the stage is covered by focus mode — unmount it so
          there is only ever one set of transport controls in the DOM. */}
      {focus ? null : (
      <>
      {/* MIC METER */}
      <div
        style={{
          maxWidth: stageWidth,
          margin: '12px auto 0',
          display: status === 'review' ? 'none' : 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ fontFamily: f.mono, fontSize: 10.5, letterSpacing: '0.18em', color: c.textFaint }}>MIC</span>
        <div style={{ flex: 1, height: 4, background: c.surfaceHi, borderRadius: 2, overflow: 'hidden' }}>
          <div
            ref={meterRef}
            style={{
              height: '100%',
              background: `linear-gradient(90deg, ${c.success}, ${c.warn}, ${c.red})`,
              transform: 'scaleX(0)',
              transformOrigin: 'left',
            }}
          />
        </div>
      </div>

      {/* TRANSPORT */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
        {status === 'review' ? (
          <>
            <Button onClick={handleUse} disabled={busy}>
              {busy ? 'Generating…' : 'Generate Content'}
            </Button>
            <a
              href={recording?.url}
              download={recording?.file?.name}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: c.inset,
                border: `1px solid ${c.border}`,
                borderRadius: r.md,
                color: '#FFF',
                fontFamily: f.body,
                fontSize: 14,
                fontWeight: 600,
                padding: '12px 20px',
              }}
            >
              Download
            </a>
            <Button variant="ghost" onClick={handleRetake}>Retake</Button>
          </>
        ) : (
          <>
            <Button
              variant={isRecording ? 'outline' : 'primary'}
              onClick={isRecording ? stopRecording : handleStart}
              disabled={!ready || status === 'countdown'}
            >
              {isRecording ? '■ Stop' : '● Record'}
            </Button>

            {isRecording && canPause && (
              <Button variant="ghost" onClick={handlePause}>
                {status === 'paused' ? 'Resume' : 'Pause'}
              </Button>
            )}

            {showPrompter && (
              <>
                <Button variant="ghost" onClick={() => setPromptPlaying((p) => !p)} disabled={!script.trim()}>
                  {promptPlaying ? 'Pause Script' : 'Scroll Script'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPromptPlaying(false);
                    setResetSignal((n) => n + 1);
                  }}
                >
                  Restart
                </Button>
              </>
            )}

            <Button variant="ghost" onClick={() => setFocus(true)} disabled={!ready}>
              ⛶ Fullscreen
            </Button>
          </>
        )}
      </div>

      <div style={{ textAlign: 'center', fontSize: 12, color: c.textFaint, marginTop: 12 }}>
        {status === 'review' && recording
          ? `${recording.file.name} — ${fmtTime(elapsed)} · ${(recording.size / 1024 / 1024).toFixed(1)} MB${
              script.trim() ? ' · script sent as the transcript' : ''
            }`
          : `Recording stops automatically at ${fmtTime(MAX_SECONDS)}`}
      </div>

      {/* TELEPROMPTER */}
      <Card style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <SectionTitle size={20}>Teleprompter</SectionTitle>
          <div style={{ display: 'flex', gap: 8 }}>
            <Chip active={showPrompter} onClick={() => setShowPrompter((v) => !v)}>
              {showPrompter ? 'On' : 'Off'}
            </Chip>
            <Chip active={mirrorText} onClick={() => setMirrorText((v) => !v)}>
              Mirror text
            </Chip>
          </div>
        </div>

        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={6}
          placeholder="Paste or write your script here. It scrolls over the camera while you record, and is sent to Claude as the transcript."
          style={{
            width: '100%',
            background: c.inset,
            border: `1px solid ${c.border}`,
            borderRadius: r.md,
            color: c.white,
            fontSize: 13.5,
            lineHeight: 1.55,
            padding: 13,
            fontFamily: f.body,
            resize: 'vertical',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: c.textFaint, marginTop: 8 }}>
          <span>{script.trim() ? `${script.trim().split(/\s+/).length} words` : 'No script yet'}</span>
          {script && (
            <button onClick={() => setScript('')} style={{ background: 'transparent', color: c.textFaint, fontSize: 12 }}>
              Clear
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 16 }}>
          <Slider label="Speed" value={speed} min={1} max={10} onChange={setSpeed} />
          <Slider label="Text size" value={fontSize} min={18} max={64} onChange={setFontSize} suffix="px" />
          <Slider label="Dim" value={dim} min={0} max={85} onChange={setDim} suffix="%" />
        </div>
      </Card>

      {/* CAMERA & AUDIO */}
      <Card style={{ marginTop: 18 }}>
        <SectionTitle size={20} style={{ marginBottom: 14 }}>Camera &amp; Audio</SectionTitle>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 210 }}>
            <span style={labelStyle}>Camera</span>
            <select
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value)}
              disabled={locked}
              style={{ ...selectStyle, opacity: locked ? 0.5 : 1 }}
            >
              <option value="">Default camera</option>
              {devices.cameras.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 210 }}>
            <span style={labelStyle}>Microphone</span>
            <select
              value={micId}
              onChange={(e) => setMicId(e.target.value)}
              disabled={locked}
              style={{ ...selectStyle, opacity: locked ? 0.5 : 1 }}
            >
              <option value="">Default microphone</option>
              {devices.mics.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Microphone ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
          <span style={{ ...labelStyle, marginBottom: 0 }}>Frame</span>
          {Object.keys(ASPECTS).map((key) => (
            <Chip key={key} active={aspect === key} onClick={() => setAspect(key)} disabled={locked}>
              {ASPECTS[key].label}
            </Chip>
          ))}
          <Chip active={mirrorPreview} onClick={() => setMirrorPreview((v) => !v)}>
            Mirror preview
          </Chip>
        </div>

        <div style={{ fontSize: 12, color: c.textFaint, marginTop: 14, lineHeight: 1.55 }}>
          Mirroring only affects what you see — the recorded file is never flipped. Frame is a request to the
          camera; some webcams record their native aspect ratio regardless.
        </div>
      </Card>
      </>
      )}
    </div>
  );
}
