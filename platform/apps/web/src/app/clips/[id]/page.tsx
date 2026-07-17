"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ViralityBadge } from "@/components/ViralityBadge";
import { api, type ClipDetail } from "@/lib/api";

export default function ClipPage() {
  const { id } = useParams<{ id: string }>();
  const [clip, setClip] = useState<ClipDetail | null>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    const c = await api.clip(id).catch(() => null);
    if (!c) return;
    setClip(c);
    setMeta((c.contentMetadata as Record<string, unknown>) ?? null);
    const trim = (c.edl?.ops as { kind: string; startSec?: number; endSec?: number }[] | undefined)?.find(
      (o) => o.kind === "trim"
    );
    setTrimStart(trim?.startSec ?? c.startSec);
    setTrimEnd(trim?.endSec ?? c.endSec);
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  if (!clip) return <p className="text-zinc-500">Loading…</p>;
  const doneRender = clip.renders.find((r) => r.status === "DONE" && r.outputUrl);
  const rendering = clip.renders.some((r) => r.status === "RENDERING" || r.status === "QUEUED");

  async function reRender() {
    if (!clip?.edl) return;
    setBusy("Queueing re-render…");
    setNote(null);
    try {
      const ops = (clip.edl.ops as { kind: string }[]).map((op) =>
        op.kind === "trim" ? { ...op, startSec: trimStart, endSec: trimEnd } : op
      );
      const { editVersion } = await api.patchEdl(clip.id, { ops });
      setNote(`Re-render v${editVersion} queued — the EDL is declarative, so only RENDER re-runs.`);
    } catch (err) {
      setNote(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function genMeta() {
    setBusy("Generating content metadata…");
    setNote(null);
    try {
      setMeta(await api.generateMetadata(clip!.id));
    } catch (err) {
      setNote(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function schedule(platform: string) {
    setBusy(`Scheduling on ${platform}…`);
    try {
      const res = await api.publish(clip!.id, { platform });
      setNote(`Publication ${res.publication.status}. ${res.note ?? ""}`);
    } catch (err) {
      setNote(String(err));
    } finally {
      setBusy(null);
    }
  }

  const META_FIELDS = [
    "best_title", "headline", "on_screen_text", "thumbnail_text", "seo_opener",
    "caption", "video_description", "hashtags", "content_pillar", "transcript_summary",
  ];

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_1fr]">
      <div>
        <div className="overflow-hidden rounded-xl border border-edge bg-panel">
          {doneRender ? (
            <video key={doneRender.id} src={doneRender.outputUrl!} controls className="aspect-[9/16] w-full bg-black" />
          ) : (
            <div className="grid aspect-[9/16] place-items-center text-zinc-600">
              {rendering ? "rendering…" : "no render yet"}
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {doneRender && (
            <a href={doneRender.outputUrl!} download className="rounded-lg border border-edge px-3 py-1.5 hover:border-gold/60">
              Download MP4
            </a>
          )}
          <a
            href={api.premiereXmlUrl(clip.id)}
            className="rounded-lg border border-edge px-3 py-1.5 hover:border-gold/60"
            onClick={(e) => {
              e.preventDefault();
              fetch(api.premiereXmlUrl(clip.id), { headers: { Authorization: `Bearer ${api.apiKey}` } })
                .then((r) => r.text())
                .then((xml) => {
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
                  a.download = `${clip.id}.xml`;
                  a.click();
                });
            }}
          >
            Premiere / Resolve XML
          </a>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <ViralityBadge score={clip.viralityScore} />
          <div>
            <h1 className="text-xl font-black">{clip.title}</h1>
            <p className="text-sm text-zinc-400">{clip.viralityReason}</p>
            {clip.viralityBreakdown && (
              <p className="mt-1 text-xs text-zinc-500">
                hook {clip.viralityBreakdown.hook} · flow {clip.viralityBreakdown.flow} · value {clip.viralityBreakdown.value} · trend {clip.viralityBreakdown.trend}
              </p>
            )}
          </div>
        </div>

        <section className="rounded-xl border border-edge bg-panel p-5">
          <h2 className="mb-3 font-bold">Edit &amp; re-render <span className="text-xs font-normal text-zinc-500">(v{clip.edl?.version ?? 1})</span></h2>
          <div className="flex flex-wrap items-end gap-4 text-sm">
            <label>
              <span className="mb-1 block text-zinc-400">Start (s)</span>
              <input type="number" step={0.1} value={trimStart} onChange={(e) => setTrimStart(Number(e.target.value))}
                className="w-24 rounded border border-edge bg-ink px-2 py-1" />
            </label>
            <label>
              <span className="mb-1 block text-zinc-400">End (s)</span>
              <input type="number" step={0.1} value={trimEnd} onChange={(e) => setTrimEnd(Number(e.target.value))}
                className="w-24 rounded border border-edge bg-ink px-2 py-1" />
            </label>
            <button onClick={reRender} disabled={!!busy} className="rounded-lg bg-gold px-4 py-2 font-semibold text-ink disabled:opacity-40">
              Re-render
            </button>
          </div>
          {clip.captions && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-zinc-400">Captions ({clip.captions.lines.length} lines)</summary>
              <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-zinc-300">
                {clip.captions.lines.map((l, i) => (
                  <li key={i}><span className="text-zinc-600">{l.startSec.toFixed(1)}s</span> {l.text}</li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className="rounded-xl border border-edge bg-panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Content metadata <span className="text-xs font-normal text-zinc-500">(1P Studio generator)</span></h2>
            <button onClick={genMeta} disabled={!!busy} className="rounded-lg border border-gold/60 px-3 py-1.5 text-sm text-gold disabled:opacity-40">
              {meta ? "Regenerate" : "Generate"}
            </button>
          </div>
          {meta ? (
            <dl className="space-y-2 text-sm">
              {META_FIELDS.filter((f) => meta[f]).map((f) => (
                <div key={f} className="flex gap-2">
                  <dt className="w-36 shrink-0 text-zinc-500">{f}</dt>
                  <dd className="flex-1 whitespace-pre-wrap break-words">{String(meta[f])}</dd>
                  <button
                    onClick={() => navigator.clipboard.writeText(String(meta[f]))}
                    className="self-start text-xs text-zinc-500 hover:text-gold"
                  >
                    copy
                  </button>
                </div>
              ))}
              {typeof meta.hook_score === "number" && (
                <div className="flex gap-2"><dt className="w-36 shrink-0 text-zinc-500">hook_score</dt>
                  <dd>{String(meta.hook_score)}/10 — {String(meta.hook_score_reason ?? "")}</dd></div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-zinc-500">Titles, captions, hashtags, and a hook score in the 1P brand voice.</p>
          )}
        </section>

        <section className="rounded-xl border border-edge bg-panel p-5">
          <h2 className="mb-3 font-bold">Publish</h2>
          <div className="flex gap-2">
            {["TIKTOK", "YOUTUBE", "INSTAGRAM"].map((p) => (
              <button key={p} onClick={() => schedule(p)} disabled={!!busy}
                className="rounded-lg border border-edge px-3 py-1.5 text-sm hover:border-gold/60 disabled:opacity-40">
                Schedule → {p.toLowerCase()}
              </button>
            ))}
          </div>
        </section>

        {(busy || note) && <p className="text-sm text-gold">{busy ?? note}</p>}
      </div>
    </div>
  );
}
