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
// tied to a stable account and sync across devices. Redirect flow (not popup)
// because popups are unreliable in iOS Safari, the primary client.
// Console prerequisite: Authentication -> Sign-in method -> enable Google.
// ---------------------------------------------------------------------------
const provider = new GoogleAuthProvider();

// Completes a pending redirect sign-in on the load that returns from Google.
// Safe to ignore errors here — onAuthStateChanged is the source of truth.
export const redirectResult = getRedirectResult(auth).catch(() => null);

export function signInWithGoogle() {
  return signInWithRedirect(auth, provider);
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
