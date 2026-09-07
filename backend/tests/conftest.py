from __future__ import annotations

import os
import uuid

import pytest
import pytest_asyncio
import redis.asyncio as aioredis

from app.redis_store import RoomStore, agg_key, seen_key

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")


@pytest_asyncio.fixture
async def redis():
    client = aioredis.from_url(REDIS_URL, decode_responses=True, max_connections=128)
    try:
        await client.ping()
    except Exception:
        await client.aclose()
        pytest.skip(f"no Redis at {REDIS_URL} -- run `docker compose up -d redis`")
    yield client
    await client.aclose()


@pytest_asyncio.fixture
async def store(redis):
    # Real Redis rather than fakeredis: the Lua path is the thing under test.
    return RoomStore(redis, room_ttl_s=60)


@pytest_asyncio.fixture
async def room(redis):
    """A room id unique to this test, cleaned up afterwards."""
    room_id = f"test-{uuid.uuid4().hex[:12]}"
    yield room_id
    await redis.delete(agg_key(room_id), seen_key(room_id))
