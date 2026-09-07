from __future__ import annotations

import asyncio
import logging

from .redis_store import RoomStore, now_ms
from .ws import ConnectionManager

log = logging.getLogger(__name__)


async def reap_loop(
    store: RoomStore,
    manager: ConnectionManager,
    interval_s: int,
    stale_after_s: int,
) -> None:
    """Evict clients that stopped heartbeating.

    A laptop lid closing does not always produce a clean WebSocket close, and a
    departed student's score would otherwise skew the average until the room's
    TTL expires.
    """
    while True:
        try:
            await asyncio.sleep(interval_s)
            cutoff = now_ms() - stale_after_s * 1000
            async for room_id in store.iter_rooms():
                _, _, reaped = await store.reap(room_id, cutoff)
                if reaped:
                    log.info("reaped %d stale client(s) from room %s", reaped, room_id)
                    manager.mark_dirty(room_id)
        except asyncio.CancelledError:
            raise
        except Exception:  # one bad sweep must not end the loop
            log.exception("reaper sweep failed")
