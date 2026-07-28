"""TTS / AI voice-over seam. Priced in credits.ts (ADDON_COST.VOICEOVER);
no vendor wired yet (commercial API or self-hosted XTTS-class both fit).
"""
from typing import Protocol


class TTSBackend(Protocol):
    async def synthesize(self, text: str, voice: str) -> dict:
        """Returns {audioKey, durationSec}."""
        ...


backend: TTSBackend | None = None
