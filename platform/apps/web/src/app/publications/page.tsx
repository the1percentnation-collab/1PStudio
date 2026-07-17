"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type Publication } from "@/lib/api";

const STATUSES = ["ALL", "DRAFT", "SCHEDULED", "POSTED", "FAILED"] as const;
const STATUS_CLS: Record<string, string> = {
  SCHEDULED: "bg-gold/10 text-gold border-gold/50",
  POSTED: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
  DRAFT: "bg-panel text-zinc-400 border-edge",
  FAILED: "bg-red-500/10 text-red-300 border-red-500/50",
};

export default function PublicationsPage() {
  const [pubs, setPubs] = useState<Publication[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      api
        .publications(filter === "ALL" ? undefined : { status: filter })
        .then((d) => live && setPubs(d.publications))
        .catch((e) => live && setError(String(e)));
    load();
    const t = setInterval(load, 6000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [filter]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-black">Publishing</h1>
        <div className="flex gap-1 text-xs">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-full border px-3 py-1 ${filter === s ? "border-gold/60 text-gold" : "border-edge text-zinc-400 hover:text-zinc-100"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 rounded-lg border border-edge bg-panel px-4 py-2 text-xs text-zinc-500">
        Scheduling and drafts are fully wired. Actual auto-posting activates once a platform account is connected
        (OAuth publisher seam) — until then posts stay <span className="text-gold">SCHEDULED</span>.
      </p>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      <div className="overflow-hidden rounded-xl border border-edge">
        <table className="w-full text-sm">
          <thead className="bg-panel text-left text-zinc-400">
            <tr>
              <th className="px-4 py-2 font-medium">Clip</th>
              <th className="px-4 py-2 font-medium">Platform</th>
              <th className="px-4 py-2 font-medium">Scheduled</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {pubs.map((p) => (
              <tr key={p.id} className="border-t border-edge">
                <td className="px-4 py-2">
                  <Link href={`/clips/${p.clipId}`} className="hover:text-gold">{p.clip?.title ?? p.title ?? p.clipId}</Link>
                </td>
                <td className="px-4 py-2 lowercase text-zinc-300">{p.platform}</td>
                <td className="px-4 py-2 text-zinc-400">{p.scheduledAt ? new Date(p.scheduledAt).toLocaleString() : "—"}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_CLS[p.status] ?? STATUS_CLS.DRAFT}`}>{p.status}</span>
                </td>
              </tr>
            ))}
            {pubs.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">No publications yet — schedule a clip from its page.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
