// App-level admin. The owner account gets an ADMIN badge and an admin-only
// "recent publish activity" view in Settings. The app stays open to everyone
// else — non-admins simply don't see admin surfaces, and the admin endpoint
// verifies the caller server-side (client checks are cosmetic only).
//
// Keep this list in sync with ADMIN_EMAILS in functions/src/index.ts.
import { FUNCTIONS_ORIGIN, currentUser } from './firebase';
import { authHeaders } from './userKeys';

export const ADMIN_EMAILS = ['the1percentnation@gmail.com'];

export function isAdmin() {
  const email = (currentUser()?.email || '').toLowerCase();
  return ADMIN_EMAILS.includes(email);
}

// Recent publish jobs across all users (admin-only, verified server-side).
export async function fetchAdminJobs() {
  const res = await fetch(`${FUNCTIONS_ORIGIN}/adminRecentJobs`, {
    headers: await authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Failed to load activity (${res.status})`);
  return Array.isArray(data.jobs) ? data.jobs : [];
}
