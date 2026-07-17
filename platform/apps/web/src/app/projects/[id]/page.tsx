"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { StageProgress } from "@/components/StageProgress";
import { ViralityBadge } from "@/components/ViralityBadge";
import { api, type ClipInfo, type ProjectInfo } from "@/lib/api";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<(ProjectInfo & { job?: ProjectInfo["job"] }) | null>(null);
  const [clips, setClips] = useState<ClipInfo[]>([]);

  useEffect(() => {
    let live = true;
    const load = async () => {
      const p = await api.project(id).catch(() => null);
      if (!live || !p) return;
      setProject(p);
      const c = await api.projectClips(id).catch(() => null);
      if (live && c) setClips(c.clips);
    };
    load();
    const t = setInterval(load, 3000);
    return () => { live = false; clearInterval(t); };
  }, [id]);

  if (!project) return <p className="text-zinc-500">Loading…</p>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-2 text-2xl font-black">{project.title}</h1>
        <StageProgress stageStatus={(project.job?.stageStatus ?? {}) as Record<string, { status: string }>} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clips.map((clip) => {
          const render = clip.renders.find((r) => r.status === "DONE");
          return (
            <Link
              key={clip.id}
              href={`/clips/${clip.id}`}
              className="overflow-hidden rounded-xl border border-edge bg-panel hover:border-gold/60"
            >
              <div className="relative aspect-[9/16] max-h-72 w-full bg-ink">
                {render?.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={render.thumbUrl} alt={clip.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-sm text-zinc-600">
                    {clip.status === "FAILED" ? "render failed" : "rendering…"}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 p-4">
                <ViralityBadge score={clip.viralityScore} />
                <div className="min-w-0">
                  <div className="truncate font-semibold">{clip.title}</div>
                  <div className="text-xs text-zinc-500">
                    {(clip.endSec - clip.startSec).toFixed(0)}s · {clip.startSec.toFixed(0)}–{clip.endSec.toFixed(0)}s
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      {clips.length === 0 && <p className="mt-8 text-zinc-500">Clips will appear here once selection finishes.</p>}
    </div>
  );
}
