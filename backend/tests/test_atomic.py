"""The load-bearing tests: proof that the running sum cannot race."""

from __future__ import annotations

import asyncio
import random

from app.redis_store import SUM_FIELD, agg_key, seen_key, now_ms

CLIENTS = 50
WRITES = 500


async def test_concurrent_writes_keep_sum_exact(store, redis, room):
    """Fire many overlapping updates and assert the running sum still matches
    the hash exactly. A read-modify-write implementation loses updates here."""
    clients = [f"c{i}" for i in range(CLIENTS)]
    rng = random.Random(1234)
    writes = [(rng.choice(clients), rng.randint(0, 100)) for _ in range(WRITES)]

    # Every client writes at least once, so the expected count is deterministic.
    writes = [(c, rng.randint(0, 100)) for c in clients] + writes

    # Bounded so the client pool is not the thing under test; 64-way overlap
    # is still far more interleaving than a lost-update bug could survive.
    sem = asyncio.Semaphore(64)

    async def write(client_id: str, score: int) -> None:
        async with sem:
            await store.set_score(room, client_id, score)

    await asyncio.gather(*(write(c, s) for c, s in writes))

    raw = await redis.hgetall(agg_key(room))
    stored_sum = int(raw.pop(SUM_FIELD))
    actual_sum = sum(int(v) for v in raw.values())

    assert stored_sum == actual_sum
    assert len(raw) == CLIENTS

    state = await store.get_state(room)
    assert state.responding == CLIENTS
    assert state.average == round(actual_sum / CLIENTS, 1)
    assert sum(state.histogram) == CLIENTS


async def test_resliding_adjusts_by_delta_not_double_count(store, room):
    await store.set_score(room, "alice", 80)
    await store.set_score(room, "alice", 10)
    state = await store.get_state(room)
    assert state.responding == 1
    assert state.average == 10.0


async def test_remove_is_idempotent(store, room):
    await store.set_score(room, "alice", 10)
    await store.set_score(room, "bob", 40)

    assert await store.remove_client(room, "bob") == (10, 1)
    # A WS disconnect racing the reaper must not subtract twice.
    assert await store.remove_client(room, "bob") == (10, 1)

    state = await store.get_state(room)
    assert state.average == 10.0
    assert state.responding == 1


async def test_reaper_evicts_only_stale_clients(store, redis, room):
    await store.set_score(room, "alice", 80)
    await store.set_score(room, "bob", 40)

    # Backdate alice's heartbeat past the cutoff.
    cutoff = now_ms()
    await redis.zadd(seen_key(room), {"alice": cutoff - 60_000})

    total, count, reaped = await store.reap(room, cutoff - 1000)
    assert (total, count, reaped) == (40, 1, 1)

    state = await store.get_state(room)
    assert state.average == 40.0
    assert state.responding == 1


async def test_last_client_leaving_clears_the_room(store, redis, room):
    await store.set_score(room, "alice", 80)
    await store.remove_client(room, "alice")

    assert await redis.exists(agg_key(room)) == 0
    state = await store.get_state(room)
    assert state.responding == 0
    assert state.average == 0.0
