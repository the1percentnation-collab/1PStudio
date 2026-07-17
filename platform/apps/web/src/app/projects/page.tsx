"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type ProjectInfo } from "@/lib/api";

const STATUS_CLS: Record<string, string> = {
  READY: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
  PROCESSING: "bg-gold/10 text-gold border-gold/50",
  QUEUED: "bg-panel text-zinc-400 border-edge",
  FAILED: "bg-red-500/10 text-red-300 border-red-500/50",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => api.projects().then((d) => live && setProjects(d.projects)).catch((e) => live && setError(String(e)));
    load();
    const t = setInterval(load, 4000);
    return () => { live = false; clearInterval(t); };
  }, []);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-black">Projects</h1>
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      <div className="space-y-3">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className="flex items-center justify-between rounded-xl border border-edge bg-panel px-5 py-4 hover:border-gold/60"
          >
            <div>
              <div className="font-semibold">{p.title}</div>
              <div className="text-xs text-zinc-500">
                {new Date(p.createdAt).toLocaleString()} · {p.clipCount ?? 0} clips
                {p.durationSec ? ` · ${Math.round(p.durationSec)}s source` : ""}
              </div>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_CLS[p.status] ?? STATUS_CLS.QUEUED}`}>
              {p.status}
            </span>
          </Link>
        ))}
        {projects.length === 0 && !error && <p className="text-zinc-500">No projects yet — start one from the home page.</p>}
      </div>
    </div>
  );
}
