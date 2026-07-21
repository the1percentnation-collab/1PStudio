// Per-user API keys, stored at userConfig/{uid} in Firestore so they sync
// across a user's devices. Firestore rules scope the doc to its owner, so no
// other signed-in user can read it. The Cloud Functions read the same doc
// (via the Admin SDK) to use the caller's keys.
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, currentUid, getIdToken } from './firebase';

export const KEY_FIELDS = ['zernioApiKey', 'zernioProfileId', 'deepgramApiKey', 'anthropicApiKey'];

function requireUid() {
  const uid = currentUid();
  if (!uid) throw new Error('Sign in to manage your API keys.');
  return uid;
}

// Persist the user's keys (merge, so blank fields overwrite intentionally).
export async function saveUserKeys(values) {
  const uid = requireUid();
  const payload = { updatedAt: serverTimestamp() };
  for (const f of KEY_FIELDS) payload[f] = (values[f] ?? '').trim();
  await setDoc(doc(db, 'userConfig', uid), payload, { merge: true });
}

// One-shot read of the current user's saved keys (returns {} if none).
export async function loadUserKeys() {
  const uid = currentUid();
  if (!uid) return {};
  try {
    const snap = await getDoc(doc(db, 'userConfig', uid));
    return snap.exists() ? snap.data() : {};
  } catch {
    return {};
  }
}

// Live-watch the user's keys. onChange receives the field object. Returns an
// unsubscribe function (no-op if signed out).
export function watchUserKeys(onChange) {
  const uid = currentUid();
  if (!uid) return () => {};
  return onSnapshot(
    doc(db, 'userConfig', uid),
    (snap) => onChange(snap.exists() ? snap.data() : {}),
    () => {}
  );
}

// Authorization header carrying the Firebase ID token, so Cloud Functions can
// identify the caller and load their keys. Returns {} when signed out.
export async function authHeaders() {
  const token = await getIdToken().catch(() => null);
  return token ? { Authorization: `Bearer ${token}` } : {};
}
