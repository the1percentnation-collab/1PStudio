# 1P Studio — Test Checklist

A step-by-step guide to confirm everything works after the Ayrshare → Zernio
swap and the function restore. Work top to bottom. Each test says what to **do**
and what **passing** looks like. At the bottom there's a results block to copy,
fill in, and send back to me if anything fails.

- **Live app:** https://onepstudio-9a3ef.web.app
- **Branch under test:** `claude/build-this-fkmvrf`
- **Firebase project:** `onepstudio-9a3ef`

---

## 0. One-time prerequisites (do these first)

These aren't tests — they're the setup the app needs. Skip any you've already done.

- [ ] **Secrets are set** (Zernio + Higgsfield keys):
  ```bash
  npx firebase-tools functions:secrets:get ZERNIO_API_KEY --project onepstudio-9a3ef
  ```
  Passing = it prints a version exists (not "not found").
- [ ] **Anonymous sign-in is ON** — Firebase console → Authentication → Sign-in
  method → **Anonymous** = Enabled.
  (Needed so video uploads to Storage work. Without it, posting fails at the
  upload step.)
- [ ] **At least one social account connected in Zernio** — zernio.com/dashboard.
  Connect TikTok and/or Instagram (first two are free).
- [ ] **Latest code is deployed** — functions **and** hosting:
  ```bash
  git fetch origin && git checkout claude/build-this-fkmvrf && git reset --hard origin/claude/build-this-fkmvrf
  cd functions && npm install && npm run build && cd ..
  npm install && npm run build
  npx firebase-tools deploy --only functions,hosting --project onepstudio-9a3ef
  ```
  If it asks to **delete** `getSocialAccounts`, `generateHiggsfieldVideo`,
  `higgsfieldWebhook`, `pollHiggsfieldJobs`, `importMedia`, `getPostStatus` →
  answer **yes** (leftovers from an earlier bad deploy).
  Passing = ends with `✔ Deploy complete!`

> **Tip — how to capture an error if a test fails:** in Chrome, press
> `Cmd+Option+J` to open the Console, and click the **Network** tab. Re-do the
> failing step, then screenshot any red lines. That's what I need to diagnose.

---

## 1. App loads

- [ ] Open https://onepstudio-9a3ef.web.app
- [ ] The sidebar shows: Dashboard, Composer, Captions, Calendar, Analytics,
      Library, Accounts.

**Passing:** page loads, no blank/white screen.

---

## 2. Accounts page (this was the broken one — 404)

This is the most important check: it proves the Zernio swap and the function
restore worked.

- [ ] Click **Accounts** in the sidebar.
- [ ] Wait for it to finish "Checking…".

**Passing:**
- **No** red "Couldn't read account status: Failed to load accounts (404)" banner.
- Platforms you connected in Zernio show a green **● Connected** badge (with your
  @username under them).
- Platforms you haven't connected show grey "Not connected".

**If you see** the yellow "Posting isn't configured — add your ZERNIO_API_KEY"
banner → the secret isn't set or isn't bound. Re-check prerequisite 0.

- [ ] Click **Refresh status** — it re-checks without error.

---

## 3. Composer — generate content (Claude / analyzeVideo)

- [ ] Click **Composer**.
- [ ] Upload a short vertical video (a TikTok-style clip, ideally with speech).
- [ ] Wait for it to process.

**Passing:** a content card appears with a title, caption, hashtags, hook score,
etc. (This exercises `/api/analyze` and, if speech is present, `/api/transcribe`.)

**If it errors:** note the message shown on the card.

---

## 4. Publish to social — video, no plan error (THE key fix — Zernio)

This is what we changed Ayrshare → Zernio to fix.

- [ ] On a generated card, click **Post to Social**.
- [ ] Select **one** platform you connected in Zernio (start with just TikTok or
      Instagram to keep the test cheap).
- [ ] Make sure the caption box has text.
- [ ] Click **Post** (leave "schedule" off for now).
- [ ] Watch the upload progress bar reach 100%, then wait for the result.

**Passing:**
- Message: "Posted to 1 platform."
- **No** "Videos require a Premium or Business Plan" error (that was the old
  Ayrshare problem — it should be gone).
- Within a minute or two, the post actually appears on that social account.

**If it fails:** copy the exact red error text — it now comes straight from
Zernio and tells us the real reason (e.g. account needs reconnecting).

---

## 5. Schedule a post (Zernio scheduling)

- [ ] Post to Social again, but this time toggle **Schedule** on and pick a time
      ~5–10 minutes in the future.
- [ ] Click **Schedule**.

**Passing:** message says "Scheduled for <time> on 1 platform." Then, at that
time, the post goes live (check the platform, or the Zernio dashboard's queue).

---

## 6. Captions (Deepgram + ffmpeg — was deleted, now restored)

Only works if `DEEPGRAM_API_KEY` is set on the server.

- [ ] Click **Captions**.
- [ ] Upload a short video **with clear speech**.
- [ ] Wait for it to transcribe + render (can take up to a minute).

**Passing:** you get back a video with burned-in word-synced captions, and it
plays.

**If DEEPGRAM_API_KEY isn't set:** you'll get a clear "DEEPGRAM_API_KEY is not
configured" message — that's expected, not a bug in our changes.

---

## 7. Calendar & Library (local, should be unaffected)

- [ ] After posting/scheduling above, open **Calendar** — the post you scheduled
      shows on the right date.
- [ ] Open **Library** — generated content cards are saved and reopen.

**Passing:** both show your data. (These are stored in the browser, so they're
per-device.)

---

## 8. Analytics (informational)

- [ ] Open **Analytics** — charts render from your posting/content data.

**Passing:** page renders without crashing. (Live engagement metrics are a future
integration; placeholder/derived charts are expected.)

---

## What changed in this round (so you know what you're really testing)

| Area | Before | Now |
|------|--------|-----|
| `/api/publish` | Ayrshare (video gated behind paid plan) | **Zernio** (video on all plans) |
| `/api/accounts` | Ayrshare user status | **Zernio** connected accounts |
| `captionVideo`, `transcribeAudio` | accidentally deleted by an earlier deploy | **restored** |
| `analyzeVideo` | Claude content gen | unchanged |
| Accounts page copy / dashboard link | "Ayrshare" | "Zernio" |

**Not included yet:** Higgsfield AI-video generation/import. That's a separate
follow-up — tell me if you want it after this passes.

---

## Results — copy this, fill it in, send it back to me

```
0. Prereqs (secrets set / anon auth on / zernio connected / deployed):  ___
1. App loads:            PASS / FAIL — notes:
2. Accounts (no 404):    PASS / FAIL — notes:
3. Composer generate:    PASS / FAIL — notes:
4. Post video (no plan error):  PASS / FAIL — exact error if any:
5. Schedule post:        PASS / FAIL — notes:
6. Captions:             PASS / FAIL / SKIPPED (no Deepgram key) — notes:
7. Calendar & Library:   PASS / FAIL — notes:
8. Analytics:            PASS / FAIL — notes:

Any red errors from the Chrome Console / Network tab (paste here):
```
