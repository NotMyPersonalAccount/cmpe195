"""Regression tests for the per-connection write throttle.

The first version of this was a plain rate limiter: anything arriving inside the
window was dropped. That silently discards the *last* message of a drag, so a
student who slides to 80 and lets go gets recorded at whatever earlier sample
happened to survive -- and the room average is quietly wrong for the rest of the
lecture. ScoreWriter coalesces instead of dropping.
"""

from __future__ import annotations

import asyncio

from app.config import settings
from app.ws import ConnectionManager, ScoreWriter

INTERVAL = settings.min_score_interval_ms / 1000


class _SpyManager(ConnectionManager):
    def __init__(self, store):
        super().__init__(store)
        self.dirty_marks = 0

    def mark_dirty(self, room_id: str) -> None:
        self.dirty_marks += 1
        super().mark_dirty(room_id)


async def test_final_value_of_a_burst_always_lands(store, room):
    """The bug this file exists for: drag fast, let go, and the resting value
    must be what the room records."""
    writer = ScoreWriter(store, _SpyManager(store), room, "alice")

    for value in range(0, 81, 10):  # ends on 80
        await writer.submit(value)
        await asyncio.sleep(0.005)  # far faster than the throttle window

    await asyncio.sleep(INTERVAL * 3)  # let the trailing flush fire
    await writer.close()

    state = await store.get_state(room)
    assert state.average == 80.0, "the value the student let go on must be the one stored"
    assert state.responding == 1


async def test_burst_is_rate_capped_not_written_per_message(store, room):
    """Coalescing must still cap the write rate -- otherwise it is not a throttle."""
    manager = _SpyManager(store)
    writer = ScoreWriter(store, manager, room, "alice")

    for value in range(50):
        await writer.submit(value)

    await asyncio.sleep(INTERVAL * 3)
    await writer.close()

    # 50 messages sent back-to-back collapse to the leading write plus one
    # trailing flush, not 50 round-trips to Redis.
    assert manager.dirty_marks < 50
    assert manager.dirty_marks >= 1


async def test_a_slow_slider_writes_every_value(store, room):
    """Moving slower than the window is never throttled at all."""
    manager = _SpyManager(store)
    writer = ScoreWriter(store, manager, room, "alice")

    for value in (10, 20, 30):
        await writer.submit(value)
        await asyncio.sleep(INTERVAL * 2)

    await writer.close()

    assert manager.dirty_marks == 3
    state = await store.get_state(room)
    assert state.average == 30.0


async def test_close_cancels_a_pending_flush(store, room):
    """A disconnect mid-window must not leave a task writing after cleanup."""
    writer = ScoreWriter(store, _SpyManager(store), room, "alice")

    await writer.submit(10)
    await writer.submit(20)  # queued behind the window
    await writer.close()

    await asyncio.sleep(INTERVAL * 3)
    # The pending 20 was dropped by the cancel; the leading 10 stands.
    state = await store.get_state(room)
    assert state.average == 10.0
