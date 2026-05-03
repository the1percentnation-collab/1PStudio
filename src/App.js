import React, { useState, useCallback } from 'react';
import DropZone from './components/DropZone';
import VideoCard from './components/VideoCard';
import QueueProgress from './components/QueueProgress';
import { generateTikTokContent, extractFramesFromVideo } from './services/claudeService';

let idCounter = 0;
const uid = () => `v-${++idCounter}-${Date.now()}`;

export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [keySet, setKeySet] = useState(false);
  const [queue, setQueue] = useState([]);
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);

  const updateQueueItem = useCallback((id, patch) => {
    setQueue((q) => q.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const processFile = useCallback(
    async (queueItem, key, transcript = '') => {
      const { id, file } = queueItem;
      updateQueueItem(id, { status: 'processing', message: 'Starting...' });

      let frames = { hookFrame: null, midFrame: null, endFrame: null };
      try {
        frames = await extractFramesFromVideo(file);
      } catch {
        /* non-fatal */
      }

      try {
        const content = await generateTikTokContent(file, key, (msg) => {
          updateQueueItem(id, { message: msg });
        }, transcript);

        updateQueueItem(id, { status: 'done', message: '' });
        setResults((prev) => [
          { id, filename: file.name, _file: file, frames, content, error: null },
          ...prev,
        ]);
      } catch (err) {
        updateQueueItem(id, { status: 'error', message: 'Failed' });
        setResults((prev) => [
          { id, filename: file.name, _file: file, frames, content: null, error: err.message },
          ...prev,
        ]);
      }
    },
    [updateQueueItem]
  );

  const handleFilesSelected = useCallback(
    async (files) => {
      if (!apiKey) {
        alert('Please set your Anthropic API key first.');
        return;
      }

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
        await processFile(item, apiKey);
      }

      setProcessing(false);
    },
    [apiKey, processFile]
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
      await processFile(queueItem, apiKey, transcript || '');
      setProcessing(false);
    },
    [results, apiKey, processFile]
  );

  const handleRemove = useCallback((id) => {
    setResults((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const exportAllCSV = useCallback(() => {
    const rows = results.filter((r) => r.content);
    if (rows.length === 0) return;

    const headers = [
      'Filename',
      'Content Pillar',
      'Hook Score',
      'Headline',
      'Title Option 1',
      'Title Option 2',
      'Title Option 3',
      'SEO Opener',
      'Caption',
      'Hashtags',
      'Hook Score Reason',
      'Transcript Summary',
    ];

    const escape = (v) => `"${String(v || '').replace(/"/g, '""')}"`;

    const csvContent = [
      headers.join(','),
      ...rows.map((r) =>
        [
          escape(r.filename),
          escape(r.content.content_pillar),
          escape(r.content.hook_score),
          escape(r.content.headline),
          escape(r.content.titles?.[0]),
          escape(r.content.titles?.[1]),
          escape(r.content.titles?.[2]),
          escape(r.content.seo_opener),
          escape(r.content.caption),
          escape(r.content.hashtags),
          escape(r.content.hook_score_reason),
          escape(r.content.transcript_summary),
        ].join(',')
      ),
    ].join('\n');

    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `1p-content-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  const handleSetKey = () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setApiKey(trimmed);
    setKeySet(true);
    setKeyInput('');
  };

  const hasResults = results.some((r) => r.content);
  const isQueueActive = queue.some((i) => i.status === 'waiting' || i.status === 'processing');

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
            justifyContent: 'space-between',
            height: 60,
            gap: 16,
          }}
        >
          <div
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 28,
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}
          >
            <span style={{ color: '#E60306' }}>1P</span>
            <span style={{ color: '#FFFFFF', marginLeft: 6 }}>STUDIO</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'flex-end' }}>
            {keySet ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  color: '#00C48C',
                  background: '#00C48C14',
                  border: '1px solid #00C48C44',
                  borderRadius: 6,
                  padding: '4px 10px',
                  cursor: 'pointer',
                }}
                onClick={() => { setKeySet(false); setApiKey(''); }}
                title="Click to reset key"
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00C48C', display: 'inline-block' }} />
                Key Set
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="password"
                  placeholder="Anthropic API Key"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSetKey()}
                  style={{
                    background: '#111',
                    border: '1px solid #1A1A1A',
                    borderRadius: 8,
                    color: '#FFF',
                    fontSize: 13,
                    padding: '7px 12px',
                    width: 200,
                  }}
                />
                <button
                  onClick={handleSetKey}
                  style={{
                    background: '#E60306',
                    color: '#FFF',
                    fontSize: 13,
                    fontWeight: 600,
                    padding: '7px 14px',
                    borderRadius: 8,
                    transition: 'opacity 0.2s',
                  }}
                  onMouseEnter={(e) => (e.target.style.opacity = '0.85')}
                  onMouseLeave={(e) => (e.target.style.opacity = '1')}
                >
                  Save
                </button>
              </div>
            )}

            {hasResults && (
              <button
                onClick={exportAllCSV}
                style={{
                  background: '#111',
                  border: '1px solid #1A1A1A',
                  color: '#CCC',
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '7px 12px',
                  borderRadius: 8,
                  transition: 'border-color 0.2s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => (e.target.style.borderColor = '#E60306')}
                onMouseLeave={(e) => (e.target.style.borderColor = '#1A1A1A')}
              >
                Export CSV
              </button>
            )}
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 64px' }}>
        <DropZone onFilesSelected={handleFilesSelected} processing={processing} />

        {isQueueActive && (
          <div style={{ marginTop: 24 }}>
            <QueueProgress queue={queue} />
          </div>
        )}

        {results.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 20,
                letterSpacing: '0.06em',
                color: '#555',
                marginBottom: 16,
              }}
            >
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
      </main>
    </div>
  );
}
