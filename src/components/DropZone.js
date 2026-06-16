import React, { useState, useRef } from 'react';

export default function DropZone({ onFilesSelected, processing }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const icon = dragging ? '🎯' : '🎬';

  const containerStyle = {
    border: `2px dashed ${dragging ? '#E60306' : '#1A1A1A'}`,
    borderRadius: 12,
    padding: '48px 32px',
    textAlign: 'center',
    cursor: processing ? 'not-allowed' : 'pointer',
    opacity: processing ? 0.5 : 1,
    transition: 'border-color 0.2s, opacity 0.2s',
    background: dragging ? 'rgba(230,3,6,0.05)' : 'transparent',
    userSelect: 'none',
  };

  const iconStyle = {
    fontSize: 48,
    display: 'block',
    marginBottom: 16,
    transition: 'transform 0.2s',
    transform: dragging ? 'scale(1.1)' : 'scale(1)',
  };

  const headingStyle = {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 28,
    letterSpacing: '0.05em',
    color: '#FFFFFF',
    marginBottom: 8,
  };

  const subStyle = {
    fontSize: 14,
    color: '#888',
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

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (processing) return;
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith('video/')
    );
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
      <div style={{ ...containerStyle, cursor: 'default', borderColor: '#E60306', borderStyle: 'solid', background: 'rgba(230,3,6,0.04)' }}>
        <div
          style={{
            width: 52,
            height: 52,
            margin: '0 auto 18px',
            border: '4px solid #1A1A1A',
            borderTopColor: '#E60306',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <div style={headingStyle}>LOADING YOUR VIDEO…</div>
        <div style={subStyle}>
          Reading the video and generating your content. This can take a moment for longer clips —
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
      <div style={headingStyle}>DROP VIDEOS HERE</div>
      <div style={subStyle}>
        Drag &amp; drop up to 20 video files, or click to browse
      </div>
      <div style={{ fontSize: 12, color: '#555', marginTop: 8, lineHeight: 1.5 }}>
        Tip: long or 4K iPhone videos are large and load slowly, especially from iCloud.
        For speed, use Wi-Fi and pick shorter clips already downloaded to your device.
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleChange}
      />
    </div>
  );
}
