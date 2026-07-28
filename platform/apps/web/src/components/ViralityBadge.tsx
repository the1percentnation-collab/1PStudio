export function ViralityBadge({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const hue = 10 + pct * 1.2; // red → gold → green
  return (
    <div
      className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-sm font-bold"
      style={{
        background: `conic-gradient(hsl(${hue} 85% 55%) ${pct * 3.6}deg, #2a2a31 0deg)`,
      }}
      title={`Virality ${pct}/100`}
    >
      <span className="grid h-9 w-9 place-items-center rounded-full bg-panel">{Math.round(pct)}</span>
    </div>
  );
}
