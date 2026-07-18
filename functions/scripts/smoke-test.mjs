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
import { execSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";

const SITE = process.env.SMOKE_BASE_URL || "https://onepstudio-9a3ef.web.app";
const BUCKET = process.env.SMOKE_BUCKET || "onepstudio-9a3ef.firebasestorage.app";

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
  execSync(
    "ffmpeg -y -v error -f lavfi -i color=black:size=1080x1920:duration=5:rate=30 " +
      "-f lavfi -i anullsrc=r=48000:cl=mono -shortest -c:v libx264 -preset veryfast " +
      "-pix_fmt yuv420p -c:a aac smoke-in.mp4"
  );
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

  res = await fetch(`${SITE}/api/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoUrl: srcUrl, spec, jobId }),
  }).catch(() => null);

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
    execSync("ffprobe -v quiet -print_format json -show_streams smoke-out.mp4").toString()
  );
  const v = (probe.streams || []).find((s) => s.codec_type === "video");
  if (!v || v.codec_name !== "h264") fail(`output codec ${v?.codec_name} (expected h264)`);
  if (v.width !== 1080 || v.height !== 1920) fail(`unexpected dimensions ${v?.width}x${v?.height}`);

  const stats = spawnSync(
    "ffmpeg",
    ["-i", "smoke-out.mp4", "-vf", "select=eq(n\\,60),signalstats,metadata=print", "-f", "null", "-"],
    { encoding: "utf8" }
  );
  const m = `${stats.stderr}${stats.stdout}`.match(/signalstats\.YMAX=(\d+)/);
  const ymax = m ? Number(m[1]) : -1;
  if (ymax < 200) fail(`no burned-in text detected (YMAX=${ymax}, expected >200 on black source)`);
  ok(`burned-in text verified in output pixels (YMAX=${ymax})`);

  console.log("\nAll smoke checks passed.");
}

main()
  .catch((e) => fail(e?.message || String(e)))
  .finally(async () => {
    await Promise.all(cleanup.map((p) => bucket.file(p).delete().catch(() => undefined)));
  });
