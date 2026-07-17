import { DEFAULT_CAPTION_STYLE, type CaptionLine, type CaptionStyle } from "@onepct/shared";

/** #rrggbb → ASS &H00BBGGRR& (no alpha). */
function assColor(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "&H00FFFFFF&";
  return `&H00${m[3]}${m[2]}${m[1]}&`.toUpperCase();
}

function ts(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${rem.toFixed(2).padStart(5, "0")}`;
}

function escapeAss(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\n/g, "\\N");
}

/**
 * CaptionLine[] + style → ASS subtitle document sized to the OUTPUT frame.
 * Active-word highlight: one Dialogue event per word window, with the current
 * word colored via an inline override — more predictable than \k karaoke
 * across renderers, and it lets emphasis words stay highlighted throughout.
 */
export function buildAss(
  lines: CaptionLine[],
  styleIn: Partial<CaptionStyle> | undefined,
  frameW: number,
  frameH: number
): string {
  const style: CaptionStyle = { ...DEFAULT_CAPTION_STYLE, ...styleIn };
  const marginV = Math.round((style.marginVPct / 100) * frameH);
  const fontSize = Math.round(style.fontSizePx * (frameH / 1920));
  const primary = assColor(style.primaryColor);
  const highlight = assColor(style.highlightColor);
  const outline = assColor(style.outlineColor);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${frameW}
PlayResY: ${frameH}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontFamily},${fontSize},${primary},${primary},${outline},&H7F000000&,-1,0,0,0,100,100,0,0,1,${style.outlinePx},1,2,60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events: string[] = [];
  for (const line of lines) {
    const caseFn = (w: string) => (style.allCaps ? w.toUpperCase() : w);
    const emphasis = new Set((line.emphasis ?? []).map((w) => w.toLowerCase()));
    const words = line.words.length
      ? line.words
      : [{ word: line.text, startSec: line.startSec, endSec: line.endSec }];

    const renderText = (activeIdx: number): string =>
      words
        .map((w, i) => {
          const word = escapeAss(caseFn(w.word));
          const isActive = style.karaoke && i === activeIdx;
          const isEmph = emphasis.has(w.word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""));
          if (isActive || isEmph) return `{\\c${highlight}}${word}{\\c${primary}}`;
          return word;
        })
        .join(" ");

    if (!style.karaoke) {
      events.push(`Dialogue: 0,${ts(line.startSec)},${ts(line.endSec)},Default,,0,0,0,,${renderText(-1)}`);
      continue;
    }

    for (let i = 0; i < words.length; i++) {
      const start = i === 0 ? line.startSec : words[i].startSec;
      const end = i === words.length - 1 ? line.endSec : words[i + 1].startSec;
      if (end <= start) continue;
      events.push(`Dialogue: 0,${ts(start)},${ts(end)},Default,,0,0,0,,${renderText(i)}`);
    }
  }

  return header + events.join("\n") + "\n";
}
