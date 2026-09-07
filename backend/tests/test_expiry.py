"""Regression test for the bug the single-hash layout exists to prevent.

With scores/sum/count as three separate keys, Redis expires them independently.
If the scores hash vanishes a moment before the sum does, the next write sees
HGET -> nil, treats a returning client as brand new, and adds their score on top
of a sum that was never cleared. The average is then silently wrong forever.

Co-locating the sum inside the scores hash makes partial expiry unrepresentable.
"""

from __future__ import annotations

from app.redis_store import agg_key


async def test_write_after_expiry_does_not_inherit_a_stale_sum(store, redis, room):
    await store.set_score(room, "alice", 80)
    await store.set_score(room, "bob", 60)

    # Simulate the room's TTL elapsing between one write and the next.
    await redis.delete(agg_key(room))

    total, count = await store.set_score(room, "alice", 30)

    # Not 170, and not 2 participants.
    assert (total, count) == (30, 1)

    state = await store.get_state(room)
    assert state.average == 30.0
    assert state.responding == 1


async def test_expiry_of_seen_zset_alone_is_harmless(store, redis, room):
    """The heartbeat ZSET is advisory. Losing it can only cost a missed reap;
    it can never corrupt the average."""
    from app.redis_store import seen_key

    await store.set_score(room, "alice", 40)
    await redis.delete(seen_key(room))

    state = await store.get_state(room)
    assert state.average == 40.0
    assert state.responding == 1
