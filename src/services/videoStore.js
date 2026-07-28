// On-device store for editable source videos.
//
// Library metadata lives in localStorage, but the original video is far too
// large for it (and blob: URLs don't survive a reload). We keep the raw video
// blob — plus its word timings for captions — in IndexedDB, keyed by the
// library item id. Because the blob is served from a same-origin object URL,
// the editor preview AND the canvas export both work with no CORS concerns.

const DB_NAME = '1p-studio-media';
const STORE = 'videos';
const VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Persist the source video (and word timings) for a library item.
export async function putVideo(id, blob, words = []) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ blob, words }, id);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// Returns { blob, words } for a library item, or null if none is stored
// (e.g. saved on another device, or storage was cleared).
export async function getVideo(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => { db.close(); resolve(req.result || null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

// Remove a stored video (called when its library item is deleted).
export async function deleteVideo(id) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); resolve(false); };
  });
}
