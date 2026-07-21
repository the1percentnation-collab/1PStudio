import React, { useState, useCallback, useEffect, useRef } from 'react';
import { watchPublishJob, TERMINAL_JOB_STATES } from './services/publishJobs';
import { notify } from './services/notify';
import { watchAuth } from './services/firebase';
import SignInGate from './components/SignInGate';
import SettingsView from './components/SettingsView';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import CalendarView from './components/CalendarView';
import PostsView from './components/PostsView';
import Analytics from './components/Analytics';
import AccountsView from './components/AccountsView';
import CaptionsView from './components/CaptionsView';
import ClipsView from './components/ClipsView';
import DropZone from './components/DropZone';
import VideoCard from './components/VideoCard';
import QueueProgress from './components/QueueProgress';
import LibraryView from './components/LibraryView';
import { generateTikTokContent } from './services/claudeService';
import { syncPostHistory } from './services/postSync';
import VideoEditorModal from './components/editor/VideoEditorModal';
import TextPostCreator from './components/TextPostCreator';
import { putVideo, getVideo, deleteVideo } from './services/videoStore';
import { GlowBackground, Eyebrow } from './components/ui';
import { colors as c, fonts as f } from './theme';

const LIBRARY_KEY = '1p-studio-library';
const POSTS_KEY = '1p-studio-posts';

let idCounter = 0;
const uid = () => `v-${++idCounter}-${Date.now()}`;

// Opens a native video file picker and resolves with the chosen File (or null
// if cancelled). Used to re-attach a source video to a Library item that was
// saved before videos were persisted on-device.
function pickVideoFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.style.display = 'none';
    input.onchange = () => {
      const file = input.files && input.files[0];
      input.remove();
      resolve(file || null);
    };
    document.body.appendChild(input);
    input.click();
  });
}

function loadJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveJSON(key, items) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // storage quota exceeded — fail silently
  }
}

const VIEW_META = {
  dashboard: { title: 'Dashboard', subtitle: 'Your content at a glance' },
  composer: { title: 'Composer', subtitle: 'Generate and publish content' },
  clips: { title: 'Clips', subtitle: 'Turn one long video into viral clips' },
  captions: { title: 'Captions', subtitle: 'Auto burned-in subtitles' },
  calendar: { title: 'Content Calendar', subtitle: 'Scheduled & published posts' },
  posts: { title: 'Posts', subtitle: 'Everything scheduled & published' },
  analytics: { title: 'Analytics', subtitle: 'Performance & content insights' },
  library: { title: 'Library', subtitle: 'Saved generated content' },
  accounts: { title: 'Accounts', subtitle: 'Connect your social platforms' },
  settings: { title: 'Settings', subtitle: 'Your API keys' },
};

