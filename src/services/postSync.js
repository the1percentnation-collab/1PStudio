// Reconciles the app's locally recorded posts with Ayrshare's real history.
//
// Local records are written optimistically when a post is queued — a
// scheduled post that fails at fire time would otherwise stay "scheduled"
// in localStorage forever. Syncing adopts Ayrshare's status/errors for any
// record whose ayrshareId matches, and appends Ayrshare-only posts (made
// from other devices, or from before localStorage was cleared).
import { getPostHistory } from './socialService';

// localStorage quota guard: appended remote records carry no thumbnails, but
// cap them anyway so an unbounded history can't crowd out the library.
const MAX_REMOTE_APPENDS = 500;

// Pure merge — no fetching. localPosts: app records; remotePosts: normalized
// posts from /api/history. Returns a new array, reverse-chronological.
export function mergeHistory(localPosts, remotePosts) {
  const remoteById = new Map(
    (remotePosts || []).filter((r) => r && r.id).map((r) => [String(r.id), r])
  );

  // Remote status/errors/date are authoritative; local caption/title/
  // thumbnail/filename are kept (we wrote them, and remote has no thumbnail).
  const merged = (localPosts || []).map((p) => {
    const r = p.ayrshareId != null ? remoteById.get(String(p.ayrshareId)) : null;
    if (!r) return p;
    remoteById.delete(String(p.ayrshareId));
    return { ...p, status: r.status, errors: r.errors || [], date: r.date || p.date };
  });

  // Whatever remains in the map exists only on Ayrshare's side. Appended
  // records keep ayrshareId, so the next sync updates them in place instead
  // of re-appending.
  let appended = 0;
  for (const r of remoteById.values()) {
    if (appended >= MAX_REMOTE_APPENDS) break;
    appended += 1;
    merged.push({
      id: `ayr-${r.id}`,
      ayrshareId: r.id,
      caption: r.caption || '',
      title: '',
      platforms: r.platforms || [],
      filename: null,
      thumbnail: null,
      mediaUrls: r.mediaUrls || [],
      date: r.date || new Date().toISOString(),
      status: r.status,
      errors: r.errors || [],
      source: 'ayrshare',
    });
  }

  merged.sort((a, b) => {
    const ta = Date.parse(a.date);
    const tb = Date.parse(b.date);
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return tb - ta;
  });
  return merged;
}

// Fetch + merge. Never throws — a flaky API must never wipe local statuses.
// Returns { posts, configured, error }.
export async function syncPostHistory(localPosts) {
  try {
    const { configured, posts, error } = await getPostHistory();
    if (!configured) return { posts: localPosts, configured: false, error: null };
    if (error && (!posts || posts.length === 0)) {
      // Soft failure upstream — keep local records untouched.
      return { posts: localPosts, configured: true, error };
    }
    return { posts: mergeHistory(localPosts, posts || []), configured: true, error: error || null };
  } catch (e) {
    return { posts: localPosts, configured: null, error: e.message };
  }
}
