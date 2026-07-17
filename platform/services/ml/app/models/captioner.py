"""Caption line builder: word timings → styled caption lines.

Groups words into short lines (readability on a phone screen), breaking at
punctuation, speaker changes, long gaps, or the char budget. Emphasis words
(hook lexicon) get the highlight color for their whole line. All times are
re-based RELATIVE TO CLIP START.
"""
import re

from .selector import HOOK_WORDS

MAX_CHARS = 22
MAX_WORDS = 4
GAP_BREAK_SEC = 0.7


def build_captions(words: list[dict], clip_start: float, clip_end: float) -> list[dict]:
    clip_words = [w for w in words if w["startSec"] >= clip_start and w["endSec"] <= clip_end]
    lines: list[dict] = []
    current: list[dict] = []

    def flush() -> None:
        if not current:
            return
        rebased = [
            {
                "word": w["word"],
                "startSec": round(w["startSec"] - clip_start, 3),
                "endSec": round(w["endSec"] - clip_start, 3),
                **({"speaker": w["speaker"]} if w.get("speaker") else {}),
            }
            for w in current
        ]
        emphasis = [w["word"] for w in rebased if _clean(w["word"]) in HOOK_WORDS]
        lines.append(
            {
                "startSec": rebased[0]["startSec"],
                "endSec": rebased[-1]["endSec"],
                "text": " ".join(w["word"] for w in rebased),
                "words": rebased,
                "emphasis": emphasis[:2],
            }
        )
        current.clear()

    for w in clip_words:
        if current:
            gap = w["startSec"] - current[-1]["endSec"]
            chars = sum(len(x["word"]) + 1 for x in current) + len(w["word"])
            if gap > GAP_BREAK_SEC or chars > MAX_CHARS or len(current) >= MAX_WORDS:
                flush()
        current.append(w)
        if re.search(r"[.!?]$", w["word"]):
            flush()
    flush()
    return lines


def _clean(word: str) -> str:
    return re.sub(r"[^a-z']", "", word.lower())
