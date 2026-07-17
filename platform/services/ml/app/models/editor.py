"""AI edit assembly: filler/dead-air removal with caption re-fitting.

Given clip bounds + word timings, finds filler words and long silences,
emits `removeFiller` ranges (clip-relative), and REMAPS caption timings into
the post-removal time domain so burned captions stay in sync. This is the
one place that owns that time-domain conversion.
"""
import re

FILLER_WORDS = {"um", "uh", "erm", "hmm"}
FILLER_PHRASES = {"you know", "i mean"}
SILENCE_SEC = 1.2
PAD = 0.04


def find_filler_ranges(words: list[dict], clip_start: float, clip_end: float) -> list[list[float]]:
    clip_words = [w for w in words if w["startSec"] >= clip_start and w["endSec"] <= clip_end]
    ranges: list[list[float]] = []

    for i, w in enumerate(clip_words):
        token = re.sub(r"[^a-z']", "", w["word"].lower())
        if token in FILLER_WORDS:
            ranges.append([w["startSec"] - PAD, w["endSec"] + PAD])
        elif i + 1 < len(clip_words):
            next_token = re.sub(r"[^a-z']", "", clip_words[i + 1]["word"].lower())
            pair = f"{token} {next_token}"
            if pair in FILLER_PHRASES:
                ranges.append([w["startSec"] - PAD, clip_words[i + 1]["endSec"] + PAD])

    # Dead-air gaps between words.
    for a, b in zip(clip_words, clip_words[1:]):
        gap = b["startSec"] - a["endSec"]
        if gap > SILENCE_SEC:
            ranges.append([a["endSec"] + 0.25, b["startSec"] - 0.25])

    # Clip-relative, merged, sorted.
    rel = sorted([[max(0, s - clip_start), max(0, e - clip_start)] for s, e in ranges if e > s])
    merged: list[list[float]] = []
    for r in rel:
        if merged and r[0] <= merged[-1][1] + 0.01:
            merged[-1][1] = max(merged[-1][1], r[1])
        else:
            merged.append(r)
    return [[round(s, 3), round(e, 3)] for s, e in merged]


def remap_time(t: float, removed: list[list[float]]) -> float:
    """Source-clip time → post-removal output time."""
    shift = 0.0
    for s, e in removed:
        if t >= e:
            shift += e - s
        elif t > s:
            shift += t - s
    return max(0.0, round(t - shift, 3))


def remap_captions(lines: list[dict], removed: list[list[float]]) -> list[dict]:
    out = []
    for line in lines:
        words = [
            {**w, "startSec": remap_time(w["startSec"], removed), "endSec": remap_time(w["endSec"], removed)}
            for w in line["words"]
            if not _fully_removed(w, removed)
        ]
        if not words:
            continue
        out.append(
            {
                **line,
                "startSec": words[0]["startSec"],
                "endSec": words[-1]["endSec"],
                "text": " ".join(w["word"] for w in words),
                "words": words,
            }
        )
    return out


def _fully_removed(w: dict, removed: list[list[float]]) -> bool:
    return any(w["startSec"] >= s - 0.05 and w["endSec"] <= e + 0.05 for s, e in removed)
