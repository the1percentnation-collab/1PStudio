import React, { useState, useRef } from 'react';
import { colors as c, fonts as f } from '../theme';

export default function DropZone({
  onFilesSelected,
  processing,
  accept = 'video/*,image/*',
  multiple = true,
  heading = 'DROP VIDEOS OR PHOTOS HERE',
  sub = 'Drag & drop up to 20 videos or photos, or click to browse',
  tip = 'Tip: long or 4K iPhone videos are large and load slowly, especially from iCloud. For speed, use Wi-Fi and pick shorter clips already downloaded to your device.',
  busyHeading = 'LOADING YOUR MEDIA…',
  busySub = 'Reading the file and generating your content. This can take a moment for longer clips — please keep this tab open.',
}) {
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

  // Accept anything the browser tags with an accepted top-level type, but also
  // fall back to the file extension — phone-recorded clips (.mov/.hevc), voice
  // memos (.m4a) and some photos arrive with an empty or non-standard MIME type
  // and would otherwise be silently dropped.
  const EXT_BY_KIND = {
    video: /\.(mp4|mov|m4v|webm|avi|mkv|hevc|3gp|mpeg|mpg|qt)$/i,
    image: /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i,
    audio: /\.(mp3|m4a|wav|aac|ogg|oga|flac|amr|caf|wma)$/i,
  };
  const kinds = Object.keys(EXT_BY_KIND).filter((k) => accept.includes(`${k}/`));
  const isMediaFile = (f) =>
    kinds.some((k) => f.type.startsWith(`${k}/`) || EXT_BY_KIND[k].test(f.name));

  const take = (files) => files.slice(0, multiple ? 20 : 1);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (processing) return;
    const files = Array.from(e.dataTransfer.files).filter(isMediaFile);
    if (files.length > 0) onFilesSelected(take(files));
  };

  const handleClick = () => {
    if (!processing) inputRef.current?.click();
  };

  const handleChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) onFilesSelected(take(files));
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
        <div style={headingStyle}>{busyHeading}</div>
        <div style={subStyle}>{busySub}</div>
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
      <div style={headingStyle}>{heading}</div>
      <div style={subStyle}>{sub}</div>
      {tip && (
        <div style={{ fontSize: 12, color: c.textFaint, marginTop: 8, lineHeight: 1.5 }}>{tip}</div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ display: 'none' }}
        onChange={handleChange}
      />
    </div>
  );
}
