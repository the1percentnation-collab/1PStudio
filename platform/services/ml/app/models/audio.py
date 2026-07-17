"""Audio-event seam: energy curve (used for silence/peak detection).

A real implementation runs ffmpeg astats/loudnorm over the media; the mock
synthesizes a plausible speech-energy curve deterministically.
"""
import math
import random

from .seeds import stable_seed


def energy_curve(content_hash: str, duration_sec: float) -> list[dict]:
    rng = random.Random(stable_seed(content_hash, 'audio'))
    points = []
    t = 0.0
    while t <= duration_sec:
        base = 0.5 + 0.3 * math.sin(0.8 * t + rng.random())
        rms = max(0.02, min(1.0, base + rng.gauss(0, 0.08)))
        points.append({"t": round(t, 2), "rms": round(rms, 3)})
        t += 1.0
    return points
