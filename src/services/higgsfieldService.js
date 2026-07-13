// Client for the Higgsfield AI-video endpoints (Cloud Functions behind /api/*).
//
// generateVideo submits a job and returns a requestId; pollVideoStatus then
// polls until the clip is ready (the server copies the finished video into
// Firebase Storage and hands back a durable URL). importVideo pulls an existing
// video URL into Storage the same way.

// Kick off a generation. { prompt, imageUrl? } -> { requestId }
export async function generateVideo({ prompt, imageUrl }) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, imageUrl }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Generation failed (${res.status})`);
  return data; // { status:'ok', requestId }
}

// One status check. -> { status: 'generating'|'ready'|'failed'|..., videoUrl?, error? }
export async function checkVideoStatus(requestId) {
  const res = await fetch('/api/video-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Status check failed (${res.status})`);
  return data;
}

// Polls checkVideoStatus until the clip is ready or fails. onTick(elapsedSeconds)
// fires each poll so the UI can show progress. Resolves with { videoUrl, mediaType }.
export async function pollVideoStatus(requestId, { onTick, intervalMs = 8000, timeoutMs = 12 * 60 * 1000 } = {}) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = await checkVideoStatus(requestId);
    if (data.status === 'ready') return data;
    if (data.status === 'failed' || data.status === 'nsfw' || data.status === 'canceled') {
      throw new Error(data.error || `Generation ${data.status}.`);
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for the video. Check back later or try again.');
    }
    if (onTick) onTick(Math.round((Date.now() - start) / 1000));
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// Import an existing video/image by URL. -> { videoUrl, mediaType }
export async function importVideo(url) {
  const res = await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Import failed (${res.status})`);
  return data;
}
