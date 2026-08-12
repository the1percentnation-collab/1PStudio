// Error watch — the machine half of automated diagnosis.
//
// Claude cannot see production: the site is behind an egress proxy that blocks
// it, and a Claude session holds no service-account credential, so it can read
// neither Firestore nor Cloud Logging. This script runs in GitHub Actions,
// which has both, and converts what it finds into GitHub issues — the one
// artifact a diagnosing session CAN read. Actions does the looking; the GitHub
// API carries the news.
//
// It reports three things:
//   1. New client errors     (clientErrors, status == 'new')
//   2. Failed publish jobs   (publishJobs, status == 'failed', last 24h)
//   3. STUCK publish jobs    (queued/rendering older than 20 min) — invisible
//      today: nothing scans for them, and the client's onSnapshot error handler
//      is deliberately empty, so a stuck job looks exactly like a slow one.
//
// Exits nonzero when anything new was filed, so the run goes red and GitHub's
// default failure email fires as a second signal.
//
// Requires GOOGLE_APPLICATION_CREDENTIALS and the `gh` CLI (present on all
// GitHub-hosted runners). Run from anywhere; imports resolve against
// functions/node_modules.

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { execFileSync } from "node:child_process";

const REPO = process.env.GITHUB_REPOSITORY || "the1percentnation-collab/1PStudio";
const STUCK_AFTER_MS = 20 * 60 * 1000; // worker's own ceiling is 540s — 2x headroom
const FAILED_WINDOW_MS = 24 * 60 * 60 * 1000;
const LABEL = "auto-error";

initializeApp();
const db = getFirestore();

// This repo is PUBLIC, so an issue body is world-readable. Never put a user
// identifier in one: ownerUid stays in Firestore, and only the technical
// detail needed to diagnose goes into the issue.
function gh(args, input) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    input,
    env: { ...process.env, GH_REPO: REPO },
  }).trim();
}

function issueExists(marker) {
  try {
    const out = gh([
      "issue", "list", "--repo", REPO, "--state", "all", "--limit", "100",
      "--search", marker, "--json", "number,title",
    ]);
    const items = JSON.parse(out || "[]");
    return items.some((i) => String(i.title).includes(marker));
  } catch {
    // A search failure must not cause a duplicate flood — assume it exists.
    return true;
  }
}

function fileIssue(title, body) {
  try {
    gh(["issue", "create", "--repo", REPO, "--title", title, "--label", LABEL, "--body-file", "-"], body);
    console.log(`filed: ${title}`);
    return true;
  } catch (e) {
    console.log(`::warning::could not file issue "${title}": ${e.message}`);
    return false;
  }
}

async function ensureLabel() {
  try {
    gh(["label", "create", LABEL, "--repo", REPO, "--color", "B60205",
      "--description", "Filed automatically by error-watch", "--force"]);
  } catch {
    /* label already exists, or no permission — issue creation still works */
  }
}

const findings = [];

// ---------------------------------------------------------------------------
// 1. New client errors
// ---------------------------------------------------------------------------
async function checkClientErrors() {
  // Single-field equality is auto-indexed — deliberately no composite index,
  // because indexes here are deployed by hand.
  const snap = await db.collection("clientErrors").where("status", "==", "new").limit(50).get();
  for (const doc of snap.docs) {
    const d = doc.data();
    const marker = `[${d.fingerprint || doc.id}]`;
    const title = `[auto] client error ${marker} ${String(d.message || "").slice(0, 80)}`;

    if (!issueExists(marker)) {
      const body = [
        `**Fingerprint:** \`${doc.id}\``,
        `**Kind:** ${d.kind || "unknown"}`,
        `**Seen:** ${d.count || 1}×`,
        `**Path:** ${d.path || "?"}`,
        `**Built from commit:** ${d.appVersion || "unknown"}`,
        `**Browser:** ${d.userAgent || "?"}`,
        "",
        "**Message**",
        "```",
        d.message || "",
        "```",
        d.stack ? ["**Stack**", "```", d.stack, "```"].join("\n") : "",
        d.component ? ["**Component stack**", "```", d.component, "```"].join("\n") : "",
        d.context ? `**Context:** \`${d.context}\`` : "",
        "",
        "_Filed automatically by error-watch. Secrets are scrubbed before storage._",
      ].filter(Boolean).join("\n");
      fileIssue(title, body);
    }

    // Advance the watermark either way: if the issue already exists, this
    // error is already known and must not be re-reported next run.
    await doc.ref.set({ status: "triaging" }, { merge: true });
    findings.push(title);
  }
}

// ---------------------------------------------------------------------------
// 2 + 3. Failed and stuck publish jobs
// ---------------------------------------------------------------------------
async function checkPublishJobs() {
  // Filtered in JS rather than the query: a status-in + timestamp query needs a
  // composite index, and this repo deploys indexes manually.
  const snap = await db.collection("publishJobs").orderBy("createdAt", "desc").limit(200).get();
  const now = Date.now();

  for (const doc of snap.docs) {
    const d = doc.data();
    const createdAt = d.createdAt?.toMillis?.() ?? 0;
    const updatedAt = d.updatedAt?.toMillis?.() ?? createdAt;
    const age = now - (updatedAt || now);
    const isStuck = ["queued", "rendering", "publishing"].includes(d.status) && age > STUCK_AFTER_MS;
    const isFailed = d.status === "failed" && now - createdAt < FAILED_WINDOW_MS;
    if (!isStuck && !isFailed) continue;

    // The smoke test writes a synthetic job that is DESIGNED to fail — that's
    // a passing test, not an incident.
    if (d.ownerUid === "smoke") continue;

    const marker = `[job:${doc.id}]`;
    const title = isStuck
      ? `[auto] publish job stuck in ${d.status} ${marker}`
      : `[auto] publish job failed ${marker}`;

    if (!issueExists(marker)) {
      const body = [
        `**Job:** \`${doc.id}\``,
        `**Status:** ${d.status}`,
        `**Age since last update:** ${Math.round(age / 60000)} min`,
        `**Platforms:** ${(d.platforms || []).join(", ") || "?"}`,
        `**Media type:** ${d.mediaType || "?"} · **burn-in:** ${d.burnIn ? "yes" : "no"}`,
        d.error ? ["", "**Error**", "```", String(d.error).slice(0, 2000), "```"].join("\n") : "",
        "",
        isStuck
          ? "_Stuck: publishJobWorker is a Firestore trigger with no retry, so an OOM or timeout mid-render strands the doc and the app shows POSTING… forever._"
          : "_Filed automatically by error-watch._",
      ].filter(Boolean).join("\n");
      fileIssue(title, body);
      findings.push(title);
    }
  }
}

async function main() {
  await ensureLabel();
  await checkClientErrors();
  await checkPublishJobs();

  if (findings.length === 0) {
    console.log("No new errors. Nothing to report.");
    return;
  }
  console.log(`::error::${findings.length} new error report(s) filed — see the auto-error issues`);
  for (const f of findings) console.log(` - ${f}`);
  process.exitCode = 1;
}

main().catch((e) => {
  console.log(`::error::error-watch itself failed: ${e?.message || e}`);
  process.exitCode = 1;
});
