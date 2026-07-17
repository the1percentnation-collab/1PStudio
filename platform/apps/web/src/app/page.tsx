"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

export default function NewVideoPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [clipCount, setClipCount] = useState(5);
  const [lengthBucket, setLengthBucket] = useState("30-60s");
  const [removeFillers, setRemoveFillers] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = { clipCount, lengthBucket, removeFillers, resolution: "R1080" };

  async function startFromUrl() {
    setBusy("Starting pipeline…");
    setError(null);
    try {
      const { projectId } = await api.startVideo({ url, title: url, options });
      router.push(`/projects/${projectId}`);
    } catch (err) {
      setError(String(err));
      setBusy(null);
    }
  }

  async function startFromFile(file: File) {
    setError(null);
    try {
      setBusy("Requesting upload slot…");
      const { uploadKey, url: putUrl } = await api.presignUpload(file.name, file.type || "video/mp4");
      setBusy("Uploading…");
      const put = await fetch(putUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type || "video/mp4" } });
      if (!put.ok) throw new Error(`upload failed (${put.status})`);
      setBusy("Starting pipeline…");
      const { projectId } = await api.startVideo({ uploadKey, title: file.name, options });
      router.push(`/projects/${projectId}`);
    } catch (err) {
      setError(String(err));
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-3xl font-black">1 long video, ranked viral clips.</h1>
      <p className="mb-8 text-zinc-400">
        Paste a link or drop a file. The pipeline transcribes, finds the best moments, reframes to 9:16,
        captions, brands, and renders.
      </p>

      <div className="space-y-6 rounded-xl border border-edge bg-panel p-6">
        <div>
          <label className="mb-1 block text-sm text-zinc-400">YouTube / video URL</label>
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              className="flex-1 rounded-lg border border-edge bg-ink px-3 py-2 outline-none focus:border-gold"
            />
            <button
              onClick={startFromUrl}
              disabled={!url || !!busy}
              className="rounded-lg bg-gold px-4 py-2 font-semibold text-ink disabled:opacity-40"
            >
              Clip it
            </button>
          </div>
        </div>

        <div className="relative rounded-lg border-2 border-dashed border-edge p-8 text-center text-zinc-400">
          <input
            type="file"
            accept="video/*"
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(e) => e.target.files?.[0] && startFromFile(e.target.files[0])}
          />
          Drop a video file here or click to browse
        </div>

        <div className="flex flex-wrap items-center gap-6 text-sm">
          <label className="flex items-center gap-2">
            Clips
            <input
              type="number" min={1} max={10} value={clipCount}
              onChange={(e) => setClipCount(Number(e.target.value))}
              className="w-16 rounded border border-edge bg-ink px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2">
            Length
            <select
              value={lengthBucket}
              onChange={(e) => setLengthBucket(e.target.value)}
              className="rounded border border-edge bg-ink px-2 py-1"
            >
              <option>0-30s</option><option>30-60s</option><option>1-3m</option><option>3-5m</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={removeFillers} onChange={(e) => setRemoveFillers(e.target.checked)} />
            Remove fillers &amp; dead air
          </label>
        </div>

        {busy && <p className="text-sm text-gold">{busy}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
