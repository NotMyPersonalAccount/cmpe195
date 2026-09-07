import json
import re

from pydantic import BaseModel, Field, field_validator

# room_id and client_id are interpolated into Redis key names and hash fields,
# so the charset is restricted rather than escaped. Excluding ':' is also what
# makes the reserved ':sum' field unreachable as a client id.
ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,32}$")


def valid_id(value: str) -> bool:
    return bool(ID_PATTERN.match(value))


class RoomState(BaseModel):
    room_id: str
    # Mean of every submitted score, 0-100. Zero when nobody has responded.
    average: float
    # Number of people who have moved their slider -- NOT the number connected.
    # Opening the page without touching the slider deliberately does not count.
    responding: int
    # Five buckets of 20 points each.
    histogram: list[int]
    ts: int


class RoomCreated(BaseModel):
    room_id: str


class ScoreIn(BaseModel):
    client_id: str
    score: int = Field(ge=0, le=100)

    @field_validator("client_id")
    @classmethod
    def _check_client_id(cls, v: str) -> str:
        if not valid_id(v):
            raise ValueError("client_id must be 1-32 chars of [A-Za-z0-9_-]")
        return v


def state_message(state: RoomState) -> str:
    """Serialise room state as the `state` frame sent over the WebSocket."""
    return json.dumps({"type": "state", **state.model_dump()})
