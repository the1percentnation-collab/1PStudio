# 1P Studio

TikTok content generator for The One Percent Nation brand, powered by Claude AI.

## Live URLs

- **https://the1pnation.com/studio** — branded entry point. The main site
  (deployed from the `the1pnation-site` repo, Firebase project
  `the-1p-leadership`) 301-redirects `/studio` and any deeper path to the app.
- **https://onepstudio-9a3ef.web.app** — the app itself, on Firebase Hosting in
  the `onepstudio-9a3ef` project.

The app and the main site live in different Firebase projects, and Firebase
Hosting attaches custom domains at the domain level — a path on another
project's domain can't serve this app directly (the `/api/*` function rewrites
only work on this project's own hosting). Hence the redirect. To upgrade to a
fully branded address, connect `studio.the1pnation.com` as a custom domain to
this project (Firebase console → Hosting → Add custom domain, then add the DNS
records it shows), and point the main site's `/studio` redirect there.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure API key

```bash
cp .env.example .env.local
```

Open `.env.local` and set your Anthropic API key:

```
REACT_APP_ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
```

> **Security note:** The API key is stored in memory only during your browser session. It is never persisted to localStorage, cookies, or any server. However, calling the Anthropic API directly from a browser exposes the key in network requests — use this app in a trusted environment. For production deployments, proxy API calls through a backend server.

### 3. Start local dev server

```bash
npm start
```

The app opens at `http://localhost:3000`.

## Usage

1. Enter your Anthropic API key in the header and click **Save**
2. Drag & drop up to 20 TikTok video files into the drop zone (or click to browse)
3. The app extracts a frame from each video and sends it to Claude for analysis
4. Review generated content cards — headline, SEO opener, caption, hashtags, hook score
5. Use **Copy All**, **Regenerate**, or **Remove** per card
6. Click **Export CSV** to download all results

## Recording in the app (Record tab)

The **Record** view captures video straight from your camera with a teleprompter
scrolling over the live preview — no separate recording app or prompter needed.

1. Open **Record** and allow camera/microphone access
2. Write or paste your script in the **Teleprompter** panel; tune **speed**,
   **text size**, and **dim**. **Mirror text** is there for beam-splitter rigs
3. Pick your camera, mic, and frame (9:16 / 1:1 / 16:9). Mirroring the preview
   never flips the recorded file
4. Hit **Record** — a 3-2-1 countdown runs, then the script starts scrolling
   automatically. Pause/resume mid-take; the timer excludes paused time
5. On **Stop**, review the take, then **Download**, **Retake**, or
   **Generate Content**

On a phone the take goes **fullscreen automatically** (tap **Fullscreen** to do it
by hand on desktop): the camera fills the screen with the script scrolling over
it and a floating Stop / Pause / Scroll Text / speed row, so you can watch
yourself and read at the same time. **EXIT** returns to the normal layout, as
does stopping the recording.

**Generate Content** sends the take through the same pipeline as an upload, with
your teleprompter script attached as the transcript — so Claude grades what you
actually scripted and the clip skips re-transcription.

Recording happens entirely in the browser (`MediaRecorder`), requires `https://`
or `localhost`, and auto-stops at 10 minutes since the take is held in memory.
Takes are captured as **MP4/H.264** wherever the browser can record it — iOS
Safari cannot decode WebM (a WebM take shows as a black player on iPhone) and
every social platform expects MP4. WebM is used only as a fallback.

## Posting to Social Media (TikTok, IG Reels, YouTube Shorts, Facebook, X, LinkedIn)

1P Studio can publish a video + its Claude-generated caption straight to your
social accounts using [Ayrshare](https://www.ayrshare.com/) — one API that fans
a single post out to every connected platform, so you don't have to build or get
app-review for each network individually.

### One-time setup

1. **Create an Ayrshare account** at https://app.ayrshare.com/ and connect your
   social accounts (TikTok, Instagram, YouTube, Facebook, X, LinkedIn) from its
   dashboard. Instagram/Facebook require a Business/Creator account; TikTok and
   YouTube use their own OAuth — all handled inside Ayrshare, not here.
2. **Copy your Ayrshare API key** (Dashboard → API Key).
3. **Give it to the backend.** The key lives only on the server (the
   `publishPost` Cloud Function), never in the browser:
   - **Local:** add `AYRSHARE_API_KEY=your-key` to `functions/.env`
   - **CI/CD:** add a GitHub repo secret named `AYRSHARE_API_KEY`
     (the deploy workflow already writes it into `functions/.env`)
4. **Enable Anonymous sign-in** in the Firebase console
   (Authentication → Sign-in method → Anonymous). Videos upload directly from
   the browser to Firebase Storage, and the Storage rules require an
   authenticated request — anonymous auth satisfies this with no login UI.

### How to post

1. Upload a video and let Claude generate the content
2. On the generated card, click **Post to Social**
3. Tap the platform chips you want, tweak the caption/title, and click **Post Now**
4. The video uploads straight from your browser to Firebase Storage (with a live
   progress bar), then Ayrshare pulls that URL and posts to every selected platform

> **Notes:** The video uploads directly from the browser to Storage, so there is
> **no app-imposed size cap** — long videos work, limited only by each platform's
> own ceiling (e.g. YouTube Shorts ≤ 3 min, Instagram Reels ~15 min, X 2:20 on
> the free tier). Instagram video posts publish as Reels and YouTube uses the
> Title field. Cards loaded from the Library have no attached file and can't be
> posted.

## Firebase Deployment

### Prerequisites

```bash
npm install -g firebase-tools
firebase login
```

### First-time project setup

Edit `.firebaserc` and replace `YOUR_FIREBASE_PROJECT_ID` with your actual Firebase project ID, or run:

```bash
firebase use --add
```

### Build and deploy

```bash
npm run build
firebase deploy --only hosting
```

Or use the combined script:

```bash
npm run deploy
```

## GitHub Setup

```bash
git init
git add .
git commit -m "Initial commit: 1P Studio"
git remote add origin https://github.com/YOUR_USERNAME/1p-studio.git
git branch -M main
git push -u origin main
```

## Tech Stack

- React 18 (Create React App)
- `getUserMedia` + `MediaRecorder` for in-app recording
- Anthropic Claude API (`claude-opus-4-5`)
- Firebase Hosting
- Pure CSS-in-JS inline styles (no UI library dependencies)
