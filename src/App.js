import React, { useState, useCallback, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import CalendarView from './components/CalendarView';
import Analytics from './components/Analytics';
import AccountsView from './components/AccountsView';
import CaptionsView from './components/CaptionsView';
import DropZone from './components/DropZone';
import VideoCard from './components/VideoCard';
import QueueProgress from './components/QueueProgress';
import LibraryView from './components/LibraryView';
import { generateTikTokContent } from './services/claudeService';
import VideoEditorModal from './components/editor/VideoEditorModal';

const LIBRARY_KEY = '1p-studio-library';
const POSTS_KEY = '1p-studio-posts';

let idCounter = 0;
const uid = () => `v-${++idCounter}-${Date.now()}`;

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
  captions: { title: 'Captions', subtitle: 'Auto burned-in subtitles' },
  calendar: { title: 'Content Calendar', subtitle: 'Scheduled & published posts' },
  analytics: { title: 'Analytics', subtitle: 'Performance & content insights' },
  library: { title: 'Library', subtitle: 'Saved generated content' },
  accounts: { title: 'Accounts', subtitle: 'Connect your social platforms' },
};

export default function App() {
  const [queue, setQueue] = useState([]);
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [view, setView] = useState('dashboard');
  const [library, setLibrary] = useState(() => loadJSON(LIBRARY_KEY));
  const [posts, setPosts] = useState(() => loadJSON(POSTS_KEY));
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));

  useEffect(() => { saveJSON(LIBRARY_KEY, library); }, [library]);
  useEffect(() => { saveJSON(POSTS_KEY, posts); }, [posts]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const addToLibrary = useCallback((entry) => {
    const libraryEntry = {
      id: entry.id,
      filename: entry.filename,
      frames: { hookFrame: entry.frames?.hookFrame ?? null },
      content: entry.content,
      transcript: entry.transcript ? entry.transcript.slice(0, 5000) : '',
      error: entry.error,
      dateAdded: Date.now(),
    };
    setLibrary((prev) => [libraryEntry, ...prev.filter((i) => i.id !== entry.id)]);
  }, []);

  const handleLibraryDelete = useCallback((id) => {
    setLibrary((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const handlePublished = useCallback((record) => {
    setPosts((prev) => [record, ...prev]);
  }, []);

  const updateQueueItem = useCallback((id, patch) => {
    setQueue((q) => q.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const processFile = useCallback(
    async (queueItem, transcript = '', words = null) => {
      const { id, file } = queueItem;
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

  const handleEdit = useCallback((id) => setEditingId(id), []);

  const handleSaveSpec = useCallback((id, spec) => {
    setResults((prev) => prev.map((r) => (r.id === id ? { ...r, overlaySpec: spec } : r)));
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
    if (view === 'captions') {
      return <CaptionsView />;
    }
    if (view === 'analytics') {
      return <Analytics library={library} posts={posts} />;
    }
    if (view === 'library') {
      return <LibraryView library={library} onDelete={handleLibraryDelete} />;
    }
    if (view === 'accounts') {
      return <AccountsView />;
    }
    // composer
    return (
      <>
        <DropZone onFilesSelected={handleFilesSelected} processing={processing} />

        {isQueueActive && (
          <div style={{ marginTop: 24 }}>
            <QueueProgress queue={queue} />
          </div>
        )}

        {results.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: '0.06em', color: '#555', marginBottom: 16 }}>
              GENERATED CONTENT — {results.length} video{results.length !== 1 ? 's' : ''}
            </div>
            {results.map((result) => (
              <VideoCard
                key={result.id}
                result={result}
                onRegenerate={handleRegenerate}
                onRemove={handleRemove}
                onPublished={handlePublished}
                onEdit={handleEdit}
              />
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A' }}>
      <Sidebar active={view} onNavigate={setView} counts={{ library: library.length }} isMobile={isMobile} />

      <div style={{ marginLeft: isMobile ? 0 : 220 }}>
        {/* TOP BAR */}
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 100,
            height: 60,
            background: 'rgba(10,10,10,0.92)',
            backdropFilter: 'blur(8px)',
            borderBottom: '1px solid #1A1A1A',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: isMobile ? '0 18px' : '0 32px',
          }}
        >
          {isMobile && (
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: '0.04em', flexShrink: 0 }}>
              <span style={{ color: '#E60306' }}>1P</span>
              <span style={{ color: '#FFFFFF', marginLeft: 4 }}>STUDIO</span>
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: '0.04em', color: '#FFF', lineHeight: 1 }}>
              {meta.title.toUpperCase()}
            </div>
            {!isMobile && <div style={{ fontSize: 12, color: '#555', marginTop: 3 }}>{meta.subtitle}</div>}
          </div>
        </header>

        <main style={{ padding: isMobile ? '18px 16px 96px' : '28px 32px 64px' }}>
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
    </div>
  );
}
