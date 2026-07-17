"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type BrandTemplate } from "@/lib/api";

const ASPECTS = ["9:16", "1:1", "16:9"] as const;
const RESOLUTIONS = [
  { id: "R720", label: "720p" },
  { id: "R1080", label: "1080p" },
  { id: "R4K", label: "4K" },
] as const;
const LENGTHS = ["0-30s", "30-60s", "1-3m", "3-5m"] as const;

export default function NewVideoPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<BrandTemplate[]>([]);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [advanced, setAdvanced] = useState(false);

  // full PipelineOptions
  const [clipCount, setClipCount] = useState(5);
  const [lengthBucket, setLengthBucket] = useState<string>("30-60s");
  const [removeFillers, setRemoveFillers] = useState(true);
  const [aspect, setAspect] = useState<string>("9:16");
  const [resolution, setResolution] = useState<string>("R1080");
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState("");
  const [watermark, setWatermark] = useState(false);
  const [brandTemplateId, setBrandTemplateId] = useState<string>("");
  const [useWindow, setUseWindow] = useState(false);
  const [winStart, setWinStart] = useState(0);
  const [winEnd, setWinEnd] = useState(0);
  const [estDurationMin, setEstDurationMin] = useState(10);

  useEffect(() => {
    api.brandTemplates().then((d) => {
      setTemplates(d.templates);
      const def = d.templates.find((t) => t.isDefault) ?? d.templates[0];
      if (def) setBrandTemplateId(def.id);
    }).catch(() => undefined);
  }, []);

  // live credit estimate (ROI preview) as options change
  useEffect(() => {
    const t = setTimeout(() => {
      api.estimate(estDurationMin * 60, clipCount, resolution).then((d) => setEstimate(d.estimate)).catch(() => setEstimate(null));
    }, 250);
    return () => clearTimeout(t);
  }, [clipCount, resolution, estDurationMin]);

  function buildOptions() {
    return {
      clipCount,
      lengthBucket,
      removeFillers,
      aspectRatios: [aspect],
      resolution,
      watermark,
      ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
      ...(language.trim() ? { language: language.trim() } : {}),
      ...(brandTemplateId ? { brandTemplateId } : {}),
      ...(useWindow && winEnd > winStart ? { clipWindow: { startSec: winStart, endSec: winEnd } } : {}),
    };
  }

  async function startFromUrl() {
    setBusy("Starting pipeline…");
    setError(null);
    try {
      const { projectId } = await api.startVideo({
        url,
        title: url,
        options: buildOptions(),
        estimatedDurationSec: estDurationMin * 60,
      });
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
      const { projectId } = await api.startVideo({
        uploadKey,
        title: file.name,
        options: buildOptions(),
        estimatedDurationSec: estDurationMin * 60,
      });
      router.push(`/projects/${projectId}`);
    } catch (err) {
      setError(String(err));
      setBusy(null);
    }
  }

  const fieldCls = "rounded border border-edge bg-ink px-2 py-1";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-3xl font-black">1 long video, ranked viral clips.</h1>
      <p className="mb-8 text-zinc-400">
        Paste a link or drop a file. The pipeline transcribes, finds the best moments, reframes, captions, brands, and renders.
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
            <button onClick={startFromUrl} disabled={!url || !!busy} className="rounded-lg bg-gold px-4 py-2 font-semibold text-ink disabled:opacity-40">
              Clip it
            </button>
          </div>
        </div>

        <div className="relative rounded-lg border-2 border-dashed border-edge p-8 text-center text-zinc-400">
          <input type="file" accept="video/*" className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(e) => e.target.files?.[0] && startFromFile(e.target.files[0])} />
          Drop a video file here or click to browse
        </div>

        {/* Core options */}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">Clips
            <input type="number" min={1} max={10} value={clipCount} onChange={(e) => setClipCount(Number(e.target.value))} className={`w-16 ${fieldCls}`} />
          </label>
          <label className="flex items-center gap-2">Length
            <select value={lengthBucket} onChange={(e) => setLengthBucket(e.target.value)} className={fieldCls}>
              {LENGTHS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">Aspect
            <select value={aspect} onChange={(e) => setAspect(e.target.value)} className={fieldCls}>
              {ASPECTS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">Quality
            <select value={resolution} onChange={(e) => setResolution(e.target.value)} className={fieldCls}>
              {RESOLUTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
        </div>

        {/* Prompt-to-clip */}
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Prompt-to-clip <span className="text-zinc-600">(optional — natural-language guidance)</span></label>
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder='e.g. "every moment about discipline or excuses"'
            className="w-full rounded-lg border border-edge bg-ink px-3 py-2 outline-none focus:border-gold" />
        </div>

        <button onClick={() => setAdvanced((v) => !v)} className="text-sm text-zinc-400 hover:text-zinc-100">
          {advanced ? "▾" : "▸"} Advanced options
        </button>
        {advanced && (
          <div className="space-y-4 rounded-lg border border-edge bg-ink/40 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2"><input type="checkbox" checked={removeFillers} onChange={(e) => setRemoveFillers(e.target.checked)} /> Remove fillers &amp; dead air</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} /> Watermark</label>
              <label className="flex items-center gap-2">Caption language
                <input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="auto" className={`w-20 ${fieldCls}`} />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2">Brand template
                <select value={brandTemplateId} onChange={(e) => setBrandTemplateId(e.target.value)} className={fieldCls}>
                  <option value="">none</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (default)" : ""}</option>)}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2"><input type="checkbox" checked={useWindow} onChange={(e) => setUseWindow(e.target.checked)} /> Only clip a time window</label>
              {useWindow && (
                <>
                  <label className="flex items-center gap-2">from (s)<input type="number" value={winStart} onChange={(e) => setWinStart(Number(e.target.value))} className={`w-20 ${fieldCls}`} /></label>
                  <label className="flex items-center gap-2">to (s)<input type="number" value={winEnd} onChange={(e) => setWinEnd(Number(e.target.value))} className={`w-20 ${fieldCls}`} /></label>
                </>
              )}
            </div>
          </div>
        )}

        {/* Live credit estimate / ROI preview */}
        <div className="flex items-center justify-between rounded-lg border border-edge bg-ink/40 px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">Est. cost for a</span>
            <input type="number" min={1} value={estDurationMin} onChange={(e) => setEstDurationMin(Number(e.target.value))} className={`w-16 ${fieldCls}`} />
            <span className="text-zinc-400">min source</span>
          </div>
          <div className="font-semibold text-gold">{estimate ?? "…"} credits</div>
        </div>

        {busy && <p className="text-sm text-gold">{busy}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
