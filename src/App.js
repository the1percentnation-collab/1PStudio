import React, { useState, useCallback, useEffect } from 'react';
import DropZone from './components/DropZone';
import VideoCard from './components/VideoCard';
import QueueProgress from './components/QueueProgress';
import LibraryView from './components/LibraryView';
import { generateTikTokContent } from './services/claudeService';

const LIBRARY_KEY = '1p-studio-library';

let idCounter = 0;
const uid = () => `v-${++idCounter}-${Date.now()}`;

function loadLibrary() {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLibrary(items) {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(items));
  } catch {
    // storage quota exceeded — fail silently
  }
}

export default function App() {
  const [queue, setQueue] = useState([]);
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  const [library, setLibrary] = useState(loadLibrary);

  useEffect(() => {
    saveLibrary(library);
  }, [library]);

  const addToLibrary = useCallback((entry) => {
    // only store hookFrame for thumbnail; skip mid/end to stay within storage limits
    const libraryEntry = {
      id: entry.id,
      filename: entry.filename,
      frames: { hookFrame: entry.frames?.hookFrame ?? null },
      content: entry.content,
      error: entry.error,
      dateAdded: Date.now(),
    };
    setLibrary((prev) => [libraryEntry, ...prev.filter((i) => i.id !== entry.id)]);
  }, []);

  const handleLibraryDelete = useCallback((id) => {
    setLibrary((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateQueueItem = useCallback((id, patch) => {
    setQueue((q) => q.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const processFile = useCallback(
    async (queueItem, transcript = '') => {
      const { id, file } = queueItem;
      updateQueueItem(id, { status: 'processing', message: 'Starting...' });

      try {
        const content = await generateTikTokContent(file, (msg) => {
          updateQueueItem(id, { message: msg });
        }, transcript);

        updateQueueItem(id, { status: 'done', message: '' });
        const entry = { id, filename: file.name, _file: file, frames: {}, content, error: null };
        setResults((prev) => [entry, ...prev]);
        addToLibrary(entry);
      } catch (err) {
        updateQueueItem(id, { status: 'error', message: 'Failed' });
        const entry = { id, filename: file.name, _file: file, frames: {}, content: null, error: err.message };
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

      setResults((prev) => prev.filter((r) => r.id !== id));

      const newId = uid();
      const queueItem = {
        id: newId,
        file: result._file,
        filename: result.filename,
        status: 'waiting',
        message: '',
      };

      setQueue((prev) => [...prev, queueItem]);
      setProcessing(true);
      await processFile(queueItem, transcript || '');
      setProcessing(false);
    },
    [results, processFile]
  );

  const handleRemove = useCallback((id) => {
    setResults((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const isQueueActive = queue.some((i) => i.status === 'waiting' || i.status === 'processing');

  const tabStyle = (tab) => ({
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 15,
    letterSpacing: '0.08em',
    color: activeTab === tab ? '#FFFFFF' : '#555',
    background: 'transparent',
    border: 'none',
    borderBottom: `2px solid ${activeTab === tab ? '#E60306' : 'transparent'}`,
    padding: '4px 2px',
    cursor: 'pointer',
    transition: 'color 0.2s',
  });

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A' }}>
      {/* STICKY HEADER */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'rgba(10,10,10,0.95)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #1A1A1A',
          padding: '0 24px',
        }}
      >
        <div
          style={{
            maxWidth: 760,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            height: 60,
            gap: 20,
          }}
        >
          {/* LOGO */}
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: '0.04em', flexShrink: 0 }}>
            <span style={{ color: '#E60306' }}>1P</span>
            <span style={{ color: '#FFFFFF', marginLeft: 6 }}>STUDIO</span>
          </div>

          {/* TABS */}
          <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
            <button style={tabStyle('upload')} onClick={() => setActiveTab('upload')}>UPLOAD</button>
            <button style={tabStyle('library')} onClick={() => setActiveTab('library')}>
              LIBRARY{library.length > 0 ? ` (${library.length})` : ''}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 64px' }}>
        {activeTab === 'upload' ? (
          <>
            <DropZone onFilesSelected={handleFilesSelected} processing={processing} />

            {isQueueActive && (
              <div style={{ marginTop: 24 }}>
                <QueueProgress queue={queue} />
              </div>
            )}

            {results.length > 0 && (
              <div style={{ marginTop: 32 }}>
                <div style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 20,
                  letterSpacing: '0.06em',
                  color: '#555',
                  marginBottom: 16,
                }}>
                  GENERATED CONTENT — {results.length} video{results.length !== 1 ? 's' : ''}
                </div>
                {results.map((result) => (
                  <VideoCard
                    key={result.id}
                    result={result}
                    onRegenerate={handleRegenerate}
                    onRemove={handleRemove}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <LibraryView library={library} onDelete={handleLibraryDelete} />
        )}
      </main>
    </div>
  );
}
