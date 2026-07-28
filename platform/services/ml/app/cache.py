"""Content-hash caching — the dominant cost lever.

Whole-video stage results (transcribe, analyze) are keyed by
(stage, contentHash, params-hash): an identical source is analyzed once,
ever, across all tenants. Backed by Redis; degrades to an in-process dict
when Redis is unreachable so local dev never blocks on it.
"""
import functools
import hashlib
import json
import logging
from typing import Any, Awaitable, Callable

import redis.asyncio as aioredis

from .config import settings

log = logging.getLogger("ml.cache")

_redis: aioredis.Redis | None = None
_local: dict[str, str] = {}
TTL_SECONDS = 30 * 24 * 3600


def _client() -> aioredis.Redis | None:
    global _redis
    if _redis is None:
        try:
            _redis = aioredis.from_url(settings.redis_url, socket_connect_timeout=1)
        except Exception:  # noqa: BLE001
            return None
    return _redis


def _key(stage: str, content_hash: str, params: Any) -> str:
    p = hashlib.sha256(json.dumps(params, sort_keys=True, default=str).encode()).hexdigest()[:16]
    return f"mlcache:{stage}:{content_hash}:{p}"


async def get(stage: str, content_hash: str, params: Any) -> Any | None:
    key = _key(stage, content_hash, params)
    client = _client()
    if client:
        try:
            raw = await client.get(key)
            if raw:
                log.info("cache HIT %s", key)
                return json.loads(raw)
        except Exception:  # noqa: BLE001
            pass
    if key in _local:
        log.info("cache HIT (local) %s", key)
        return json.loads(_local[key])
    return None


async def put(stage: str, content_hash: str, params: Any, value: Any) -> None:
    key = _key(stage, content_hash, params)
    raw = json.dumps(value)
    client = _client()
    if client:
        try:
            await client.set(key, raw, ex=TTL_SECONDS)
            return
        except Exception:  # noqa: BLE001
            pass
    _local[key] = raw


def cached(stage: str) -> Callable:
    """Decorator for endpoint helpers taking (content_hash, params) -> dict."""

    def deco(fn: Callable[..., Awaitable[Any]]) -> Callable[..., Awaitable[Any]]:
        @functools.wraps(fn)
        async def wrapper(content_hash: str, params: Any, *args: Any, **kwargs: Any) -> Any:
            hit = await get(stage, content_hash, params)
            if hit is not None:
                return hit
            value = await fn(content_hash, params, *args, **kwargs)
            await put(stage, content_hash, params, value)
            return value

        return wrapper

    return deco
