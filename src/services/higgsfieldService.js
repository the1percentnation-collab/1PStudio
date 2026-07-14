// Client for the Higgsfield AI-video endpoints (Cloud Functions behind /api/*).
//
// generateVideo submits a job and returns a requestId; pollVideoStatus then
// polls until the clip is ready (the server copies the finished video into
// Firebase Storage and hands back a durable URL). importVideo pulls an existing
// video URL into Storage the same way.

// Coerce any server error payload into a readable string (never "[object Object]").
function errText(data, res, fallback) {
  const e = data?.error;
  if (typeof e === 'string') return e;
  if (e) { try { return JSON.stringify(e); } catch { /* ignore */ } }
  return fallback || `Request failed (${res.status})`;
}

// Kick off a generation. { prompt, imageUrl? } -> { requestId }
export async function generateVideo({ prompt, imageUrl }) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, imageUrl }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errText(data, res, `Generation failed (${res.status})`));
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
  if (!res.ok) throw new Error(errText(data, res, `Status check failed (${res.status})`));
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

// ---- AI cover backgrounds (Higgsfield Soul, text-to-image) ----------------

// Start an AI cover-background generation. { prompt, aspect } -> { requestId }
export async function generateCoverImage(prompt, aspect) {
  const res = await fetch('/api/cover-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, aspect }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errText(data, res, `Generation failed (${res.status})`));
  return data;
}

// Free AI cover background via Pollinations (no key/credits). -> { dataUrl }
export async function generateFreeCoverImage(prompt, aspect) {
  const res = await fetch('/api/cover-image-free', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, aspect }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errText(data, res, `Generation failed (${res.status})`));
  return data;
}

async function checkCoverImage(requestId) {
  const res = await fetch('/api/cover-image-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errText(data, res, `Status check failed (${res.status})`));
  return data;
}

// Polls until the cover image is ready. Resolves with { dataUrl }.
export async function pollCoverImage(requestId, { onTick, intervalMs = 5000, timeoutMs = 5 * 60 * 1000 } = {}) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = await checkCoverImage(requestId);
    if (data.status === 'ready') return data;
    if (['failed', 'nsfw', 'canceled'].includes(data.status)) {
      throw new Error(data.error || `Generation ${data.status}.`);
    }
    if (Date.now() - start > timeoutMs) throw new Error('Timed out generating the image. Try again.');
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
  if (!res.ok) throw new Error(errText(data, res, `Import failed (${res.status})`));
  return data;
}
