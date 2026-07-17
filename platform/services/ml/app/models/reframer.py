"""ReframeAnything: subject tracks → smoothed crop path.

A 1-D constant-velocity Kalman filter per axis smooths raw detector centers
into a stable virtual-camera move; scene cuts become step keyframes (the
camera jumps, it doesn't glide, across a cut). Output CropKeyframes are in
seconds RELATIVE TO CLIP START, ready for the render service's expression
builder.
"""


class _Kalman1D:
    def __init__(self, q: float = 4.0, r: float = 120.0) -> None:
        self.q = q  # process noise (how eager the camera is to move)
        self.r = r  # measurement noise (how jittery the detector is)
        self.x = 0.0
        self.v = 0.0
        self.p = 1e4
        self.initialized = False

    def update(self, z: float, dt: float) -> float:
        if not self.initialized:
            self.x, self.initialized = z, True
            return self.x
        # predict
        self.x += self.v * dt
        self.p += self.q * dt
        # update
        k = self.p / (self.p + self.r)
        innovation = z - self.x
        self.x += k * innovation
        self.v = 0.7 * self.v + 0.3 * (k * innovation / dt if dt > 0 else 0)
        self.p *= 1 - k
        return self.x


def plan_crop_path(
    clip_start: float,
    clip_end: float,
    face_tracks: list[dict],
    scenes: list[dict],
    width: int,
    height: int,
) -> dict:
    boxes = []
    for track in face_tracks or []:
        boxes.extend(b for b in track.get("boxes", []) if clip_start <= b["t"] <= clip_end)
    boxes.sort(key=lambda b: b["t"])

    if not boxes:
        # No subject: static center crop.
        return {
            "mode": "CENTER",
            "keyframes": [{"t": 0.0, "cx": width / 2, "cy": height / 2, "interp": "linear"}],
        }

    cuts = {round(s["startSec"], 2) for s in scenes or [] if clip_start < s["startSec"] < clip_end}

    kx, ky = _Kalman1D(), _Kalman1D()
    keyframes = []
    prev_t = boxes[0]["t"]
    for b in boxes:
        dt = max(0.01, b["t"] - prev_t)
        crossed_cut = any(prev_t < c <= b["t"] for c in cuts)
        if crossed_cut:
            kx, ky = _Kalman1D(), _Kalman1D()  # camera jumps at a cut
        cx = kx.update(b["cx"], dt)
        cy = ky.update(b["cy"], dt)
        keyframes.append(
            {
                "t": round(b["t"] - clip_start, 3),
                "cx": round(cx, 1),
                "cy": round(cy, 1),
                "interp": "step" if crossed_cut else "linear",
            }
        )
        prev_t = b["t"]

    # Thin to ~2 keyframes/sec max; the render side decimates further to its cap.
    thinned = [kf for i, kf in enumerate(keyframes) if i == 0 or kf["interp"] == "step" or i % 2 == 0]
    return {"mode": "FACE_TRACK", "keyframes": thinned}
