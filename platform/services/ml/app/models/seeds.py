"""Stable seeds: Python's hash() is salted per process, so mocks must not use it."""
import hashlib


def stable_seed(*parts: str) -> int:
    digest = hashlib.sha256("|".join(parts).encode()).hexdigest()
    return int(digest[:12], 16)
