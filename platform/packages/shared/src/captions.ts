export interface WordTiming {
  word: string;
  startSec: number;
  endSec: number;
  speaker?: string;
}

export interface TranscriptSegment {
  startSec: number;
  endSec: number;
  text: string;
  speaker?: string;
}

export interface Transcript {
  language: string;
  words: WordTiming[];
  segments: TranscriptSegment[];
}

export interface CaptionLine {
  startSec: number;
  endSec: number;
  text: string;
  words: WordTiming[];
  emphasis?: string[]; // words to keyword-highlight
  speaker?: string;
}

export interface CaptionStyle {
  fontFamily: string;
  fontSizePx: number;
  primaryColor: string; // &HBBGGRR ASS hex or #rrggbb (render converts)
  highlightColor: string;
  outlineColor: string;
  outlinePx: number;
  marginVPct: number; // vertical safe-area margin as % of frame height
  allCaps: boolean;
  karaoke: boolean; // per-word active highlight
}

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontFamily: "DejaVu Sans",
  fontSizePx: 64,
  primaryColor: "#ffffff",
  highlightColor: "#ffd54a",
  outlineColor: "#000000",
  outlinePx: 4,
  marginVPct: 18,
  allCaps: true,
  karaoke: true,
};
