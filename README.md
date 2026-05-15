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
