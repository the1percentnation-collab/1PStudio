"""Vision seam: scene boundaries + face/subject tracks.

Real implementations (PySceneDetect / TransNet, YOLO+ByteTrack, RetinaFace)
drop in behind these two functions without touching the pipeline. The mocks
are deterministic (hash-seeded) and shaped exactly like real detector output.
"""
import math
import random

from .seeds import stable_seed


def detect_scenes(content_hash: str, duration_sec: float) -> list[dict]:
    rng = random.Random(stable_seed(content_hash, 'scenes'))
    scenes = []
    t = 0.0
    while t < duration_sec:
        length = 5.0 + rng.random() * 9.0
        end = min(duration_sec, t + length)
        scenes.append({"startSec": round(t, 2), "endSec": round(end, 2)})
        t = end
    return scenes


def track_faces(content_hash: str, duration_sec: float, width: int, height: int) -> list[dict]:
    """One primary subject drifting around the frame center — enough to
    exercise the Kalman smoother and produce a visibly moving crop path."""
    rng = random.Random(stable_seed(content_hash, 'faces'))
    phase = rng.random() * math.tau
    amp_x = width * (0.12 + rng.random() * 0.1)
    amp_y = height * 0.04
    boxes = []
    t = 0.0
    while t <= duration_sec:
        cx = width / 2 + amp_x * math.sin(0.35 * t + phase) + rng.gauss(0, width * 0.01)
        cy = height * 0.42 + amp_y * math.sin(0.2 * t) + rng.gauss(0, height * 0.008)
        boxes.append(
            {
                "t": round(t, 2),
                "cx": round(max(0, min(width, cx)), 1),
                "cy": round(max(0, min(height, cy)), 1),
                "w": round(width * 0.18, 1),
                "h": round(height * 0.32, 1),
            }
        )
        t += 0.5
    return [{"id": "face-1", "boxes": boxes}]
