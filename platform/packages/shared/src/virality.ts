/** Virality Score v1: rubric-scored (LLM or heuristic mock), 0-100 with a breakdown. */
export interface ViralityBreakdown {
  hook: number; // 0-25: strength of opening moment
  flow: number; // 0-25: pacing / self-contained arc
  value: number; // 0-25: informational or emotional payoff
  trend: number; // 0-25: topicality / shareability
}

export interface ViralityScore {
  total: number; // 0-100
  breakdown: ViralityBreakdown;
  reason: string;
}

export interface ClipCandidate {
  startSec: number;
  endSec: number;
  title: string;
  hookText: string;
  virality: ViralityScore;
  transcriptText: string;
}
