"""Clip selection ("ClipAnything") + Virality Score.

Two backends behind one contract:
- AnthropicSelector — LLM structured-output selection over transcript+metadata,
  used when ANTHROPIC_API_KEY is set. Honors prompt-to-clip guidance.
- HeuristicSelector — deterministic mock: sentence-window segmentation scored
  by a hook lexicon, arc/self-containment, payoff and topicality signals.
  Same output schema, so the pipeline is identical either way.

Virality Score v1 is a 0-100 rubric (hook/flow/value/trend, 25 each). v2 is
planned to be trained on real engagement data once the analytics loop exists.
"""
import json
import logging
import re

import httpx

from ..config import settings

log = logging.getLogger("ml.selector")

HOOK_WORDS = {
    "you", "your", "stop", "never", "nobody", "secret", "truth", "mistake",
    "money", "excuse", "excuses", "discipline", "waiting", "permission",
    "why", "how", "one", "every", "best", "worst", "prison", "win", "wins",
}

VALUE_WORDS = {
    "because", "means", "so", "difference", "lesson", "learn", "built",
    "choose", "choosing", "decision", "ownership", "value", "consistency",
}

_BUCKET_TARGET = {"0-30s": (12, 30), "30-60s": (30, 60), "1-3m": (60, 180), "3-5m": (180, 300)}


def _window(options: dict) -> tuple[float, float]:
    return _BUCKET_TARGET.get(options.get("lengthBucket") or "30-60s", (30, 60))


class HeuristicSelector:
    def select(self, transcript: dict, analysis: dict, duration_sec: float, options: dict) -> list[dict]:
        segments = transcript.get("segments", [])
        if not segments:
            return []
        clip_window = options.get("clipWindow")
        if clip_window:
            segments = [s for s in segments if s["startSec"] >= clip_window["startSec"] and s["endSec"] <= clip_window["endSec"]]
        prompt = (options.get("prompt") or "").lower()
        prompt_terms = {w for w in re.findall(r"[a-z']+", prompt) if len(w) > 3}

        min_len, max_len = _window(options)
        count = int(options.get("clipCount") or 5)

        candidates = []
        for i in range(len(segments)):
            acc: list[dict] = []
            for j in range(i, len(segments)):
                acc.append(segments[j])
                length = acc[-1]["endSec"] - acc[0]["startSec"]
                if length > max_len:
                    break
                if length >= min_len:
                    candidates.append(self._score(acc, duration_sec, prompt_terms))
                    break  # one candidate per starting segment keeps it O(n)

        # Prompt-to-clip: when guidance is given, surface matching windows first.
        candidates.sort(key=lambda c: (-c["promptHits"], -c["virality"]["total"], c["startSec"]))
        picked: list[dict] = []
        for c in candidates:
            if len(picked) >= count:
                break
            if any(not (c["endSec"] <= p["startSec"] or c["startSec"] >= p["endSec"]) for p in picked):
                continue  # no overlaps
            picked.append(c)
        picked.sort(key=lambda c: -c["virality"]["total"])
        for c in picked:
            c.pop("promptHits", None)
        return picked

    def _score(self, segs: list[dict], duration_sec: float, prompt_terms: set[str]) -> dict:
        text = " ".join(s["text"] for s in segs)
        words = re.findall(r"[a-z']+", text.lower())
        first_words = re.findall(r"[a-z']+", segs[0]["text"].lower())[:8]

        hook = min(25.0, 6 + 5.0 * sum(1 for w in first_words if w in HOOK_WORDS))
        length = segs[-1]["endSec"] - segs[0]["startSec"]
        flow = max(4.0, 25.0 - abs(length - 45) * 0.35 - 2.0 * (len(segs) - 3 if len(segs) > 3 else 0))
        value = min(25.0, 6 + 3.5 * sum(1 for w in set(words) if w in VALUE_WORDS))
        position = 1.0 - (segs[0]["startSec"] / max(duration_sec, 1))
        trend = min(25.0, 8 + 10 * position + 2.0 * sum(1 for w in set(words) if w in {"money", "market", "leaders"}))
        total = round(hook + flow + value + trend, 1)

        hook_text = segs[0]["text"]
        prompt_hits = sum(1 for w in prompt_terms if w in words)
        return {
            "startSec": segs[0]["startSec"],
            "endSec": segs[-1]["endSec"],
            "title": _titleize(hook_text),
            "hookText": hook_text,
            "transcriptText": text,
            "promptHits": prompt_hits,
            "virality": {
                "total": total,
                "breakdown": {"hook": round(hook, 1), "flow": round(flow, 1), "value": round(value, 1), "trend": round(trend, 1)},
                "reason": _reason(hook, flow, value, trend),
            },
        }


