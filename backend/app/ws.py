from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from .config import settings
from .redis_store import RoomStore
from .schemas import state_message, valid_id

log = logging.getLogger(__name__)
router = APIRouter()

# A broadcast frame a client cannot accept within this window costs it the
# connection; the room's other listeners matter more than one stalled socket.
SEND_TIMEOUT_S = 5.0


class ScoreWriter:
    """Rate-caps one connection's writes without ever losing the final value.

    A plain rate limiter drops whatever arrives inside the window, which can
    discard the *last* message of a drag -- so a student who slides to 80 and
    lets go is recorded at wherever the last surviving sample landed. This holds
    the newest value instead and flushes it when the window closes, giving the
    same trailing-edge guarantee the client-side throttle has.
    """

    def __init__(self, store: RoomStore, manager: "ConnectionManager", room_id: str, client_id: str) -> None:
        self._store = store
        self._manager = manager
        self._room_id = room_id
        self._client_id = client_id
        self._interval = settings.min_score_interval_ms / 1000
        self._pending: int | None = None
        self._flush: asyncio.Task | None = None
        self._last_write = 0.0

    async def submit(self, value: int) -> None:
        loop = asyncio.get_running_loop()
        if self._flush is None and loop.time() - self._last_write >= self._interval:
            await self._write(value)
            return
        self._pending = value
        if self._flush is None:
            self._flush = asyncio.create_task(self._flush_after())

    async def _write(self, value: int) -> None:
        self._last_write = asyncio.get_running_loop().time()
        await self._store.set_score(self._room_id, self._client_id, value)
        self._manager.mark_dirty(self._room_id)

    async def _flush_after(self) -> None:
        try:
            await asyncio.sleep(self._interval)
            if self._pending is not None:
                value, self._pending = self._pending, None
                await self._write(value)
        except asyncio.CancelledError:
            pass
        finally:
            self._flush = None

    async def close(self) -> None:
        if self._flush:
            self._flush.cancel()
            self._flush = None


class ConnectionManager:
    """Local WebSocket registry plus the per-room broadcast ticker.

    Updates are written to Redis immediately but broadcast on a timer: a slider
    drag fires continuously, and without coalescing 200 students dragging at
    once would produce an O(n^2) message storm.
    """

    def __init__(self, store: RoomStore) -> None:
        self.store = store
        self._rooms: dict[str, set[WebSocket]] = {}
        self._dirty: set[str] = set()
        self._tickers: dict[str, asyncio.Task] = {}

    async def connect(self, room_id: str, ws: WebSocket) -> None:
        conns = self._rooms.setdefault(room_id, set())
        first = not conns
        conns.add(ws)
        # Ticker lives exactly as long as the room has local listeners. Without
        # the matching cancel in disconnect(), every room ever opened would leak
        # a task for the life of the process.
        if first:
            self._tickers[room_id] = asyncio.create_task(self._tick(room_id))

    async def disconnect(self, room_id: str, ws: WebSocket) -> None:
        conns = self._rooms.get(room_id)
        if not conns:
            return
        conns.discard(ws)
        if conns:
            return
        self._rooms.pop(room_id, None)
        task = self._tickers.pop(room_id, None)
        if task:
            task.cancel()

    def mark_dirty(self, room_id: str) -> None:
        self._dirty.add(room_id)

    def has_listeners(self, room_id: str) -> bool:
        """Whether this worker still has a ticker that will publish the room."""
        return bool(self._rooms.get(room_id))

    async def _tick(self, room_id: str) -> None:
        interval = settings.broadcast_ms / 1000
        try:
            while True:
                await asyncio.sleep(interval)
                if room_id not in self._dirty:
                    continue
                self._dirty.discard(room_id)
                try:
                    state = await self.store.get_state(room_id)
                    await self.store.publish(room_id, state_message(state))
                except Exception:  # a transient Redis error must not kill the ticker
                    log.exception("broadcast tick failed for room %s", room_id)
        except asyncio.CancelledError:
            pass


    async def fanout(self, room_id: str, payload: str) -> None:
        """Push a published payload to this worker's sockets for the room.

        Sends run concurrently and under a timeout: done sequentially, a single
        client whose receive buffer has filled would stall the broadcast for
        everyone else in the room. A socket that cannot accept a frame in time
        is dropped rather than allowed to hold the room up.
        """
        conns = list(self._rooms.get(room_id, ()))
        if not conns:
            return

        async def send(ws: WebSocket) -> None:
            await asyncio.wait_for(ws.send_text(payload), timeout=SEND_TIMEOUT_S)

        results = await asyncio.gather(*(send(ws) for ws in conns), return_exceptions=True)
        for ws, result in zip(conns, results):
            if isinstance(result, BaseException):
                await self.disconnect(room_id, ws)

    async def shutdown(self) -> None:
        for task in self._tickers.values():
            task.cancel()
        self._tickers.clear()


