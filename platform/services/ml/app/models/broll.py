"""Generative B-roll seam ("Agent Opus" tier). Priced in credits.ts
(ADDON_COST.AI_VIDEO_BROLL); no vendor wired yet (text/image-to-video API
or self-hosted model). The EDL `broll` op and render path already exist for
stock/image assets once a generator produces an assetKey.
"""
from typing import Protocol


class BRollGenerator(Protocol):
    async def generate(self, prompt: str, duration_sec: float) -> dict:
        """Returns {assetKey} of a generated video asset."""
        ...


backend: BRollGenerator | None = None
