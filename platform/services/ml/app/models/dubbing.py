"""Dubbing seam (ASR → MT → TTS → timeline re-fit). Priced in credits.ts
(ADDON_COST.DUBBING); no vendor wired yet. Implement DubbingBackend and set
`backend` to light it up — the /edit router and EDL `dub` op already exist.
"""
from typing import Protocol


class DubbingBackend(Protocol):
    async def dub(self, source_key: str, target_language: str) -> dict:
        """Returns {audioKey, language} for a re-voiced track."""
        ...


backend: DubbingBackend | None = None
