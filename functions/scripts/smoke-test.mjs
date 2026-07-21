// Production smoke test — runs in GitHub Actions after every deploy.
//
// Exercises the LIVE site end-to-end: hosting, the social endpoints, and the
// full burn-in render pipeline (upload a generated test video -> /api/render
// -> poll Storage for the output -> download -> verify the text was actually
// burned into the pixels). Fails loudly (nonzero exit) so a broken deploy
// turns the workflow red instead of surfacing on a real post.
//
// Requires GOOGLE_APPLICATION_CREDENTIALS (service account) for Storage access.
// Run from anywhere; imports resolve against functions/node_modules.

import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";

// The GitHub runner has no system ffmpeg — use the same bundled binaries the
// Cloud Functions use (installed by `npm ci` in functions/).
const require = createRequire(import.meta.url);
let FFMPEG = "ffmpeg";
let FFPROBE = "ffprobe";
try { FFMPEG = require("@ffmpeg-installer/ffmpeg").path; } catch { /* PATH fallback */ }
try { FFPROBE = require("@ffprobe-installer/ffprobe").path; } catch { /* PATH fallback */ }

const SITE = process.env.SMOKE_BASE_URL || "https://onepstudio-9a3ef.web.app";
const BUCKET = process.env.SMOKE_BUCKET || "onepstudio-9a3ef.firebasestorage.app";
// The app calls the function's own URL (Hosting kills proxied responses at
// 60s and Cloud Run then throttles CPU, stalling the render) — test that path.
const FUNCTIONS_ORIGIN = process.env.SMOKE_FUNCTIONS_ORIGIN || "https://us-central1-onepstudio-9a3ef.cloudfunctions.net";

const ok = (m) => console.log(`✓ ${m}`);
const fail = (m) => {
  console.error(`✗ ${m}`);
  process.exit(1);
};

initializeApp({ storageBucket: BUCKET });
const bucket = getStorage().bucket();

