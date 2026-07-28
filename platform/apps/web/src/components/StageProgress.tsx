import { PIPELINE_STAGES } from "@onepct/shared";

const LABELS: Record<string, string> = {
  INGEST: "Ingest", TRANSCRIBE: "Transcribe", ANALYZE: "Analyze", SELECT: "Select",
  REFRAME: "Reframe", CAPTION: "Caption", EDIT: "Edit", BRAND: "Brand", RENDER: "Render", PUBLISH: "Publish",
};

export function StageProgress({ stageStatus }: { stageStatus: Record<string, { status: string }> }) {
  return (
    <ol className="flex flex-wrap gap-2">
      {PIPELINE_STAGES.filter((s) => s !== "PUBLISH").map((stage) => {
        const st = stageStatus?.[stage]?.status ?? "PENDING";
        const cls =
          st === "DONE" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : st === "RUNNING" ? "border-gold/50 bg-gold/10 text-gold animate-pulse"
          : st === "FAILED" ? "border-red-500/50 bg-red-500/10 text-red-300"
          : "border-edge bg-panel text-zinc-500";
        return (
          <li key={stage} className={`rounded-full border px-3 py-1 text-xs font-medium ${cls}`}>
            {LABELS[stage]}
          </li>
        );
      })}
    </ol>
  );
}
