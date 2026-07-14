# 1P Studio

TikTok content generator for The One Percent Nation brand, powered by Claude AI.

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

## Posting to Social Media (TikTok, IG Reels, YouTube Shorts, Facebook, X, LinkedIn)

1P Studio can publish a video + its Claude-generated caption straight to your
social accounts using [Zernio](https://zernio.com/) — one API that fans
a single post out to every connected platform, so you don't have to build or get
app-review for each network individually. (Zernio replaced Ayrshare because it
supports video on every plan; Ayrshare gated video behind a paid plan.)

### One-time setup

1. **Create a Zernio account** at https://zernio.com/ and connect your
   social accounts (TikTok, Instagram, YouTube, Facebook, X, LinkedIn) from its
   dashboard. Instagram/Facebook require a Business/Creator account; TikTok and
   YouTube use their own OAuth — all handled inside Zernio, not here. The first
   two connected accounts are free.
2. **Create your Zernio API key** (Dashboard → API keys).
3. **Give it to the backend.** The key lives only on the server (the
   `publishPost` Cloud Function), never in the browser. It's stored as a Secret
   Manager secret:
   ```bash
   firebase functions:secrets:set ZERNIO_API_KEY --project onepstudio-9a3ef
   ```
   The `publishPost` and `accountsStatus` functions bind this secret in code, so
   both manual and CI deploys pick it up automatically.
4. **Enable Anonymous sign-in** in the Firebase console
   (Authentication → Sign-in method → Anonymous). Videos upload directly from
   the browser to Firebase Storage, and the Storage rules require an
   authenticated request — anonymous auth satisfies this with no login UI.

### How to post

1. Upload a video and let Claude generate the content
2. On the generated card, click **Post to Social**
3. Tap the platform chips you want, tweak the caption/title, and click **Post Now**
4. The video uploads straight from your browser to Firebase Storage (with a live
   progress bar), then Zernio pulls that URL and posts to every selected platform

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
- Anthropic Claude API (`claude-opus-4-5`)
- Firebase Hosting
- Pure CSS-in-JS inline styles (no UI library dependencies)
