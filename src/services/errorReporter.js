// Sends client-side failures somewhere durable so they can be diagnosed later.
//
// Before this existed, every error a user hit — a failed generation, a broken
// export, a render crash — lived only in React state and died with the tab.
// Nothing off-device ever knew. This is the missing signal that the
// error-watch workflow polls and the triage Routine diagnoses.
//
// Three rules this module must never break:
//   1. It must never throw. An error inside the error reporter is invisible
//      and can take the app down with it.
//   2. It must never flood. One broken render loop could otherwise write
//      thousands of documents in a second.
//   3. It must never leak a key. Users paste API keys into this app, so a
//      stack or a context value can carry one.

import { authHeaders } from './userKeys';

const ENDPOINT = '/api/client-error';
const MAX_PER_SESSION = 10;
const MAX_MESSAGE = 500;
const MAX_STACK = 4000;
const MAX_CONTEXT = 1000;

// Anything shaped like a credential is replaced before it leaves the browser.
// The server scrubs again — this is defence in depth, not the only pass.
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{12,}/g, // Anthropic / OpenAI style keys
  /Bearer\s+[A-Za-z0-9._-]{12,}/gi, // auth headers pasted into a message
  /\b[A-Fa-f0-9]{32,}\b/g, // long hex: tokens, Firebase download tokens
  /AIza[A-Za-z0-9_-]{20,}/g, // Google API keys
  /eyJ[A-Za-z0-9._-]{20,}/g, // JWTs (id tokens)
  /([?&](?:token|access_token|key|api_key)=)[^&\s"']+/gi, // Storage download URLs
];

let sentCount = 0;
const seenFingerprints = new Set();
// Guards against the reporter reporting its own failure, which would loop.
let inReporter = false;

function scrub(value) {
  let out = String(value ?? '');
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, '[redacted]');
  return out;
}

// djb2 over the message plus the first stack frame. Same bug from the same
// place collapses to one fingerprint, which is what stops the triage Routine
// opening a second PR for something it already handled.
function fingerprintOf(message, stack) {
  const frame = (stack.split('\n')[1] || '').trim();
  const basis = `${message}::${frame}`;
  let hash = 5381;
  for (let i = 0; i < basis.length; i += 1) hash = ((hash << 5) + hash + basis.charCodeAt(i)) | 0;
  return `c${(hash >>> 0).toString(36)}`;
}

/**
 * Report a client-side error. Returns true if it was sent, false if it was
 * deduped, rate limited, or failed to send — never throws either way.
 */
export async function reportError(error, context = {}) {
  // The guard covers ONLY the synchronous section below. Holding it across the
  // await would drop every other error raised in the same tick — a burst of
  // distinct failures would report just the first one.
  if (inReporter) return false;

  let payload;
  try {
    inReporter = true;
    if (sentCount >= MAX_PER_SESSION) return false;

    const { kind = 'unknown', ...rest } = context || {};
    const message = scrub(error?.message || error || 'Unknown error').slice(0, MAX_MESSAGE);

    // If the reporting endpoint itself is what failed, stay quiet rather than
    // cascade. A dead endpoint degrades to the old behaviour (nothing sent).
    if (message.includes(ENDPOINT) || message.includes('client-error')) return false;

    const stack = scrub(error?.stack || '').slice(0, MAX_STACK);
    const fingerprint = fingerprintOf(message, stack);

    if (seenFingerprints.has(fingerprint)) return false;
    seenFingerprints.add(fingerprint);
    sentCount += 1;

    payload = {
      message,
      stack,
      fingerprint,
      kind: String(kind).slice(0, 60),
      // pathname only — a full URL can carry query-string secrets
      url: typeof window !== 'undefined' ? window.location.pathname : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : '',
      appVersion: process.env.REACT_APP_COMMIT_SHA || 'dev',
      at: new Date().toISOString(),
      context: scrub(JSON.stringify(rest ?? {})).slice(0, MAX_CONTEXT),
    };
  } catch {
    return false;
  } finally {
    inReporter = false;
  }

  try {
    const headers = { 'Content-Type': 'application/json', ...(await authHeaders().catch(() => ({}))) };
    // keepalive so a report still goes out if the error happens as the page is
    // being torn down.
    await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      keepalive: true,
    });
    return true;
  } catch {
    // A failed report must never surface to the user or bubble further.
    return false;
  }
}

// Catches what the React tree can't see: async throws, rejected promises,
// and errors from event handlers outside a boundary.
export function installGlobalErrorHandlers() {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    // Resource load failures (a dead <img>) have no error object — skip them.
    if (!event?.error) return;
    reportError(event.error, { kind: 'window.onerror' });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    reportError(reason instanceof Error ? reason : new Error(String(reason)), {
      kind: 'unhandledrejection',
    });
  });
}

// Test seam — lets a harness assert the dedupe and cap behaviour.
export function __resetReporterState() {
  sentCount = 0;
  seenFingerprints.clear();
}
