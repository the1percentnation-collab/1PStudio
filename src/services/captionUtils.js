// Groups Whisper word timings into short TikTok-style caption lines.

const SENTENCE_END = /[.!?,]$/;

export function groupWordsIntoCaptions(words, {
  maxWords = 3,
  maxChars = 18,
  maxGap = 0.6,
  minDisplay = 0.35,
} = {}) {
  const lines = [];
  let current = null;

  for (const word of words || []) {
    const startNew =
      !current ||
      current.words.length >= maxWords ||
      current.text.length + 1 + word.w.length > maxChars ||
      word.s - current.words[current.words.length - 1].e > maxGap;

    if (startNew) {
      current = { text: word.w, start: word.s, end: word.e, words: [word] };
      lines.push(current);
    } else {
      current.text += ` ${word.w}`;
      current.end = word.e;
      current.words.push(word);
    }

    if (SENTENCE_END.test(word.w)) current = null; // punctuation closes the line
  }

  // enforce minimum display time, prevent overlaps, and bridge tiny gaps
  // between consecutive lines so captions don't flicker off and on
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    line.end = Math.max(line.end, line.start + minDisplay);
    if (next) {
      if (next.start - line.end < 0.3) line.end = next.start;
      else line.end = Math.min(line.end, next.start);
    }
  }

  return lines;
}

// Returns { line, activeWordIndex } for time t, or null when no caption is
// showing. activeWordIndex is -1 before the first word of the line starts.
export function getActiveCaption(lines, t) {
  for (const line of lines || []) {
    if (t < line.start) return null; // lines are sorted; nothing active yet
    if (t < line.end) {
      let activeWordIndex = -1;
      for (let i = 0; i < line.words.length; i++) {
        if (t >= line.words[i].s) activeWordIndex = i;
      }
      return { line, activeWordIndex };
    }
  }
  return null;
}
