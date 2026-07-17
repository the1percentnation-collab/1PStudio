"use client";

import { useState } from "react";
import { api } from "@/lib/api";

const FIELDS = [
  "best_title", "headline", "on_screen_text", "thumbnail_text", "niche", "seo_opener",
  "caption", "video_description", "hashtags", "content_pillar", "transcript_summary",
];

/**
 * Standalone brand-voice metadata generator (the 1P Studio prompt) over
 * POST /v1/metadata/generate. Replaces the old orphaned tiktok-generator page
 * with a live, wired version inside the platform.
 */
export default function MetadataToolPage() {
  const [filename, setFilename] = useState("");
  const [transcript, setTranscript] = useState("");
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setMeta(await api.generateRawMetadata({ filename: filename || "untitled", transcript: transcript || undefined }));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-black">Metadata generator</h1>
      <p className="mb-6 text-zinc-400">
        Brand-voice titles, captions, hashtags, and a hook score from a topic or transcript — no video required.
      </p>

      <div className="space-y-4 rounded-xl border border-edge bg-panel p-5">
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Topic / title</label>
          <input value={filename} onChange={(e) => setFilename(e.target.value)} placeholder="e.g. stop waiting for permission"
            className="w-full rounded-lg border border-edge bg-ink px-3 py-2 outline-none focus:border-gold" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Transcript <span className="text-zinc-600">(optional — improves output)</span></label>
          <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={5} placeholder="Paste a transcript…"
            className="w-full rounded-lg border border-edge bg-ink px-3 py-2 outline-none focus:border-gold" />
        </div>
        <button onClick={generate} disabled={busy} className="rounded-lg bg-gold px-4 py-2 font-semibold text-ink disabled:opacity-40">
          {busy ? "Generating…" : "Generate"}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {meta && (
        <dl className="mt-6 space-y-2 rounded-xl border border-edge bg-panel p-5 text-sm">
          {FIELDS.filter((f) => meta[f]).map((f) => (
            <div key={f} className="flex gap-2">
              <dt className="w-36 shrink-0 text-zinc-500">{f}</dt>
              <dd className="flex-1 whitespace-pre-wrap break-words">{String(meta[f])}</dd>
              <button onClick={() => navigator.clipboard.writeText(String(meta[f]))} className="self-start text-xs text-zinc-500 hover:text-gold">copy</button>
            </div>
          ))}
          {typeof meta.hook_score === "number" && (
            <div className="flex gap-2"><dt className="w-36 shrink-0 text-zinc-500">hook_score</dt><dd>{String(meta.hook_score)}/10 — {String(meta.hook_score_reason ?? "")}</dd></div>
          )}
          {Array.isArray(meta.titles) && (
            <div className="flex gap-2"><dt className="w-36 shrink-0 text-zinc-500">titles</dt><dd className="flex-1">{(meta.titles as string[]).map((t, i) => <div key={i}>• {t}</div>)}</dd></div>
          )}
        </dl>
      )}
    </div>
  );
}
