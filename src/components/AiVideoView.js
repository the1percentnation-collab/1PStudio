import React, { useState } from 'react';
import { generateVideo, pollVideoStatus, importVideo } from '../services/higgsfieldService';
import PublishPanel from './PublishPanel';

const cardStyle = {
  background: '#111',
  border: '1px solid #1A1A1A',
  borderRadius: 16,
  padding: 20,
  marginBottom: 18,
};

const labelStyle = {
  display: 'block',
  fontSize: 10,
  color: '#666',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  marginBottom: 6,
};

const inputStyle = {
  width: '100%',
  background: '#0D0D0D',
  border: '1px solid #2A2A2A',
  borderRadius: 8,
  color: '#DDD',
  fontSize: 13,
  padding: '10px 12px',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const redBtn = (disabled) => ({
  background: '#E60306',
  color: '#FFF',
  fontSize: 13,
  fontWeight: 700,
  padding: '10px 18px',
  borderRadius: 8,
  border: 'none',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
});

const sectionTitle = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: 18,
  letterSpacing: '0.05em',
  color: '#FFF',
  marginBottom: 4,
};

export default function AiVideoView() {
  // Generate
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const [genMsg, setGenMsg] = useState('');
  const [genError, setGenError] = useState('');

  // Import
  const [importUrl, setImportUrl] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState('');

  // Ready clips (both sources) — each: { id, mediaUrl, mediaType, source }
  const [clips, setClips] = useState([]);

  const addClip = (clip) => setClips((prev) => [{ id: `c-${Date.now()}`, ...clip }, ...prev]);

  const handleGenerate = async () => {
    if (!prompt.trim() && !imageUrl.trim()) {
      setGenError('Enter a prompt or a source image URL.');
      return;
    }
    setGenBusy(true);
    setGenError('');
    setGenMsg('Submitting…');
    try {
      const { requestId } = await generateVideo({ prompt: prompt.trim(), imageUrl: imageUrl.trim() || undefined });
      setGenMsg('Generating… this can take a few minutes.');
      const { videoUrl, mediaType } = await pollVideoStatus(requestId, {
        onTick: (s) => setGenMsg(`Generating… ${s}s elapsed`),
      });
      addClip({ mediaUrl: videoUrl, mediaType: mediaType || 'video', source: 'Higgsfield' });
      setGenMsg('');
      setPrompt('');
      setImageUrl('');
    } catch (e) {
      setGenError(e.message || 'Generation failed.');
      setGenMsg('');
    } finally {
      setGenBusy(false);
    }
  };

  const handleImport = async () => {
    if (!importUrl.trim()) {
      setImportError('Paste a direct https link to a video.');
      return;
    }
    setImportBusy(true);
    setImportError('');
    try {
      const { videoUrl, mediaType } = await importVideo(importUrl.trim());
      addClip({ mediaUrl: videoUrl, mediaType: mediaType || 'video', source: 'Import' });
      setImportUrl('');
    } catch (e) {
      setImportError(e.message || 'Import failed.');
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 760 }}>
      {/* GENERATE */}
      <div style={cardStyle}>
        <div style={sectionTitle}>GENERATE WITH HIGGSFIELD</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 14, lineHeight: 1.5 }}>
          Describe a clip, or paste a source image URL to animate it (image-to-video). The finished
          video lands here, ready to post.
        </div>

        <label style={labelStyle}>Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="e.g. A determined entrepreneur walking through a city at sunrise, cinematic, vertical"
          style={{ ...inputStyle, resize: 'vertical', marginBottom: 12 }}
        />

        <label style={labelStyle}>Source image URL (optional — enables image-to-video)</label>
        <input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://…"
          style={{ ...inputStyle, marginBottom: 14 }}
        />

        <button onClick={handleGenerate} disabled={genBusy} style={redBtn(genBusy)}>
          {genBusy ? 'Working…' : 'Generate'}
        </button>
        {genMsg && <div style={{ fontSize: 12, color: '#FBBF24', marginTop: 10 }}>{genMsg}</div>}
        {genError && <div style={{ fontSize: 12, color: '#FF4444', marginTop: 10, wordBreak: 'break-word' }}>{genError}</div>}
      </div>

      {/* IMPORT */}
      <div style={cardStyle}>
        <div style={sectionTitle}>IMPORT FROM URL</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 14, lineHeight: 1.5 }}>
          Already made a video in Higgsfield (or anywhere)? Paste its direct download link to bring it
          in for posting.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://… direct video link"
            style={{ ...inputStyle, flex: 1, minWidth: 220 }}
          />
          <button onClick={handleImport} disabled={importBusy} style={redBtn(importBusy)}>
            {importBusy ? 'Importing…' : 'Import'}
          </button>
        </div>
        {importError && <div style={{ fontSize: 12, color: '#FF4444', marginTop: 10, wordBreak: 'break-word' }}>{importError}</div>}
      </div>

      {/* READY CLIPS */}
      {clips.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: '0.06em', color: '#555', marginBottom: 16 }}>
            READY TO POST — {clips.length}
          </div>
          {clips.map((clip) => (
            <div key={clip.id} style={{ ...cardStyle, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ width: 150, flexShrink: 0 }}>
                {clip.mediaType === 'image' ? (
                  <img src={clip.mediaUrl} alt="" style={{ width: '100%', borderRadius: 10, display: 'block' }} />
                ) : (
                  <video src={clip.mediaUrl} controls style={{ width: '100%', borderRadius: 10, display: 'block', background: '#000' }} />
                )}
                <div style={{ fontSize: 11, color: '#555', marginTop: 6 }}>{clip.source}</div>
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <PublishPanel mediaUrl={clip.mediaUrl} content={{}} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
