"""ASR seam. Swap the vendor by editing this file only.

Backends:
- FasterWhisperASR — real transcription + word timings (needs faster-whisper installed).
- MockASR — deterministic, hash-seeded transcript so the whole pipeline runs
  end-to-end on CPU with no models and produces stable, testable output.
"""
import logging
import random
import tempfile
from typing import Protocol

from ..config import settings
from .seeds import stable_seed
from ..storage import download

log = logging.getLogger("ml.asr")


class ASRBackend(Protocol):
    async def transcribe(self, source_key: str, duration_sec: float, language: str | None) -> dict: ...


# Mock corpus: brand-voice-adjacent motivational sentences (matches the 1P
# Studio niche so mock clips look plausible in the UI).
_SENTENCES = [
    "you keep waiting for permission that is never coming",
    "nobody is going to save you and that is the best news you have ever heard",
    "the difference between you and the person you admire is not talent",
    "stop negotiating with your excuses every single morning",
    "your comfort zone is a beautifully decorated prison",
    "discipline is choosing what you want most over what you want now",
    "you are one decision away from a completely different life",
    "the version of you that wins is built on the days you did not feel like it",
    "accountability is not punishment it is ownership",
    "your identity is not fixed it is a habit you keep repeating",
    "leaders eat criticism for breakfast and keep moving",
    "purpose is not found it is forged under pressure",
    "um so like the thing is you already know what to do",
    "money follows value and value follows discipline",
    "the market does not care about your feelings it cares about your consistency",
    "every excuse you make is a vote for the person you do not want to be",
]

_FILLERS = ["um", "uh", "like", "you know", "so"]


class MockASR:
    async def transcribe(self, source_key: str, duration_sec: float, language: str | None) -> dict:
        seed = stable_seed(source_key)
        rng = random.Random(seed)
        words: list[dict] = []
        segments: list[dict] = []
        t = 0.3
        i = 0
        while t < duration_sec - 1.0:
            sentence = _SENTENCES[(seed + i) % len(_SENTENCES)]
            if rng.random() < 0.25:
                sentence = f"{rng.choice(_FILLERS)} {sentence}"
            seg_start = t
            seg_words = []
            for w in sentence.split(" "):
                dur = 0.18 + min(0.5, len(w) * 0.045) + rng.random() * 0.08
                if t + dur > duration_sec:
                    break
                seg_words.append({"word": w, "startSec": round(t, 3), "endSec": round(t + dur, 3)})
                t += dur + 0.06
            if not seg_words:
                break
            words.extend(seg_words)
            segments.append(
                {
                    "startSec": seg_words[0]["startSec"],
                    "endSec": seg_words[-1]["endSec"],
                    "text": " ".join(w["word"] for w in seg_words),
                    "speaker": f"S{(i % 2) + 1}",
                }
            )
            t += 0.5 + rng.random() * 1.2  # inter-sentence pause
            i += 1
        return {"language": language or "en", "words": words, "segments": segments}


class FasterWhisperASR:
    def __init__(self) -> None:
        from faster_whisper import WhisperModel  # noqa: PLC0415

        self._model = WhisperModel("base", device="auto", compute_type="int8")

    async def transcribe(self, source_key: str, duration_sec: float, language: str | None) -> dict:
        with tempfile.NamedTemporaryFile(suffix=".mp4") as tmp:
            download(source_key, tmp.name)
            seg_iter, info = self._model.transcribe(tmp.name, language=language, word_timestamps=True)
            words: list[dict] = []
            segments: list[dict] = []
            for seg in seg_iter:
                segments.append({"startSec": seg.start, "endSec": seg.end, "text": seg.text.strip()})
                for w in seg.words or []:
                    words.append({"word": w.word.strip(), "startSec": w.start, "endSec": w.end})
            return {"language": info.language, "words": words, "segments": segments}


_backend: ASRBackend | None = None


def get_backend() -> ASRBackend:
    global _backend
    if _backend is not None:
        return _backend
    mode = settings.asr_backend
    if mode in ("auto", "whisper"):
        try:
            _backend = FasterWhisperASR()
            log.info("ASR backend: faster-whisper")
            return _backend
        except Exception as err:  # noqa: BLE001
            if mode == "whisper":
                raise
            log.info("faster-whisper unavailable (%s); using MockASR", err)
    _backend = MockASR()
    log.info("ASR backend: mock")
    return _backend
