// Server-side publishing. The browser's only job is the initial upload: after
// that a publishJobs/{jobId} Firestore doc is created and the publishJobWorker
// Cloud Function runs the whole pipeline (burn-in render → Zernio publish),
// recording each state change on the doc. Closing the tab after the upload no
// longer kills the post — any later session can watch the doc and see the
// outcome.
//
// Job doc statuses: 'queued' → 'rendering' → 'publishing' →
//                   'published' | 'scheduled' | 'failed'
import { collection, doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, ensureAuth, currentUid } from './firebase';
import { uploadVideo } from './socialService';

export const TERMINAL_JOB_STATES = ['published', 'scheduled', 'failed'];

// Uploads the media, creates the job, and returns its id. Rejects on
// validation problems or if the upload/job-create itself fails — after it
// resolves, the publish is the server's responsibility.
export async function startPublishJob(mediaFile, { post, title, platforms, scheduleDate, mediaType, filename, spec, burnIn, onProgress }) {
  if (!mediaFile) {
    throw new Error('No media file is attached to this card — regenerate it from an upload to enable posting.');
  }
  if (!platforms || platforms.length === 0) {
    throw new Error('Select at least one platform to post to.');
  }
  if (!post || !post.trim()) {
    throw new Error('Caption is required to publish.');
  }

  await ensureAuth();
  const mediaUrl = await uploadVideo(mediaFile, onProgress);

  const willBurn = Boolean(burnIn && spec && mediaType !== 'photo');
  const jobRef = doc(collection(db, 'publishJobs'));
  await setDoc(jobRef, {
    status: 'queued',
    // The worker resolves this user's Zernio key from userConfig/{ownerUid};
    // owner-scoped Firestore rules also require it on create. The key itself
    // never touches the job doc.
    ownerUid: currentUid(),
    mediaUrl,
    post,
    title: title || '',
    platforms,
    scheduleDate: scheduleDate || null,
    mediaType: mediaType || 'video',
    filename: filename || '',
    burnIn: willBurn,
    spec: willBurn ? spec : null,
    createdAt: serverTimestamp(),
  });
  return jobRef.id;
}

// Live-watches a job. onChange receives { status, error, ayrshareId,
// scheduleDate, publishedPlatforms, pendingPlatforms, skippedPlatforms,
// failedPlatforms, partial } on every server update. Returns the unsubscribe
// function.
export function watchPublishJob(jobId, onChange) {
  return onSnapshot(
    doc(db, 'publishJobs', jobId),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      onChange({
        status: d.status || 'queued',
        error: d.error || null,
        ayrshareId: d.ayrshareId ?? null,
        scheduleDate: d.scheduleDate || null,
        // What actually went out, as opposed to what was requested. A publish
        // can end terminal-and-successful while one platform was skipped (not
        // connected) or rejected — these carry that so the badge can say so.
        publishedPlatforms: d.publishedPlatforms || [],
        pendingPlatforms: d.pendingPlatforms || [],
        skippedPlatforms: d.skippedPlatforms || [],
        failedPlatforms: d.failedPlatforms || [],
        partial: Boolean(d.partial),
      });
    },
    () => {
      // Watch errors (offline, permissions) are transient here — the library
      // badge stays "POSTING…" and a reload re-subscribes.
    }
  );
}