def _titleize(text: str) -> str:
    t = re.sub(r"^(um|uh|like|so|you know)\s+", "", text.strip(), flags=re.I)
    return (t[:64].rstrip() + ("…" if len(t) > 64 else "")).capitalize() or "Untitled clip"


def _reason(hook: float, flow: float, value: float, trend: float) -> str:
    strongest = max((hook, "opens with a direct second-person hook"), (flow, "self-contained arc with clean pacing"),
                    (value, "delivers a concrete payoff"), (trend, "topical, shareable framing"))
    weakest = min((hook, "sharpen the first line"), (flow, "tighten the pacing"),
                  (value, "land a clearer takeaway"), (trend, "tie it to a current conversation"))
    return f"Strongest: {strongest[1]}. To improve: {weakest[1]}."


SELECT_TOOL_SCHEMA = {
    "name": "report_clips",
    "description": "Report the selected clips with virality scores.",
    "input_schema": {
        "type": "object",
        "properties": {
            "clips": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "startSec": {"type": "number"},
                        "endSec": {"type": "number"},
                        "title": {"type": "string"},
                        "hookText": {"type": "string"},
                        "virality": {
                            "type": "object",
                            "properties": {
                                "total": {"type": "number"},
                                "breakdown": {
                                    "type": "object",
                                    "properties": {
                                        "hook": {"type": "number"}, "flow": {"type": "number"},
                                        "value": {"type": "number"}, "trend": {"type": "number"},
                                    },
                                    "required": ["hook", "flow", "value", "trend"],
                                },
                                "reason": {"type": "string"},
                            },
                            "required": ["total", "breakdown", "reason"],
                        },
                    },
                    "required": ["startSec", "endSec", "title", "hookText", "virality"],
                },
            }
        },
        "required": ["clips"],
    },
}


class AnthropicSelector:
    def __init__(self) -> None:
        self._fallback = HeuristicSelector()

    def select(self, transcript: dict, analysis: dict, duration_sec: float, options: dict) -> list[dict]:
        try:
            return self._llm_select(transcript, analysis, duration_sec, options)
        except Exception as err:  # noqa: BLE001
            log.warning("LLM selection failed (%s); falling back to heuristic", err)
            return self._fallback.select(transcript, analysis, duration_sec, options)

    def _llm_select(self, transcript: dict, analysis: dict, duration_sec: float, options: dict) -> list[dict]:
        min_len, max_len = _window(options)
        seg_lines = "\n".join(
            f"[{s['startSec']:.1f}-{s['endSec']:.1f}] {s.get('speaker', '')}: {s['text']}" for s in transcript.get("segments", [])
        )
        guidance = options.get("prompt") or "none"
        system = (
            "You select the most viral short-form clips from any video genre using the transcript, "
            "scene structure, and audio context — not just talking-head heuristics. Score each clip 0-100 "
            "(hook/flow/value/trend, 25 each). Clips must start and end at natural boundaries, "
            f"run {min_len}-{max_len}s, and never overlap."
        )
        user = (
            f"Video duration: {duration_sec:.0f}s. Scenes: {len(analysis.get('scenes', []))}. "
            f"Requested clips: {options.get('clipCount') or 5}. Extra guidance: {guidance}\n\nTranscript:\n{seg_lines}"
        )
        res = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": settings.anthropic_model,
                "max_tokens": 3000,
                "system": system,
                "tools": [SELECT_TOOL_SCHEMA],
                "tool_choice": {"type": "tool", "name": "report_clips"},
                "messages": [{"role": "user", "content": user}],
            },
            timeout=120,
        )
        res.raise_for_status()
        blocks = res.json().get("content", [])
        tool_use = next(b for b in blocks if b.get("type") == "tool_use")
        clips = tool_use["input"]["clips"]
        out = []
        for c in clips:
            words = [s["text"] for s in transcript.get("segments", []) if s["startSec"] >= c["startSec"] and s["endSec"] <= c["endSec"]]
            out.append({**c, "transcriptText": " ".join(words)})
        out.sort(key=lambda c: -c["virality"]["total"])
        return out


def get_selector():
    if settings.anthropic_api_key:
        return AnthropicSelector()
    return HeuristicSelector()
