from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.redis_store import agg_key, seen_key


@pytest.fixture
def client(redis_sync_check):
    app = create_app()
    with TestClient(app) as c:
        yield c


@pytest.fixture
def redis_sync_check():
    """TestClient runs its own loop, so reuse the async fixture's URL check only."""
    import redis as sync_redis

    from tests.conftest import REDIS_URL

    r = sync_redis.from_url(REDIS_URL, decode_responses=True)
    try:
        r.ping()
    except Exception:
        pytest.skip(f"no Redis at {REDIS_URL} -- run `docker compose up -d redis`")
    yield r
    r.close()


def _recv_state(ws):
    msg = json.loads(ws.receive_text())
    assert msg["type"] == "state"
    return msg


def test_socket_sends_state_on_connect(client, redis_sync_check):
    room = "wstest-connect"
    redis_sync_check.delete(agg_key(room), seen_key(room))
    with client.websocket_connect(f"/ws/rooms/{room}?client_id=alice") as ws:
        state = _recv_state(ws)
        assert state["responding"] == 0
        assert state["average"] == 0.0
    redis_sync_check.delete(agg_key(room), seen_key(room))


def test_connecting_alone_does_not_count_you(client, redis_sync_check):
    """Opening the page without touching the slider must not enter the average."""
    room = "wstest-presence"
    redis_sync_check.delete(agg_key(room), seen_key(room))
    with client.websocket_connect(f"/ws/rooms/{room}?client_id=alice") as ws:
        _recv_state(ws)
        assert redis_sync_check.hlen(agg_key(room)) == 0
    redis_sync_check.delete(agg_key(room), seen_key(room))


def test_dashboards_are_read_only(client, redis_sync_check):
    room = "wstest-dash"
    redis_sync_check.delete(agg_key(room), seen_key(room))
    with client.websocket_connect(
        f"/ws/rooms/{room}?client_id=watcher&role=dashboard"
    ) as ws:
        _recv_state(ws)
        ws.send_json({"type": "score", "value": 90})
        err = json.loads(ws.receive_text())
        assert err["type"] == "error"
        assert redis_sync_check.hlen(agg_key(room)) == 0
    redis_sync_check.delete(agg_key(room), seen_key(room))


def test_invalid_score_is_rejected(client, redis_sync_check):
    room = "wstest-badscore"
    redis_sync_check.delete(agg_key(room), seen_key(room))
    with client.websocket_connect(f"/ws/rooms/{room}?client_id=alice") as ws:
        _recv_state(ws)
        ws.send_json({"type": "score", "value": 150})
        err = json.loads(ws.receive_text())
        assert err["type"] == "error"
        assert redis_sync_check.hlen(agg_key(room)) == 0
    redis_sync_check.delete(agg_key(room), seen_key(room))


@pytest.mark.parametrize(
    "url",
    [
        "/ws/rooms/bad room?client_id=alice",
        "/ws/rooms/ok?client_id=bad:id",
        "/ws/rooms/ok?client_id=alice&role=admin",
    ],
)
def test_invalid_handshakes_are_closed(client, redis_sync_check, url):
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(url) as ws:
            ws.receive_text()


def test_score_reaches_redis_and_clears_on_disconnect(client, redis_sync_check):
    room = "wstest-score"
    redis_sync_check.delete(agg_key(room), seen_key(room))
    with client.websocket_connect(f"/ws/rooms/{room}?client_id=alice") as ws:
        _recv_state(ws)
        ws.send_json({"type": "score", "value": 60})
        # Broadcast is coalesced on a timer; read Redis directly instead of racing it.
        for _ in range(50):
            if redis_sync_check.hget(agg_key(room), "alice") == "60":
                break
            import time

            time.sleep(0.02)
        assert redis_sync_check.hget(agg_key(room), "alice") == "60"

    # Clean disconnect removes the client from the average.
    assert redis_sync_check.exists(agg_key(room)) == 0
    redis_sync_check.delete(agg_key(room), seen_key(room))
