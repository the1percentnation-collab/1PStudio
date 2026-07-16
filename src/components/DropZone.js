import React, { useState, useRef } from 'react';

export default function DropZone({ onFilesSelected, processing }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const icon = processing ? '⚙️' : dragging ? '🎯' : '🎬';

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
      f.type.startsWith('video/') || f.type.startsWith('image/')
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

  return (
    <div
      style={containerStyle}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <span style={iconStyle}>{icon}</span>
      <div style={headingStyle}>
        {processing ? 'PROCESSING...' : 'DROP VIDEOS OR PHOTOS HERE'}
      </div>
      <div style={subStyle}>
        {processing
          ? 'Please wait while your content is being generated'
          : 'Drag & drop up to 20 videos or photos, or click to browse'}
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
