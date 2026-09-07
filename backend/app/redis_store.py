from __future__ import annotations

import time
from pathlib import Path
from typing import AsyncIterator

import redis.asyncio as aioredis

from .schemas import RoomState

LUA_DIR = Path(__file__).parent / "lua"

# Reserved hash field holding the running sum. Lives inside the same hash as the
# client scores so the two share one key and one TTL -- see README for why.
SUM_FIELD = ":sum"

HISTOGRAM_BUCKETS = 5
BUCKET_WIDTH = 100 / HISTOGRAM_BUCKETS


def now_ms() -> int:
    return int(time.time() * 1000)


def _lua(name: str) -> str:
    return (LUA_DIR / f"{name}.lua").read_text(encoding="utf-8")


def agg_key(room_id: str) -> str:
    return f"room:{room_id}:agg"


def seen_key(room_id: str) -> str:
    return f"room:{room_id}:seen"


def channel(room_id: str) -> str:
    return f"room:{room_id}:events"


def room_id_from_channel(name: str) -> str:
    # "room:{id}:events" -> id. Safe to split on ':' because the id charset excludes it.
    return name.split(":")[1]


class RoomStore:
    """All room mutations go through Lua so the running sum can never race.

    Redis executes each EVAL to completion on a single thread, which is what
    makes read-modify-write of the sum safe without any locking.
    """

    def __init__(self, redis: aioredis.Redis, room_ttl_s: int) -> None:
        self.redis = redis
        self.room_ttl_s = room_ttl_s
        self._set_score = redis.register_script(_lua("set_score"))
        self._remove_client = redis.register_script(_lua("remove_client"))
        self._reap_stale = redis.register_script(_lua("reap_stale"))

    async def set_score(self, room_id: str, client_id: str, score: int) -> tuple[int, int]:
        sum_, count = await self._set_score(
            keys=[agg_key(room_id), seen_key(room_id)],
            args=[client_id, score, now_ms(), self.room_ttl_s],
        )
        return int(sum_), int(count)

    async def remove_client(self, room_id: str, client_id: str) -> tuple[int, int]:
        sum_, count = await self._remove_client(
            keys=[agg_key(room_id), seen_key(room_id)],
            args=[client_id],
        )
        return int(sum_), int(count)

    async def reap(self, room_id: str, cutoff_ms: int) -> tuple[int, int, int]:
        sum_, count, reaped = await self._reap_stale(
            keys=[agg_key(room_id), seen_key(room_id)],
            args=[cutoff_ms],
        )
        return int(sum_), int(count), int(reaped)

    async def touch(self, room_id: str, client_id: str) -> None:
        """Refresh a client's heartbeat so the reaper leaves them alone."""
        async with self.redis.pipeline(transaction=True) as pipe:
            pipe.zadd(seen_key(room_id), {client_id: now_ms()})
            pipe.expire(seen_key(room_id), self.room_ttl_s)
            await pipe.execute()

    async def exists(self, room_id: str) -> bool:
        return bool(await self.redis.exists(agg_key(room_id)))

    async def get_state(self, room_id: str) -> RoomState:
        # HGETALL rather than HVALS: the reserved sum field has to be filtered
        # out, otherwise it would land in the histogram as a student's score.
        raw = await self.redis.hgetall(agg_key(room_id))
        total = int(raw.pop(SUM_FIELD, 0) or 0)
        scores = [int(v) for v in raw.values()]
        count = len(scores)

        histogram = [0] * HISTOGRAM_BUCKETS
        for s in scores:
            idx = min(int(s // BUCKET_WIDTH), HISTOGRAM_BUCKETS - 1)
            histogram[idx] += 1

        return RoomState(
            room_id=room_id,
            average=round(total / count, 1) if count else 0.0,
            responding=count,
            histogram=histogram,
            ts=now_ms(),
        )

    async def iter_rooms(self) -> AsyncIterator[str]:
        """Enumerate live rooms for the reaper.

        SCAN, never KEYS -- KEYS blocks the whole server. SCAN's weak guarantees
        are fine here: a room missed on one pass is caught on the next, and the
        eviction script is idempotent, so overlapping sweeps cannot double-subtract.
        """
        async for key in self.redis.scan_iter(match="room:*:agg", count=100):
            yield key.split(":")[1]

    async def publish(self, room_id: str, payload: str) -> None:
        await self.redis.publish(channel(room_id), payload)
