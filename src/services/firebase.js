// Firebase web SDK init for direct browser -> Storage uploads.
//
// These values are the public Firebase web config (safe to ship in the
// client bundle). They can be overridden via REACT_APP_FIREBASE_* env vars.
import { initializeApp } from 'firebase/app';
import { getStorage } from 'firebase/storage';
import { getAuth, signInAnonymously } from 'firebase/auth';

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
const auth = getAuth(app);

// Direct origin for the Cloud Functions, bypassing the Hosting /api proxy.
// Hosting kills proxied responses at 60s — too short for ffmpeg renders — and
// once the request drops, Cloud Run throttles the instance's CPU to near-zero,
// stalling the render. Direct requests stay open for the function's full
// timeout with CPU allocated the whole time.
export const FUNCTIONS_ORIGIN = `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net`;

// Storage rules require an authenticated request. Anonymous auth satisfies
// that without any login UI. (Enable Anonymous sign-in in the Firebase
// console: Authentication -> Sign-in method -> Anonymous.)
let authPromise = null;
export function ensureAuth() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (!authPromise) {
    authPromise = signInAnonymously(auth).then(({ user }) => user);
  }
  return authPromise;
}
