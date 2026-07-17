import logging

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from . import cache
from .models import audio, captioner, editor, reframer, vision
from .models.asr import get_backend as get_asr
from .models.selector import get_selector

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="1P Clip — ML service", version="0.1.0")


@app.get("/healthz")
async def healthz() -> dict:
    return {"ok": True, "service": "ml"}


# ---------- /transcribe ----------

class TranscribeIn(BaseModel):
    sourceKey: str
    contentHash: str
    durationSec: float
    language: str | None = None


@app.post("/transcribe")
async def transcribe(body: TranscribeIn) -> dict:
    params = {"language": body.language, "v": 1}
    hit = await cache.get("transcribe", body.contentHash, params)
    if hit is not None:
        return hit
    result = await get_asr().transcribe(body.sourceKey, body.durationSec, body.language)
    await cache.put("transcribe", body.contentHash, params, result)
    return result


# ---------- /analyze ----------

class AnalyzeIn(BaseModel):
    sourceKey: str
    contentHash: str
    durationSec: float
    width: int
    height: int
    fps: float = 30


@app.post("/analyze")
async def analyze(body: AnalyzeIn) -> dict:
    params = {"v": 1}
    hit = await cache.get("analyze", body.contentHash, params)
    if hit is not None:
        return hit
    result = {
        "scenes": vision.detect_scenes(body.contentHash, body.durationSec),
        "faceTracks": vision.track_faces(body.contentHash, body.durationSec, body.width, body.height),
        "audioEnergy": audio.energy_curve(body.contentHash, body.durationSec),
    }
    await cache.put("analyze", body.contentHash, params, result)
    return result


# ---------- /select ----------

class SelectIn(BaseModel):
    contentHash: str
    durationSec: float
    transcript: dict
    analysis: dict
    options: dict = Field(default_factory=dict)


@app.post("/select")
async def select(body: SelectIn) -> dict:
    candidates = get_selector().select(body.transcript, body.analysis, body.durationSec, body.options)
    return {"candidates": candidates}


# ---------- /reframe-plan ----------

class ReframeIn(BaseModel):
    clipStartSec: float
    clipEndSec: float
    faceTracks: list[dict] = Field(default_factory=list)
    scenes: list[dict] = Field(default_factory=list)
    width: int
    height: int
    aspect: str = "9:16"


@app.post("/reframe-plan")
async def reframe_plan(body: ReframeIn) -> dict:
    plan = reframer.plan_crop_path(
        body.clipStartSec, body.clipEndSec, body.faceTracks, body.scenes, body.width, body.height
    )
    return {**plan, "aspect": body.aspect}


# ---------- /caption ----------

class CaptionIn(BaseModel):
    clipStartSec: float
    clipEndSec: float
    transcript: dict
    language: str | None = None


@app.post("/caption")
async def caption(body: CaptionIn) -> dict:
    lines = captioner.build_captions(body.transcript.get("words", []), body.clipStartSec, body.clipEndSec)
    return {"language": body.language or body.transcript.get("language", "en"), "lines": lines}


# ---------- /edit ----------

class EditIn(BaseModel):
    clipStartSec: float
    clipEndSec: float
    transcript: dict
    captionLines: list[dict] = Field(default_factory=list)
    removeFillers: bool = False


@app.post("/edit")
async def edit(body: EditIn) -> dict:
    ops: list[dict] = []
    lines = body.captionLines
    if body.removeFillers:
        ranges = editor.find_filler_ranges(body.transcript.get("words", []), body.clipStartSec, body.clipEndSec)
        if ranges:
            ops.append({"kind": "removeFiller", "ranges": ranges})
            lines = editor.remap_captions(lines, ranges)
    return {"ops": ops, "captionLines": lines}


# ---------- priced-but-stubbed capabilities (clean seams, typed 501s) ----------

@app.post("/dub")
async def dub() -> dict:
    raise HTTPException(status_code=501, detail={"code": "NOT_WIRED", "capability": "dubbing", "seam": "app/models/dubbing.py"})


@app.post("/tts")
async def tts() -> dict:
    raise HTTPException(status_code=501, detail={"code": "NOT_WIRED", "capability": "voiceover", "seam": "app/models/tts.py"})


@app.post("/broll/generate")
async def broll_generate() -> dict:
    raise HTTPException(status_code=501, detail={"code": "NOT_WIRED", "capability": "ai_video_broll", "seam": "app/models/broll.py"})