const cleanup = [];
async function main() {
  // 1) Hosting serves the app.
  let res = await fetch(`${SITE}/`);
  if (!res.ok) fail(`hosting GET / -> ${res.status}`);
  ok("hosting serves the app");

  // 2) Social endpoints respond with their expected shapes.
  res = await fetch(`${SITE}/api/accounts`);
  const acc = await res.json().catch(() => null);
  if (!res.ok || !acc || !("configured" in acc)) fail(`/api/accounts bad response (${res.status})`);
  ok(`/api/accounts ok (configured=${acc.configured}, connected=${(acc.connected || []).length})`);

  res = await fetch(`${SITE}/api/history`);
  const hist = await res.json().catch(() => null);
  if (!res.ok || !hist || !Array.isArray(hist.posts)) fail(`/api/history bad response (${res.status})`);
  ok(`/api/history ok (${hist.posts.length} posts)`);

  // 3) Full burn-in render pipeline on a generated black test video —
  //    any bright pixels in the output prove the overlay text was burned in.
  execFileSync(FFMPEG, [
    "-y", "-v", "error",
    "-f", "lavfi", "-i", "color=black:size=1080x1920:duration=5:rate=30",
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
    "-shortest", "-c:v", "libx264", "-preset", "veryfast",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "smoke-in.mp4",
  ]);
  const srcToken = randomUUID();
  const srcPath = `smoke/${Date.now()}-in.mp4`;
  await bucket.upload("smoke-in.mp4", {
    destination: srcPath,
    resumable: false,
    metadata: { contentType: "video/mp4", metadata: { firebaseStorageDownloadTokens: srcToken } },
  });
  cleanup.push(srcPath);
  const srcUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(srcPath)}?alt=media&token=${srcToken}`;
  ok("uploaded test video");

  const jobId = randomUUID();
  cleanup.push(`rendered/${jobId}.mp4`);
  const spec = {
    texts: [
      {
        text: "SMOKE TEST OVERLAY",
        x: 0.5,
        y: 0.2,
        size: 0.06,
        color: "#FFFFFF",
        outline: { color: "#000000", width: 0.12 },
        weight: 700,
        start: 0,
        end: null,
      },
    ],
    captions: {
      enabled: true,
      size: 0.05,
      y: 0.75,
      lines: [{ text: "smoke caption", start: 0.2, end: 4.8 }],
    },
  };

  res = await fetch(`${FUNCTIONS_ORIGIN}/renderOverlays`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoUrl: srcUrl, spec, jobId }),
  }).catch(() => null);
  if (res && !res.ok) fail(`direct render URL failed (${res.status}) — the app depends on this path`);
  if (res) ok("direct function URL reachable");
  if (!res) {
    // Direct URL unreachable — exercise the app's Hosting fallback instead.
    res = await fetch(`${SITE}/api/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl: srcUrl, spec, jobId }),
    }).catch(() => null);
  }

  let downloaded = false;
  if (res && res.ok) {
    const d = await res.json().catch(() => ({}));
    if (d.rendered && d.videoUrl) {
      const r2 = await fetch(d.videoUrl);
      if (!r2.ok) fail(`rendered url not downloadable (${r2.status})`);
      fs.writeFileSync("smoke-out.mp4", Buffer.from(await r2.arrayBuffer()));
      downloaded = true;
      ok("render responded within the request window");
    } else if (d.rendered === false) {
      fail("render returned rendered=false for a spec with text — overlay spec not honored");
    }
  }

  if (!downloaded) {
    // Response died or 5xx'd (expected for long renders) — poll like the app does.
    ok("render response did not complete in-band; polling Storage for the output");
    const outFile = bucket.file(`rendered/${jobId}.mp4`);
    const deadline = Date.now() + 4 * 60 * 1000;
    let found = false;
    while (Date.now() < deadline) {
      const [exists] = await outFile.exists();
      if (exists) {
        found = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (!found) fail("render output never appeared in Storage (rendered/<jobId>.mp4)");
    await outFile.download({ destination: "smoke-out.mp4" });
    ok("render output appeared via polling");
  }

  // 4) Verify the output: valid h264 at source dimensions, and bright pixels
  //    (YMAX) on the black source prove the text is really in the frames.
  const probe = JSON.parse(
    execFileSync(FFPROBE, ["-v", "quiet", "-print_format", "json", "-show_streams", "smoke-out.mp4"]).toString()
  );
  const v = (probe.streams || []).find((s) => s.codec_type === "video");
  if (!v || v.codec_name !== "h264") fail(`output codec ${v?.codec_name} (expected h264)`);
  if (v.width !== 1080 || v.height !== 1920) fail(`unexpected dimensions ${v?.width}x${v?.height}`);

  const stats = spawnSync(
    FFMPEG,
    ["-i", "smoke-out.mp4", "-vf", "select=eq(n\\,60),signalstats,metadata=print", "-f", "null", "-"],
    { encoding: "utf8" }
  );
  const m = `${stats.stderr}${stats.stdout}`.match(/signalstats\.YMAX=(\d+)/);
  const ymax = m ? Number(m[1]) : -1;
  if (ymax < 200) fail(`no burned-in text detected (YMAX=${ymax}, expected >200 on black source)`);
  ok(`burned-in text verified in output pixels (YMAX=${ymax})`);

  // 5) Server-side publish worker: create a real publishJobs doc and confirm
  //    the Firestore-triggered worker picks it up and updates its status.
  //    The spec deliberately has NOTHING to draw, so the worker fails the job
  //    fast ("produced no burned-in text") BEFORE reaching Zernio — this
  //    exercises trigger → worker → doc updates without posting anything.
  const db = getFirestore();
  const jobRef = db.collection("publishJobs").doc(`smoke-${randomUUID()}`);
  await jobRef.set({
    status: "queued",
    mediaUrl: srcUrl,
    post: "smoke test — never published",
    title: "smoke",
    platforms: ["tiktok"],
    scheduleDate: null,
    mediaType: "video",
    filename: "smoke.mp4",
    burnIn: true,
    spec: { texts: [], captions: { enabled: false, lines: [] } },
    createdAt: new Date(),
  });
  const jobDeadline = Date.now() + 3 * 60 * 1000;
  let jobStatus = "queued";
  while (Date.now() < jobDeadline) {
    const snap = await jobRef.get();
    jobStatus = snap.get("status");
    if (jobStatus && jobStatus !== "queued" && jobStatus !== "rendering") break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  await jobRef.delete().catch(() => undefined);
  if (jobStatus === "queued") fail("publish worker never picked up the job — Firestore trigger not firing");
  if (jobStatus !== "failed") fail(`publish worker ended in unexpected status "${jobStatus}" (expected controlled failure)`);
  ok("publish worker picked up the job and updated its status");

  console.log("\nAll smoke checks passed.");
}

main()
  .catch((e) => fail(e?.message || String(e)))
  .finally(async () => {
    await Promise.all(cleanup.map((p) => bucket.file(p).delete().catch(() => undefined)));
  });
