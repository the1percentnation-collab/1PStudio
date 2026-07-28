"use client";

import { useEffect, useState } from "react";
import { ADDON_COST, PLANS, STAGE_CREDIT_COST, type PlanId } from "@onepct/shared";
import { api, type LedgerEntry } from "@/lib/api";

const RES = [
  { id: "R720", label: "720p" },
  { id: "R1080", label: "1080p" },
  { id: "R4K", label: "4K" },
];

export default function CreditsPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [planId, setPlanId] = useState<string>("");
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);

  // ROI calculator inputs
  const [durationMin, setDurationMin] = useState(10);
  const [clipCount, setClipCount] = useState(5);
  const [resolution, setResolution] = useState("R1080");
  const [estimate, setEstimate] = useState<number | null>(null);

  useEffect(() => {
    api.balance().then((d) => { setBalance(d.balance); setPlanId(d.plan.id); }).catch(() => undefined);
    api.ledger().then((d) => setLedger(d.entries)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      api.estimate(durationMin * 60, clipCount, resolution).then((d) => setEstimate(d.estimate)).catch(() => setEstimate(null));
    }, 250);
    return () => clearTimeout(t);
  }, [durationMin, clipCount, resolution]);

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-black">Credits &amp; billing</h1>
        <div className="text-right">
          <div className="text-3xl font-black text-gold">{balance ?? "—"}</div>
          <div className="text-xs text-zinc-500">balance · {planId} plan</div>
        </div>
      </div>

      {/* ROI / cost calculator */}
      <section className="rounded-xl border border-edge bg-panel p-5">
        <h2 className="mb-4 font-bold">Cost calculator</h2>
        <div className="flex flex-wrap items-end gap-4 text-sm">
          <label>Source length (min)
            <input type="number" min={1} value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} className="ml-2 w-20 rounded border border-edge bg-ink px-2 py-1" />
          </label>
          <label>Clips
            <input type="number" min={1} value={clipCount} onChange={(e) => setClipCount(Number(e.target.value))} className="ml-2 w-16 rounded border border-edge bg-ink px-2 py-1" />
          </label>
          <label>Quality
            <select value={resolution} onChange={(e) => setResolution(e.target.value)} className="ml-2 rounded border border-edge bg-ink px-2 py-1">
              {RES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
          <div className="ml-auto text-right">
            <div className="text-2xl font-black text-gold">{estimate ?? "…"}</div>
            <div className="text-xs text-zinc-500">credits{balance != null && estimate != null ? ` · ${Math.floor(balance / Math.max(1, estimate))} runs left` : ""}</div>
          </div>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Per-stage rates: {Object.entries(STAGE_CREDIT_COST).filter(([, v]) => v > 0).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(" · ")}.
          Add-ons: {Object.entries(ADDON_COST).map(([k, v]) => `${k.toLowerCase().replace(/_/g, " ")} ${v}`).join(" · ")}.
        </p>
      </section>

      {/* Plans */}
      <section>
        <h2 className="mb-4 font-bold">Plans</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(PLANS) as PlanId[]).map((id) => {
            const p = PLANS[id];
            const current = id === planId;
            return (
              <div key={id} className={`rounded-xl border p-4 ${current ? "border-gold/60 bg-gold/5" : "border-edge bg-panel"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold">{id}</span>
                  {current && <span className="text-xs text-gold">current</span>}
                </div>
                <div className="mt-2 text-2xl font-black">{p.monthlyCredits ?? "Custom"}</div>
                <div className="text-xs text-zinc-500">credits / mo</div>
                <ul className="mt-3 space-y-1 text-xs text-zinc-400">
                  <li>{p.watermark ? "Watermarked" : "No watermark"}</li>
                  <li>Up to {p.maxResolution.replace("R", "").replace("4K", "4K").toLowerCase()}</li>
                  <li>{p.seats ?? "∞"} seat{p.seats === 1 ? "" : "s"}</li>
                  <li>{p.api ? "API access" : "No API"}</li>
                  <li>{p.clipTtlDays ? `${p.clipTtlDays}-day clips` : "Clips never expire"}</li>
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* Ledger */}
      <section>
        <h2 className="mb-4 font-bold">Ledger <span className="text-xs font-normal text-zinc-500">(append-only)</span></h2>
        <div className="max-h-80 overflow-auto rounded-xl border border-edge">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel text-left text-zinc-400">
              <tr><th className="px-4 py-2 font-medium">When</th><th className="px-4 py-2 font-medium">Reason</th><th className="px-4 py-2 font-medium">Stage</th><th className="px-4 py-2 text-right font-medium">Δ</th></tr>
            </thead>
            <tbody>
              {ledger.map((e) => (
                <tr key={e.id} className="border-t border-edge">
                  <td className="px-4 py-1.5 text-zinc-500">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-1.5">{e.reason}</td>
                  <td className="px-4 py-1.5 text-zinc-400">{e.stage ?? "—"}</td>
                  <td className={`px-4 py-1.5 text-right font-mono ${e.delta < 0 ? "text-red-300" : "text-emerald-300"}`}>{e.delta > 0 ? "+" : ""}{e.delta}</td>
                </tr>
              ))}
              {ledger.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">No ledger entries yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
