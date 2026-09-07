from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import create_app
from app.redis_store import agg_key, seen_key


@pytest_asyncio.fixture
async def client(redis):
    app = create_app()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        # Exercise the real lifespan so app.state is populated as in production.
        async with app.router.lifespan_context(app):
            yield ac


async def test_healthz(client):
    r = await client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["ok"] is True


async def test_create_room_returns_a_usable_code(client):
    r = await client.post("/api/rooms")
    assert r.status_code == 200
    code = r.json()["room_id"]
    assert len(code) == 6
    assert code.isalnum()


async def test_score_roundtrip(client, redis, room):
    r = await client.post(f"/api/rooms/{room}/score", json={"client_id": "alice", "score": 70})
    assert r.status_code == 200
    assert r.json()["average"] == 70.0
    assert r.json()["responding"] == 1

    r = await client.post(f"/api/rooms/{room}/score", json={"client_id": "bob", "score": 30})
    assert r.json()["average"] == 50.0

    r = await client.get(f"/api/rooms/{room}")
    assert r.json()["average"] == 50.0
    assert r.json()["histogram"] == [0, 1, 0, 1, 0]

    r = await client.delete(f"/api/rooms/{room}/clients/bob")
    assert r.json()["average"] == 70.0


async def test_empty_room_reads_as_zero(client, room):
    r = await client.get(f"/api/rooms/{room}")
    assert r.status_code == 200
    assert r.json() == {
        "room_id": room,
        "average": 0.0,
        "responding": 0,
        "histogram": [0, 0, 0, 0, 0],
        "ts": r.json()["ts"],
    }


@pytest.mark.parametrize("bad", ["has space", "has:colon", "x" * 33])
async def test_bad_room_id_is_rejected_before_touching_redis(client, bad):
    r = await client.get(f"/api/rooms/{bad}")
    assert r.status_code == 422


async def test_empty_room_id_never_succeeds(client):
    # Hits FastAPI's trailing-slash redirect toward the create endpoint rather
    # than our validator, so the invariant to assert is simply that it fails.
    r = await client.get("/api/rooms/")
    assert r.status_code != 200


@pytest.mark.parametrize("bad_score", [-1, 101, 1000])
async def test_out_of_range_score_is_rejected(client, room, bad_score):
    r = await client.post(
        f"/api/rooms/{room}/score", json={"client_id": "alice", "score": bad_score}
    )
    assert r.status_code == 422


async def test_reserved_sum_field_is_unreachable_as_a_client_id(client, room):
    r = await client.post(f"/api/rooms/{room}/score", json={"client_id": ":sum", "score": 50})
    assert r.status_code == 422


async def test_unknown_api_path_404s_as_json_not_as_the_spa(client):
    """The SPA fallback must not swallow the API surface -- a mistyped endpoint
    has to fail loudly, not return a page with status 200."""
    r = await client.get("/api/rooms/ROOM/nonsense")
    assert r.status_code == 404
    assert r.headers["content-type"].startswith("application/json")


async def test_client_routes_fall_back_to_the_app_shell(client):
    """Deep links are React routes, not files: a page load of /dash/X must serve
    index.html rather than 404."""
    for path in ("/dash/CMPE195", "/r/CMPE195"):
        r = await client.get(path)
        assert r.status_code == 200, path
        assert r.headers["content-type"].startswith("text/html"), path
