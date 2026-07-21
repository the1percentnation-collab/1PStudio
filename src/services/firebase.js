// Firebase web SDK init: Storage uploads, Firestore, and Google auth.
//
// These values are the public Firebase web config (safe to ship in the
// client bundle). They can be overridden via REACT_APP_FIREBASE_* env vars.
import { initializeApp } from 'firebase/app';
import { getStorage } from 'firebase/storage';
import { getFirestore } from 'firebase/firestore';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || 'AIzaSyDvCEL9_4GM8GiBTtZCyG7kdOno-8yv5yU',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'onepstudio-9a3ef.firebaseapp.com',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || 'onepstudio-9a3ef',
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || 'onepstudio-9a3ef.firebasestorage.app',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '472386815897',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || '1:472386815897:web:7a1ff02d4f783cf7ef3508',
};

const app = initializeApp(firebaseConfig);
export const storage = getStorage(app);
export const db = getFirestore(app);
const auth = getAuth(app);

// Direct origin for the Cloud Functions, bypassing the Hosting /api proxy.
// Hosting kills proxied responses at 60s — too short for ffmpeg renders — and
// once the request drops, Cloud Run throttles the instance's CPU to near-zero,
// stalling the render. Direct requests stay open for the function's full
// timeout with CPU allocated the whole time.
export const FUNCTIONS_ORIGIN = `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net`;

// ---------------------------------------------------------------------------
// Auth. Sign-in is real Google (not anonymous) so each user's API keys are
// tied to a stable account and sync across devices.
//
// POPUP first, redirect only as a fallback. The app is served on
// *.web.app, but Firebase's auth handler lives on *.firebaseapp.com — a
// different domain. Modern browsers partition storage across those domains,
// so signInWithRedirect returns from Google but the result is lost and the
// user bounces back to the sign-in screen (a login loop). Popup passes the
// credential back via postMessage and works cross-domain. Redirect is kept
// for the rare environment where popups are blocked (some in-app browsers).
//
// Console prerequisite: Authentication -> Sign-in method -> enable Google.
// ---------------------------------------------------------------------------
const provider = new GoogleAuthProvider();

// Completes a pending redirect sign-in (fallback path) on the load that
// returns from Google. Ignore errors — onAuthStateChanged is the truth.
export const redirectResult = getRedirectResult(auth).catch(() => null);

const POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/cancelled-popup-request',
]);

export async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    // Popup was closed by the user — surface nothing to loop on.
    if (e?.code === 'auth/popup-closed-by-user') return;
    // Popup unavailable — fall back to redirect (navigates away).
    if (POPUP_FALLBACK_CODES.has(e?.code)) {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw e;
  }
}

export function signOutUser() {
  return signOut(auth);
}

// Subscribe to auth state. Fires immediately with the current user (or null).
// Legacy anonymous sessions (from before the app had login) are discarded so
// the sign-in gate shows — otherwise a leftover anonymous user would satisfy
// the gate and skip Google sign-in entirely. Google sign-in replaces it.
export function watchAuth(cb) {
  return onAuthStateChanged(auth, (user) => {
    if (user && user.isAnonymous) {
      signOut(auth).catch(() => {});
      cb(null);
      return;
    }
    cb(user);
  });
}

export function currentUser() {
  return auth.currentUser;
}

export function currentUid() {
  return auth.currentUser?.uid ?? null;
}

// Fresh Firebase ID token for authenticating calls to our Cloud Functions.
export async function getIdToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

// Resolves to the signed-in user. Storage/Firestore writes require auth; the
// app is gated behind sign-in, so by the time anything calls this a user
// exists. Rejects if somehow called while signed out.
export async function ensureAuth() {
  const ok = (u) => u && !u.isAnonymous;
  if (ok(auth.currentUser)) return auth.currentUser;
  await redirectResult;
  if (ok(auth.currentUser)) return auth.currentUser;
  throw new Error('You’re signed out — sign in to continue.');
}
