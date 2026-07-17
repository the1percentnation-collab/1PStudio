"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ViralityBadge } from "@/components/ViralityBadge";
import { api, type CaptionLine, type CaptionStyleLike, type ClipDetail, type EditOpLike, type Publication } from "@/lib/api";

const DEFAULT_STYLE: CaptionStyleLike = {
  fontSizePx: 64, primaryColor: "#ffffff", highlightColor: "#ffd54a", outlineColor: "#000000",
  outlinePx: 4, marginVPct: 18, allCaps: true, karaoke: true,
};
const PLATFORMS = ["TIKTOK", "YOUTUBE", "INSTAGRAM", "X"];
const TRANSITIONS = ["none", "fade", "cut", "whip"];
const META_FIELDS = ["best_title", "headline", "on_screen_text", "thumbnail_text", "niche", "seo_opener",
  "caption", "video_description", "hashtags", "content_pillar", "transcript_summary"];
const MANAGED_OPS = new Set(["trim", "watermark", "transition", "textOverlay"]);

interface Overlay { atSec: number; durationSec: number; text: string; }

export default function ClipPage() {
  const { id } = useParams<{ id: string }>();
  const [clip, setClip] = useState<ClipDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);
  const [pubs, setPubs] = useState<Publication[]>([]);

  // editor state
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [watermark, setWatermark] = useState(false);
  const [transition, setTransition] = useState("none");
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [style, setStyle] = useState<CaptionStyleLike>(DEFAULT_STYLE);
  const [origOps, setOrigOps] = useState<EditOpLike[]>([]);

  // publish form
  const [platform, setPlatform] = useState("TIKTOK");
  const [pubTitle, setPubTitle] = useState("");
  const [pubDesc, setPubDesc] = useState("");
  const [pubTags, setPubTags] = useState("");
  const [pubWhen, setPubWhen] = useState("");

  const load = useCallback(async () => {
    const c = await api.clip(id).catch(() => null);
    if (!c) return;
    setClip(c);
    setMeta((c.contentMetadata as Record<string, unknown>) ?? null);
    const ops = (c.edl?.ops ?? []) as EditOpLike[];
    setOrigOps(ops);
    const trim = ops.find((o) => o.kind === "trim");
    setTrimStart((trim?.startSec as number) ?? c.startSec);
    setTrimEnd((trim?.endSec as number) ?? c.endSec);
    setWatermark(ops.some((o) => o.kind === "watermark"));
    setTransition((ops.find((o) => o.kind === "transition")?.style as string) ?? "none");
    setOverlays(ops.filter((o) => o.kind === "textOverlay").map((o) => ({ atSec: o.atSec as number, durationSec: o.durationSec as number, text: o.text as string })));
    if (c.captions) {
      setLines(c.captions.lines);
      if (c.captions.style) setStyle({ ...DEFAULT_STYLE, ...c.captions.style });
    }
    api.publications({ clipId: id }).then((d) => setPubs(d.publications)).catch(() => undefined);
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  if (!clip) return <p className="text-zinc-500">Loading…</p>;
  const doneRender = clip.renders.find((r) => r.status === "DONE" && r.outputUrl);
  const rendering = clip.renders.some((r) => r.status === "RENDERING" || r.status === "QUEUED");

  function buildOps(): EditOpLike[] {
    const preserved = origOps.filter((o) => !MANAGED_OPS.has(o.kind));
    return [
      { kind: "trim", startSec: trimStart, endSec: trimEnd },
      ...preserved,
      ...(watermark ? [{ kind: "watermark", position: "br" }] : []),
      ...(transition !== "none" ? [{ kind: "transition", atSec: 0, style: transition }] : []),
      ...overlays.filter((o) => o.text.trim()).map((o) => ({ kind: "textOverlay", atSec: o.atSec, durationSec: o.durationSec, text: o.text })),
    ];
  }

  async function reRender() {
    setBusy("Queueing re-render…");
    setNote(null);
    try {
      const { editVersion } = await api.patchEdl(clip!.id, { ops: buildOps(), captionLines: lines, captionStyle: style });
      setNote(`Re-render v${editVersion} queued.`);
    } catch (err) {
      setNote(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function genMeta() {
    setBusy("Generating content metadata…");
    setNote(null);
    try { setMeta(await api.generateMetadata(clip!.id)); }
    catch (err) { setNote(String(err)); }
    finally { setBusy(null); }
  }

  async function schedule() {
    setBusy(`Scheduling on ${platform}…`);
    setNote(null);
    try {
      const res = await api.publish(clip!.id, {
        platform,
        ...(pubTitle ? { title: pubTitle } : {}),
        ...(pubDesc ? { description: pubDesc } : {}),
        ...(pubTags ? { hashtags: pubTags } : {}),
        ...(pubWhen ? { scheduledAt: new Date(pubWhen).toISOString() } : {}),
      });
      setNote(`Publication ${res.publication.status}. ${res.note ?? ""}`);
      api.publications({ clipId: clip!.id }).then((d) => setPubs(d.publications)).catch(() => undefined);
    } catch (err) { setNote(String(err)); }
    finally { setBusy(null); }
  }

  const fieldCls = "rounded border border-edge bg-ink px-2 py-1";

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_1fr]">
      {/* LEFT: player + exports */}
      <div>
        <div className="overflow-hidden rounded-xl border border-edge bg-panel">
          {doneRender ? (
            <video key={doneRender.id} src={doneRender.outputUrl!} controls className="aspect-[9/16] w-full bg-black" />
          ) : (
            <div className="grid aspect-[9/16] place-items-center text-zinc-600">{rendering ? "rendering…" : "no render yet"}</div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {doneRender && <a href={doneRender.outputUrl!} download className="rounded-lg border border-edge px-3 py-1.5 hover:border-gold/60">Download MP4</a>}
          <button
            onClick={() => fetch(api.premiereXmlUrl(clip.id), { headers: { Authorization: `Bearer ${api.apiKey}` } })
              .then((r) => r.text()).then((xml) => {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
                a.download = `${clip.id}.xml`; a.click();
              })}
            className="rounded-lg border border-edge px-3 py-1.5 hover:border-gold/60">Premiere / Resolve XML</button>
        </div>
      </div>

      {/* RIGHT */}
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <ViralityBadge score={clip.viralityScore} />
          <div>
            <h1 className="text-xl font-black">{clip.title}</h1>
            <p className="text-sm text-zinc-400">{clip.viralityReason}</p>
            {clip.viralityBreakdown && (
              <p className="mt-1 text-xs text-zinc-500">hook {clip.viralityBreakdown.hook} · flow {clip.viralityBreakdown.flow} · value {clip.viralityBreakdown.value} · trend {clip.viralityBreakdown.trend}</p>
            )}
          </div>
        </div>

        {/* Edit & re-render */}
        <section className="rounded-xl border border-edge bg-panel p-5">
          <h2 className="mb-3 font-bold">Edit &amp; re-render <span className="text-xs font-normal text-zinc-500">(v{clip.edl?.version ?? 1})</span></h2>
          <div className="flex flex-wrap items-end gap-4 text-sm">
            <label>Start (s)<input type="number" step={0.1} value={trimStart} onChange={(e) => setTrimStart(Number(e.target.value))} className={`ml-2 w-24 ${fieldCls}`} /></label>
            <label>End (s)<input type="number" step={0.1} value={trimEnd} onChange={(e) => setTrimEnd(Number(e.target.value))} className={`ml-2 w-24 ${fieldCls}`} /></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} /> Watermark</label>
            <label>Transition<select value={transition} onChange={(e) => setTransition(e.target.value)} className={`ml-2 ${fieldCls}`}>{TRANSITIONS.map((t) => <option key={t}>{t}</option>)}</select></label>
          </div>

          {/* Text overlays */}
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-zinc-400">Text overlays</span>
              <button onClick={() => setOverlays([...overlays, { atSec: 0, durationSec: 2, text: "" }])} className="text-xs text-gold hover:underline">+ add</button>
            </div>
            {overlays.map((o, i) => (
              <div key={i} className="mb-1 flex items-center gap-2 text-sm">
                <input value={o.text} placeholder="overlay text" onChange={(e) => setOverlays(overlays.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} className={`flex-1 ${fieldCls}`} />
                <input type="number" value={o.atSec} title="at (s)" onChange={(e) => setOverlays(overlays.map((x, j) => j === i ? { ...x, atSec: Number(e.target.value) } : x))} className={`w-16 ${fieldCls}`} />
                <input type="number" value={o.durationSec} title="dur (s)" onChange={(e) => setOverlays(overlays.map((x, j) => j === i ? { ...x, durationSec: Number(e.target.value) } : x))} className={`w-16 ${fieldCls}`} />
                <button onClick={() => setOverlays(overlays.filter((_, j) => j !== i))} className="text-zinc-500 hover:text-red-400">✕</button>
              </div>
            ))}
          </div>

          {/* Caption style */}
          {clip.captions && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-zinc-400">Captions &amp; style ({lines.length} lines)</summary>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label>Size<input type="number" value={style.fontSizePx} onChange={(e) => setStyle({ ...style, fontSizePx: Number(e.target.value) })} className={`ml-2 w-16 ${fieldCls}`} /></label>
                <label className="flex items-center gap-1">Text<input type="color" value={style.primaryColor} onChange={(e) => setStyle({ ...style, primaryColor: e.target.value })} /></label>
                <label className="flex items-center gap-1">Highlight<input type="color" value={style.highlightColor} onChange={(e) => setStyle({ ...style, highlightColor: e.target.value })} /></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={style.allCaps} onChange={(e) => setStyle({ ...style, allCaps: e.target.checked })} /> ALL CAPS</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={style.karaoke} onChange={(e) => setStyle({ ...style, karaoke: e.target.checked })} /> Karaoke</label>
              </div>
              <ul className="mt-3 max-h-48 space-y-1 overflow-auto">
                {lines.map((l, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="w-10 shrink-0 text-xs text-zinc-600">{l.startSec.toFixed(1)}s</span>
                    <input value={l.text} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, text: e.target.value, words: undefined } : x))} className={`flex-1 ${fieldCls}`} />
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* Gated / coming-soon AI edits */}
          <div className="mt-4 flex flex-wrap gap-2">
            {["AI B-roll", "AI voiceover", "Dubbing"].map((f) => (
              <span key={f} className="cursor-not-allowed rounded-lg border border-dashed border-edge px-3 py-1.5 text-xs text-zinc-600" title="Vendor not wired yet">{f} · soon</span>
            ))}
          </div>

          <div className="mt-4">
            <button onClick={reRender} disabled={!!busy} className="rounded-lg bg-gold px-4 py-2 font-semibold text-ink disabled:opacity-40">Re-render</button>
          </div>
        </section>

        {/* Content metadata */}
        <section className="rounded-xl border border-edge bg-panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Content metadata <span className="text-xs font-normal text-zinc-500">(1P Studio generator)</span></h2>
            <button onClick={genMeta} disabled={!!busy} className="rounded-lg border border-gold/60 px-3 py-1.5 text-sm text-gold disabled:opacity-40">{meta ? "Regenerate" : "Generate"}</button>
          </div>
          {meta ? (
            <dl className="space-y-2 text-sm">
              {META_FIELDS.filter((f) => meta[f]).map((f) => (
                <div key={f} className="flex gap-2">
                  <dt className="w-36 shrink-0 text-zinc-500">{f}</dt>
                  <dd className="flex-1 whitespace-pre-wrap break-words">{String(meta[f])}</dd>
                  <button onClick={() => navigator.clipboard.writeText(String(meta[f]))} className="self-start text-xs text-zinc-500 hover:text-gold">copy</button>
                </div>
              ))}
              {typeof meta.hook_score === "number" && <div className="flex gap-2"><dt className="w-36 shrink-0 text-zinc-500">hook_score</dt><dd>{String(meta.hook_score)}/10 — {String(meta.hook_score_reason ?? "")}</dd></div>}
              {Array.isArray(meta.titles) && <div className="flex gap-2"><dt className="w-36 shrink-0 text-zinc-500">titles</dt><dd className="flex-1">{(meta.titles as string[]).map((t, i) => <div key={i}>• {t}</div>)}</dd></div>}
            </dl>
          ) : <p className="text-sm text-zinc-500">Titles, captions, hashtags, and a hook score in the 1P brand voice.</p>}
        </section>

        {/* Publish */}
        <section className="rounded-xl border border-edge bg-panel p-5">
          <h2 className="mb-3 font-bold">Publish &amp; schedule</h2>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <label>Platform<select value={platform} onChange={(e) => setPlatform(e.target.value)} className={`ml-2 ${fieldCls}`}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select></label>
            <label>When<input type="datetime-local" value={pubWhen} onChange={(e) => setPubWhen(e.target.value)} className={`ml-2 ${fieldCls}`} /></label>
            <input value={pubTitle} onChange={(e) => setPubTitle(e.target.value)} placeholder="title (blank = auto from metadata)" className={`sm:col-span-2 ${fieldCls}`} />
            <input value={pubTags} onChange={(e) => setPubTags(e.target.value)} placeholder="hashtags (blank = auto)" className={`sm:col-span-2 ${fieldCls}`} />
            <textarea value={pubDesc} onChange={(e) => setPubDesc(e.target.value)} placeholder="description (blank = auto)" rows={2} className={`sm:col-span-2 ${fieldCls}`} />
          </div>
          <button onClick={schedule} disabled={!!busy} className="mt-3 rounded-lg border border-edge px-4 py-2 text-sm hover:border-gold/60 disabled:opacity-40">Schedule post</button>
          <p className="mt-2 text-xs text-zinc-600">Auto-posting activates when a platform account is connected; until then posts stay SCHEDULED.</p>
          {pubs.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {pubs.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-zinc-400">
                  <span className="lowercase">{p.platform}</span>
                  <span className="text-zinc-600">·</span>
                  <span>{p.scheduledAt ? new Date(p.scheduledAt).toLocaleString() : "now"}</span>
                  <span className="ml-auto rounded-full border border-gold/50 px-2 py-0.5 text-xs text-gold">{p.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {(busy || note) && <p className="text-sm text-gold">{busy ?? note}</p>}
      </div>
    </div>
  );
}