export default function App() {
  const [queue, setQueue] = useState([]);
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [view, setView] = useState('dashboard');
  const [library, setLibrary] = useState(() => loadJSON(LIBRARY_KEY));
  const [posts, setPosts] = useState(() => loadJSON(POSTS_KEY));
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));

  // Auth gate. `authUser === undefined` = still resolving (show a splash);
  // null = signed out (show SignInGate); object = signed in (show the app).
  const [authUser, setAuthUser] = useState(undefined);
  useEffect(() => watchAuth(setAuthUser), []);

  useEffect(() => { saveJSON(LIBRARY_KEY, library); }, [library]);

  // Ref mirrors posts so syncPosts stays a stable callback (Refresh can fire
  // long after mount without capturing a stale posts array).
  const postsRef = useRef(posts);
  useEffect(() => {
    postsRef.current = posts;
    saveJSON(POSTS_KEY, posts);
  }, [posts]);

  const [syncState, setSyncState] = useState({ loading: false, configured: null, error: null });
  const syncPosts = useCallback(async () => {
    setSyncState((s) => ({ ...s, loading: true }));
    const { posts: merged, configured, error } = await syncPostHistory(postsRef.current);
    setPosts(merged);
    setSyncState({ loading: false, configured, error: error || null });
  }, []);

  // Reconcile once on load so stale "scheduled" statuses correct themselves.
  useEffect(() => { syncPosts(); }, [syncPosts]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const addToLibrary = useCallback((entry) => {
    // Keep the source video (+ word timings) on-device so the item stays
    // editable later. Photos and failed items have nothing to edit.
    const canEdit = entry.mediaType !== 'photo' && !!entry._file && !entry.error;
    const libraryEntry = {
      id: entry.id,
      filename: entry.filename,
      mediaType: entry.mediaType ?? 'video',
      frames: { hookFrame: entry.frames?.hookFrame ?? null },
      content: entry.content,
      transcript: entry.transcript ? entry.transcript.slice(0, 5000) : '',
      overlaySpec: entry.overlaySpec ?? null,
      hasVideo: canEdit,
      error: entry.error,
      dateAdded: Date.now(),
    };
    if (canEdit) {
      putVideo(entry.id, entry._file, entry.words || []).catch(() => {
        // storage unavailable/quota — the item just won't be editable
        setLibrary((prev) => prev.map((i) => (i.id === entry.id ? { ...i, hasVideo: false } : i)));
      });
    }
    setLibrary((prev) => [libraryEntry, ...prev.filter((i) => i.id !== entry.id)]);
  }, []);

  const handleLibraryDelete = useCallback((id) => {
    deleteVideo(id).catch(() => {});
    setLibrary((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // Editing a saved item: pull its video back out of IndexedDB into a fresh
  // object URL and open the same editor the Composer uses.
  const [libEditing, setLibEditing] = useState(null);
  const [libLoadingId, setLibLoadingId] = useState(null);

  const openLibEditor = useCallback((entry, blob, words) => {
    setLibEditing({
      id: entry.id,
      filename: entry.filename,
      mediaType: entry.mediaType,
      content: entry.content,
      words: words || [],
      overlaySpec: entry.overlaySpec ?? null,
      videoUrl: URL.createObjectURL(blob),
    });
  }, []);

  const handleLibraryEdit = useCallback(async (id) => {
    const entry = library.find((i) => i.id === id);
    if (!entry) return;

    // Items saved with this feature keep their video on-device; open directly.
    if (entry.hasVideo) {
      setLibLoadingId(id);
      let rec = null;
      try { rec = await getVideo(id); } catch { /* fall through to re-pick */ }
      setLibLoadingId(null);
      if (rec?.blob) {
        openLibEditor(entry, rec.blob, rec.words || []);
        return;
      }
    }

    // Older items (or ones from another device) have no stored video — let the
    // user re-select the source file. pickVideoFile() opens the picker
    // synchronously so the click gesture isn't lost on iOS.
    const file = await pickVideoFile();
    if (!file) return;
    putVideo(id, file, []).catch(() => {});
    setLibrary((prev) => prev.map((i) => (i.id === id ? { ...i, hasVideo: true } : i)));
    openLibEditor(entry, file, []);
  }, [library, openLibEditor]);

  // Loads the postable media for a Library item without any user prompt:
  // videos come back out of IndexedDB; photos are rebuilt from the stored
  // hookFrame JPEG. Returns { file, words } or null when nothing is stored.
  const loadLibraryMedia = useCallback(async (item) => {
    if (item.mediaType === 'photo') {
      const b64 = item.frames?.hookFrame;
      if (!b64) return null;
      try {
        const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
        const name = (item.filename || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
        return { file: new File([bytes], name, { type: 'image/jpeg' }), words: [] };
      } catch {
        return null;
      }
    }
    try {
      const rec = await getVideo(item.id);
      if (rec?.blob) {
        return {
          file: new File([rec.blob], item.filename || 'video.mp4', { type: rec.blob.type || 'video/mp4' }),
          words: rec.words || [],
        };
      }
    } catch { /* fall through */ }
    return null;
  }, []);

  const handleCloseLibEditor = useCallback(() => {
    setLibEditing((cur) => {
      if (cur?.videoUrl) URL.revokeObjectURL(cur.videoUrl);
      return null;
    });
  }, []);

  const handlePublished = useCallback((record) => {
    setPosts((prev) => [record, ...prev]);
  }, []);

  // Publishes run server-side now (publishJobs docs + worker function); the
  // library item carries the live state (publishing → published/failed) so
  // the Library shows a badge, and terminal states surface an app-wide toast
  // — the "you'll be notified" promise even when the publish panel is closed
  // or off-screen.
  const [toast, setToast] = useState(null); // { kind: 'ok'|'warn'|'error', message }
  const toastTimer = useRef(null);
  const handlePublishState = useCallback((id, patch) => {
    if (id != null) {
      setLibrary((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    }
    const s = patch.publishState;
    if (s === 'publishing') return;
    const messages = {
      published: { kind: 'ok', message: '✓ Video posted — upload completed.' },
      scheduled: { kind: 'ok', message: '✓ Post scheduled.' },
      pending: { kind: 'warn', message: '⏳ Post sent — open the Posts tab to confirm it went live.' },
      failed: { kind: 'error', message: '✕ Posting failed — open the item to see why and retry.' },
    };
    const t = messages[s];
    if (!t) return;
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 7000);
  }, []);

  // Watches every library item with an in-flight server publish job and
  // resolves it: badge flip, post record, toast, notification. Because the
  // job id is persisted on the item, this also reconciles jobs that finished
  // while the app was closed — reopening the app picks them right up.
  const jobSubsRef = useRef(new Map()); // jobId -> unsubscribe
  const settledJobsRef = useRef(new Set()); // guards double-fired snapshots
  useEffect(() => {
    const active = new Map(
      library
        .filter((i) => i.publishState === 'publishing' && i.publishJobId)
        .map((i) => [i.publishJobId, i])
    );
    for (const [jobId, unsub] of jobSubsRef.current) {
      if (!active.has(jobId)) {
        unsub();
        jobSubsRef.current.delete(jobId);
      }
    }
    for (const [jobId, item] of active) {
      if (jobSubsRef.current.has(jobId)) continue;
      const unsub = watchPublishJob(jobId, (job) => {
        if (!TERMINAL_JOB_STATES.includes(job.status)) return;
        if (settledJobsRef.current.has(jobId)) return;
        settledJobsRef.current.add(jobId);
        const meta = item.publishMeta || {};
        if (job.status !== 'failed') {
          handlePublished({
            id: `post-${jobId}`,
            ayrshareId: job.ayrshareId,
            caption: meta.caption || '',
            title: meta.title || '',
            platforms: meta.platforms || [],
            filename: item.filename,
            thumbnail: item.frames?.hookFrame || null,
            date: job.scheduleDate || new Date().toISOString(),
            status: job.status,
            errors: [],
          });
        }
        notify('1P Studio', job.status === 'failed'
          ? `Posting "${item.filename}" failed: ${(job.error || '').slice(0, 120)}`
          : job.status === 'scheduled' ? `"${item.filename}" is scheduled.` : `"${item.filename}" was posted — upload completed.`);
        handlePublishState(item.id, {
          publishState: job.status,
          publishedAt: Date.now(),
          publishedPlatforms: meta.platforms || [],
          publishError: job.error || null,
        });
      });
      jobSubsRef.current.set(jobId, unsub);
    }
  }, [library, handlePublished, handlePublishState]);

  const updateQueueItem = useCallback((id, patch) => {
    setQueue((q) => q.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const processFile = useCallback(
    async (queueItem, transcript = '', words = null) => {
      const { id, file } = queueItem;
      const fallbackMediaType = file.type.startsWith('image/') ? 'photo' : 'video';
      updateQueueItem(id, { status: 'processing', message: 'Starting...' });

      try {
        const result = await generateTikTokContent(file, (msg) => {
          updateQueueItem(id, { message: msg });
        }, transcript);

        updateQueueItem(id, { status: 'done', message: '' });
        const entry = {
          id,
          filename: file.name,
          _file: file,
          mediaType: result.mediaType || fallbackMediaType,
          videoUrl: URL.createObjectURL(file),
          frames: result.frames || {},
          content: result.content,
          transcript: result.transcript || transcript || '',
          // word timings power the editor's synced captions; when a manual
          // transcript skips re-transcription, reuse the original timings
          words: (result.words?.length ? result.words : words) || [],
          overlaySpec: null,
          error: null,
        };
        setResults((prev) => [entry, ...prev]);
        addToLibrary(entry);
      } catch (err) {
        updateQueueItem(id, { status: 'error', message: 'Failed' });
        const entry = {
          id,
          filename: file.name,
          _file: file,
          mediaType: fallbackMediaType,
          videoUrl: URL.createObjectURL(file),
          frames: {},
          content: null,
          transcript: transcript || '',
          words: words || [],
          overlaySpec: null,
          error: err.message,
        };
        setResults((prev) => [entry, ...prev]);
        addToLibrary(entry);
      }
    },
    [updateQueueItem, addToLibrary]
  );

  const handleFilesSelected = useCallback(
    async (files) => {
      const items = files.map((file) => ({
        id: uid(),
        file,
        filename: file.name,
        status: 'waiting',
        message: '',
      }));

      setQueue((prev) => [...prev, ...items]);
      setProcessing(true);
      for (const item of items) {
        await processFile(item);
      }
      setProcessing(false);
    },
    [processFile]
  );

  const handleRegenerate = useCallback(
    async (id, transcript) => {
      const result = results.find((r) => r.id === id);
      if (!result || !result._file) return;

      if (result.videoUrl) URL.revokeObjectURL(result.videoUrl);
      setResults((prev) => prev.filter((r) => r.id !== id));

      const newId = uid();
      const queueItem = { id: newId, file: result._file, filename: result.filename, status: 'waiting', message: '' };

      setQueue((prev) => [...prev, queueItem]);
      setProcessing(true);
      // fall back to the stored transcript/words so regenerating skips re-upload
      // and the editor's captions keep working (audio unchanged = timings valid)
      await processFile(queueItem, transcript || result.transcript || '', result.words || []);
      setProcessing(false);
    },
    [results, processFile]
  );

  const [editingId, setEditingId] = useState(null);
  const editingResult = results.find((r) => r.id === editingId) || null;
  const [showTextCreator, setShowTextCreator] = useState(false);

  const handleEdit = useCallback((id) => setEditingId(id), []);

  const handleSaveSpec = useCallback((id, spec) => {
    setResults((prev) => prev.map((r) => (r.id === id ? { ...r, overlaySpec: spec } : r)));
    // Persist edits back to the saved library item too, so reopening it keeps them.
    setLibrary((prev) => prev.map((i) => (i.id === id ? { ...i, overlaySpec: spec } : i)));
  }, []);

  const handleRemove = useCallback((id) => {
    setResults((prev) => {
      const target = prev.find((r) => r.id === id);
      if (target?.videoUrl) URL.revokeObjectURL(target.videoUrl);
      return prev.filter((r) => r.id !== id);
    });
    setEditingId((cur) => (cur === id ? null : cur));
  }, []);

  const isQueueActive = queue.some((i) => i.status === 'waiting' || i.status === 'processing');
  const meta = VIEW_META[view];
  const contentMax = view === 'composer' ? 860 : 1120;

  const renderView = () => {
    if (view === 'dashboard') {
      return <Dashboard library={library} posts={posts} onNavigate={setView} />;
    }
    if (view === 'calendar') {
      return <CalendarView posts={posts} onNavigate={setView} isMobile={isMobile} />;
    }
    if (view === 'posts') {
      return <PostsView posts={posts} onNavigate={setView} onRefresh={syncPosts} syncState={syncState} isMobile={isMobile} />;
    }
    if (view === 'clips') {
      return <ClipsView onPublished={handlePublished} onSaveToLibrary={addToLibrary} />;
    }
    if (view === 'captions') {
      return <CaptionsView />;
    }
    if (view === 'analytics') {
      return <Analytics library={library} posts={posts} />;
    }
    if (view === 'library') {
      return (
        <LibraryView
          library={library}
          onDelete={handleLibraryDelete}
          onEdit={handleLibraryEdit}
          loadingId={libLoadingId}
          onLoadMedia={loadLibraryMedia}
          onPublished={handlePublished}
          onPublishState={handlePublishState}
        />
      );
    }
    if (view === 'accounts') {
      return <AccountsView />;
    }
    if (view === 'settings') {
      return <SettingsView />;
    }
    // composer
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
          <div>
            <Eyebrow style={{ marginBottom: 12 }}>Content Composer</Eyebrow>
            <div style={{ fontFamily: f.display, fontSize: 34, textTransform: 'uppercase', color: '#fff', lineHeight: 0.95 }}>
              Generate &amp; <span style={{ color: c.red }}>publish.</span>
            </div>
          </div>
          <button
            onClick={() => setShowTextCreator(true)}
            disabled={processing}
            style={{
              background: c.inset,
              border: `1px solid ${c.border}`,
              borderRadius: 12,
              padding: '11px 18px',
              color: '#FFF',
              fontFamily: f.body,
              fontSize: 13,
              fontWeight: 600,
              cursor: processing ? 'not-allowed' : 'pointer',
              opacity: processing ? 0.5 : 1,
              transition: 'border-color 0.2s',
            }}
            onMouseEnter={(e) => { if (!processing) e.currentTarget.style.borderColor = c.redDim; }}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = c.border)}
          >
            ✍️ Create Text Post
          </button>
        </div>
        <DropZone onFilesSelected={handleFilesSelected} processing={processing} />

        {isQueueActive && (
          <div style={{ marginTop: 24 }}>
            <QueueProgress queue={queue} />
          </div>
        )}

        {results.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <Eyebrow dash dot={false} style={{ marginBottom: 16 }}>
              Generated Content — {results.length} post{results.length !== 1 ? 's' : ''}
            </Eyebrow>
            {results.map((result) => (
              <VideoCard
                key={result.id}
                result={result}
                onRegenerate={handleRegenerate}
                onRemove={handleRemove}
                onPublished={handlePublished}
                onPublishState={handlePublishState}
                onEdit={handleEdit}
              />
            ))}
          </div>
        )}
      </>
    );
  };

  // Auth gate: splash while resolving, sign-in wall when signed out.
  if (authUser === undefined) {
    return (
      <div style={{ minHeight: '100vh', background: c.bg, color: c.textDim, fontFamily: f.body,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <GlowBackground />
        <div style={{ position: 'relative', zIndex: 1, fontFamily: f.display, fontSize: 28, letterSpacing: '0.04em' }}>
          1P STUDIO…
        </div>
      </div>
    );
  }
  if (!authUser || authUser.isAnonymous) {
    return <SignInGate />;
  }

  return (
    <div style={{ minHeight: '100vh', background: c.bg, color: c.text, fontFamily: f.body }}>
      <GlowBackground />
      <Sidebar active={view} onNavigate={setView} counts={{ library: library.length }} isMobile={isMobile} />

      <div style={{ marginLeft: isMobile ? 0 : 232, position: 'relative', zIndex: 1 }}>
        {/* TOP BAR */}
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 100,
            height: 72,
            background: 'rgba(10,10,10,0.82)',
            backdropFilter: 'blur(12px)',
            borderBottom: `1px solid ${c.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: isMobile ? '0 18px' : '0 34px',
          }}
        >
          {isMobile && (
            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#000', border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: f.display, fontSize: 15, color: '#fff', flexShrink: 0 }}>
              1P
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            {!isMobile && <Eyebrow style={{ fontSize: 10.5, marginBottom: 5 }}>{meta.subtitle}</Eyebrow>}
            <div style={{ fontFamily: f.display, fontSize: 24, letterSpacing: '0.02em', color: '#FFF', lineHeight: 0.9, textTransform: 'uppercase' }}>
              {meta.title}
            </div>
          </div>
        </header>

        <main style={{ padding: isMobile ? '20px 16px calc(92px + env(safe-area-inset-bottom, 0px))' : '32px 34px 72px' }}>
          <div style={{ maxWidth: contentMax, margin: '0 auto' }}>
            {renderView()}
          </div>
        </main>
      </div>

      {/* full-screen editor — zIndex above Sidebar (200) and top bar (100) */}
      {editingResult && (
        <VideoEditorModal
          result={editingResult}
          onClose={() => setEditingId(null)}
          onSaveSpec={handleSaveSpec}
        />
      )}

      {/* editor opened from a saved Library item (video loaded from IndexedDB) */}
      {libEditing && (
        <VideoEditorModal
          result={libEditing}
          onClose={handleCloseLibEditor}
          onSaveSpec={handleSaveSpec}
        />
      )}

      {/* full-screen text post creator — rendered card feeds the photo pipeline */}
      {showTextCreator && (
        <TextPostCreator
          onClose={() => setShowTextCreator(false)}
          onCreate={(file) => handleFilesSelected([file])}
        />
      )}

      {/* publish completion toast — visible wherever the user is in the app */}
      {toast && (
        <div
          onClick={() => setToast(null)}
          style={{
            position: 'fixed',
            left: '50%',
            bottom: isMobile ? 84 : 28,
            transform: 'translateX(-50%)',
            zIndex: 1000,
            maxWidth: 'min(92vw, 480px)',
            background: '#111',
            border: `1px solid ${toast.kind === 'ok' ? '#00C48C' : toast.kind === 'warn' ? '#FFC107' : '#FF4444'}`,
            color: toast.kind === 'ok' ? '#00C48C' : toast.kind === 'warn' ? '#FFC107' : '#FF4444',
            borderRadius: 10,
            padding: '10px 16px',
            fontSize: 13,
            lineHeight: 1.5,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            cursor: 'pointer',
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