async def pubsub_listener(redis, manager: ConnectionManager) -> None:
    """Bridge Redis pub/sub into local sockets.

    One pattern subscription for every room, rather than subscribing and
    unsubscribing as rooms come and go. Uses its own connection because a
    subscribed Redis connection cannot run normal commands.
    """
    pubsub = redis.pubsub(ignore_subscribe_messages=True)
    await pubsub.psubscribe("room:*:events")
    try:
        async for message in pubsub.listen():
            if message.get("type") != "pmessage":
                continue
            room_id = message["channel"].split(":")[1]
            await manager.fanout(room_id, message["data"])
    except asyncio.CancelledError:
        pass
    finally:
        await pubsub.aclose()


@router.websocket("/ws/rooms/{room_id}")
async def room_socket(
    ws: WebSocket,
    room_id: str,
    client_id: str = Query(...),
    role: str = Query("student"),
) -> None:
    if not valid_id(room_id) or not valid_id(client_id):
        await ws.close(code=1008, reason="invalid room_id or client_id")
        return
    if role not in ("student", "dashboard"):
        await ws.close(code=1008, reason="invalid role")
        return

    store: RoomStore = ws.app.state.store
    manager: ConnectionManager = ws.app.state.manager

    await ws.accept()
    await manager.connect(room_id, ws)

    # Send current state immediately so a joiner is not blank until someone moves.
    state = await store.get_state(room_id)
    await ws.send_text(state_message(state))

    writer = ScoreWriter(store, manager, room_id, client_id)
    try:
        while True:
            msg = await ws.receive_json()
            kind = msg.get("type")

            if kind == "ping":
                # Dashboards stay out of presence tracking entirely; a watching
                # instructor should not appear in the reaper's heartbeat set.
                if role == "student":
                    await store.touch(room_id, client_id)

            elif kind == "score":
                if role != "student":
                    await ws.send_json({"type": "error", "detail": "dashboards are read-only"})
                    continue
                value = msg.get("value")
                if not isinstance(value, int) or not 0 <= value <= 100:
                    await ws.send_json({"type": "error", "detail": "score must be an int 0-100"})
                    continue
                await writer.submit(value)

            else:
                await ws.send_json({"type": "error", "detail": f"unknown message type {kind!r}"})

    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("socket error in room %s", room_id)
    finally:
        await writer.close()
        await manager.disconnect(room_id, ws)
        if role == "student":
            try:
                await store.remove_client(room_id, client_id)
                manager.mark_dirty(room_id)
                # Only publish directly when no ticker is left to do it. A whole
                # class leaving at once would otherwise emit one message per
                # departure, which is exactly the burst coalescing exists to stop.
                if not manager.has_listeners(room_id):
                    await store.publish(
                        room_id, state_message(await store.get_state(room_id))
                    )
            except Exception:
                log.exception("cleanup failed for %s in room %s", client_id, room_id)
