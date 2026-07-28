import React, { useState, useRef } from 'react';
import { colors as c, fonts as f } from '../theme';

export default function DropZone({ onFilesSelected, processing }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const icon = dragging ? '🎯' : '🎬';

  const containerStyle = {
    border: `1.5px dashed ${dragging ? c.red : c.border}`,
    borderRadius: 16,
    padding: '52px 32px',
    textAlign: 'center',
    cursor: processing ? 'not-allowed' : 'pointer',
    opacity: processing ? 0.5 : 1,
    transition: 'border-color 0.2s, opacity 0.2s, background 0.2s',
    background: dragging ? c.redGlow : c.surface,
    userSelect: 'none',
  };

  const iconStyle = {
    fontSize: 46,
    display: 'block',
    marginBottom: 16,
    transition: 'transform 0.2s',
    transform: dragging ? 'scale(1.12)' : 'scale(1)',
  };

  const headingStyle = {
    fontFamily: f.display,
    fontSize: 30,
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    color: '#FFFFFF',
    marginBottom: 10,
  };

  const subStyle = {
    fontSize: 13.5,
    color: c.textDim,
    lineHeight: 1.5,
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!processing) setDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragging(false);
  };

  // Accept anything the browser tags as video/* or image/*, but also fall back
  // to the file extension — phone-recorded clips (.mov/.hevc) and some photos
  // often arrive with an empty or non-standard MIME type and would otherwise be
  // silently dropped.
  const MEDIA_EXT = /\.(mp4|mov|m4v|webm|avi|mkv|hevc|3gp|mpeg|mpg|qt|jpg|jpeg|png|gif|webp|heic|heif)$/i;
  const isMediaFile = (f) =>
    f.type.startsWith('video/') || f.type.startsWith('image/') || MEDIA_EXT.test(f.name);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (processing) return;
    const files = Array.from(e.dataTransfer.files).filter(isMediaFile);
    if (files.length > 0) onFilesSelected(files.slice(0, 20));
  };

  const handleClick = () => {
    if (!processing) inputRef.current?.click();
  };

  const handleChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) onFilesSelected(files.slice(0, 20));
    e.target.value = '';
  };

  if (processing) {
    return (
      <div style={{ ...containerStyle, cursor: 'default', borderColor: c.redDim, borderStyle: 'solid', background: c.redGlow }}>
        <div
          style={{
            width: 52,
            height: 52,
            margin: '0 auto 18px',
            border: `4px solid ${c.border}`,
            borderTopColor: c.red,
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <div style={headingStyle}>LOADING YOUR MEDIA…</div>
        <div style={subStyle}>
          Reading the file and generating your content. This can take a moment for longer clips —
          please keep this tab open.
        </div>
      </div>
    );
  }

  return (
    <div
      style={containerStyle}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <span style={iconStyle}>{icon}</span>
      <div style={headingStyle}>DROP VIDEOS OR PHOTOS HERE</div>
      <div style={subStyle}>
        Drag &amp; drop up to 20 videos or photos, or click to browse
      </div>
      <div style={{ fontSize: 12, color: c.textFaint, marginTop: 8, lineHeight: 1.5 }}>
        Tip: long or 4K iPhone videos are large and load slowly, especially from iCloud.
        For speed, use Wi-Fi and pick shorter clips already downloaded to your device.
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleChange}
      />
    </div>
  );
}
