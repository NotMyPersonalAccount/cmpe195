from __future__ import annotations

import secrets

from fastapi import APIRouter, HTTPException, Request

from .redis_store import RoomStore
from .schemas import RoomCreated, RoomState, ScoreIn, state_message, valid_id

router = APIRouter(prefix="/api")

# No 0/O/1/I/L -- room codes get read aloud and typed from a projector.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LEN = 6


def _store(request: Request) -> RoomStore:
    return request.app.state.store


def _check_room_id(room_id: str) -> str:
    if not valid_id(room_id):
        raise HTTPException(422, "room_id must be 1-32 chars of [A-Za-z0-9_-]")
    return room_id


@router.post("/rooms", response_model=RoomCreated)
async def create_room(request: Request) -> RoomCreated:
    store = _store(request)
    for _ in range(10):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LEN))
        if not await store.exists(code):
            return RoomCreated(room_id=code)
    raise HTTPException(503, "could not allocate a free room code")


@router.get("/rooms/{room_id}", response_model=RoomState)
async def get_room(room_id: str, request: Request) -> RoomState:
    return await _store(request).get_state(_check_room_id(room_id))


@router.post("/rooms/{room_id}/score", response_model=RoomState)
async def post_score(room_id: str, body: ScoreIn, request: Request) -> RoomState:
    store = _store(request)
    _check_room_id(room_id)
    await store.set_score(room_id, body.client_id, body.score)
    state = await store.get_state(room_id)
    # REST writers get no ticker, so publish directly to reach live sockets.
    await store.publish(room_id, state_message(state))
    return state


@router.delete("/rooms/{room_id}/clients/{client_id}", response_model=RoomState)
async def delete_client(room_id: str, client_id: str, request: Request) -> RoomState:
    store = _store(request)
    _check_room_id(room_id)
    if not valid_id(client_id):
        raise HTTPException(422, "invalid client_id")
    await store.remove_client(room_id, client_id)
    state = await store.get_state(room_id)
    await store.publish(room_id, state_message(state))
    return state
