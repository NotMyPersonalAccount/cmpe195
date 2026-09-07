# Confusion Level

A live read on how lost a lecture room is. Students drag a 0–100 slider on their
phone; everyone — students and instructor — sees the room average update within a
quarter second.

```
 student browser ──WS──┐
 student browser ──WS──┼──> FastAPI ──EVAL(Lua)──> Redis   room:{id}:agg, room:{id}:seen
 instructor dash ──WS──┘        ▲                    │
                                └──── psubscribe ────┘  room:*:events
```

- `/` — create or join a room
- `/r/:roomId` — the student slider
- `/dash/:roomId` — the instructor dashboard
- `/docs` — FastAPI's generated API reference

## Run the demo

The fastest way to see it working, with a simulated class of 40 students filling
the room. Needs Docker, Python 3.11+ with [uv](https://docs.astral.sh/uv/), and
Node 20+.

**1. Start Redis**

```bash
docker compose up -d redis
docker compose exec redis redis-cli ping        # -> PONG
```

**2. Build the frontend and start the server** — one process serves both the API
and the app, so there is no second terminal to babysit.

```bash
cd frontend && npm install && npm run build

cd ../backend
uv venv && uv pip install -e ".[dev]" && uv pip install websockets
uv run uvicorn app.main:app --port 8000
```

**3. Fill a room with simulated students** — in a second terminal. `--watch`
generates traffic indefinitely instead of running the checks:

```bash
cd backend
uv run python scripts/simulate.py --room DEMO --students 40 \
    --duration 600 --profile split --watch
```

**4. Open two browser windows**

| URL | What you get |
|---|---|
| <http://localhost:8000/dash/DEMO> | the instructor dashboard — average, distribution, trend |
| <http://localhost:8000/r/DEMO> | a student slider, joining the same room |

Drag the slider on the student page. Within about a quarter second the dashboard
average moves, the histogram shifts, and the "responding" count goes up by one —
you have joined the 40 simulated students. The `split` profile produces a
deliberately bimodal room (half following, half lost), so the two outer histogram
bars dominate and the average sits near the middle while almost nobody is
actually there.

Things worth trying:

- **Close the student tab.** The count drops by one and the average recomputes
  without you, within a second.
- **Watch the meter change band.** Drag to 90 and the status goes from "Some
  drift" to "Lost", with the label changing alongside the colour.
- **Try `--profile spike`** instead, and watch the room lose the plot together as
  the average climbs toward 100.
- **Restart uvicorn with the tabs open.** Both pages reconnect on their own
  backoff and the average returns to where it was.

Stop the simulator with Ctrl-C; the students disconnect and the room empties.

## Run it for development

```bash
docker compose up -d redis

cd backend
uv venv && uv pip install -e ".[dev]"
uv run uvicorn app.main:app --reload --port 8000

cd ../frontend                       # separate terminal
npm install
npm run dev                          # http://localhost:5173
```

The Vite dev server proxies `/api` and `/ws` to port 8000, so use the 5173 URLs
while working on the frontend to get hot reload.

## The part worth reading

The interesting problem is keeping the average correct while many people drag
sliders at the same time. Recomputing it means reading every score on every
drag, and a read-modify-write of a running sum loses updates under concurrency.

**One Redis key per room.** `room:{id}:agg` is a hash of `client_id -> score`
*plus a reserved `:sum` field* holding the running total. `count` is not stored
at all — it is `HLEN - 1`, which is O(1) in Redis.

Co-locating the sum inside the hash is not a micro-optimisation; it removes a
class of silent corruption. With separate `scores` / `sum` / `count` keys, Redis
expires each independently. If `scores` vanishes a moment before `sum` does, the
next write sees `HGET -> nil`, treats a returning student as brand new, and adds
their score on top of a sum that was never cleared — the average is then wrong
for the rest of the lecture with nothing to signal it. One key means partial
expiry is not representable. `tests/test_expiry.py` is the regression test.

`client_id` is validated against `^[A-Za-z0-9_-]{1,32}$`, which excludes `:` and
so makes `:sum` unreachable as a field name.

**Three Lua scripts** (`app/lua/`) do every mutation. Redis runs each `EVAL` to
completion on a single thread, so the read-then-adjust of the sum is atomic with
no locking:

- `set_score` — adjusts the sum by the *delta* when a student re-slides
- `remove_client` — guarded by an `HGET`, so a disconnect racing the reaper
  cannot subtract twice
- `reap_stale` — evicts anyone who stopped heartbeating, because a closed laptop
  does not always produce a clean WebSocket close

The sum is an integer throughout. `INCRBYFLOAT` accumulates binary
floating-point drift over thousands of drags; `HINCRBY` on integers is exact.
Division happens once, at read.

**Broadcasts are coalesced.** Writes hit Redis immediately, but state is
published on a 250 ms per-room ticker. Without that, 200 students dragging at
once is an O(n²) message storm. Fanout is concurrent and time-boxed, so one
client with a full receive buffer cannot stall the broadcast for the room.

**Per-connection writes are coalesced, not dropped.** A plain rate limiter
discards whatever arrives inside its window — including the *last* message of a
drag, so a student who slides to 80 and lets go gets recorded at whatever earlier
sample survived. `ScoreWriter` holds the newest value and flushes it when the
window closes. `tests/test_score_writer.py` covers it.

## Presence: "responding", not "connected"

**Connecting does not put you in the average — only sending a score does.** A
student who opens the page and never touches the slider is deliberately not
counted; otherwise idle tabs would drag the average toward the slider's starting
position.

So the number on the dashboard is **"N responding"**. Calling it "connected"
would be a claim the data does not support. Dashboards connect with
`?role=dashboard`, which makes them receive-only and keeps a watching instructor
out of the presence set.

## Testing it with many users

`backend/scripts/simulate.py` opens N real WebSockets, drags the sliders the way
people actually do (a burst of movement, then hands off), and checks three
numbers against each other:

> what the clients sent == what Redis holds == what the dashboard was told

```bash
cd backend
uv pip install websockets

uv run python scripts/simulate.py                             # 25 students, 12s
uv run python scripts/simulate.py --students 200 --duration 30
uv run python scripts/simulate.py --profile spike --students 50

# generate traffic to watch in a browser, skipping the checks
uv run python scripts/simulate.py --room DEMO --students 40 --duration 300 --watch
```

Profiles: `drift` (individuals wander, mean stays flat), `spike` (the room gets
lost together), `split` (bimodal — half following, half lost), `calm` (a few
people move).

A run at 200 students reports:

```
  [PASS] running sum matches stored scores   sum=19327 scores=19327
  [PASS] every final slider value landed   200/200 exact
  [PASS] participant count   redis=200 expected=200
  [PASS] dashboard agrees with redis   broadcast avg=96.6 n=200 | redis avg=96.6 n=200
  [PASS] simulator kept every socket alive   200/200 survived
  [PASS] broadcasts coalesced   52 frames over 13.4s (ticker ceiling 55; unbatched would be ~26701)
  [PASS] departures drain from the average   100 left, 100 remain (expected 100)
```

The simulator reports its own dropped sockets as a separate check, so a saturated
harness is never mistaken for a server fault.

## Unit tests

```bash
cd backend && uv run pytest
```

Tests talk to a real Redis at `REDIS_URL` (default `redis://localhost:6379`) and
skip with an explicit message if it is not up — real Redis rather than fakeredis,
because the Lua path is the thing under test.

`tests/test_atomic.py` is the load-bearing one: ~550 overlapping writes across 50
clients, then asserts the running sum still equals the hash exactly. A
read-modify-write implementation fails it — measured against a deliberate naive
version, it drifted by 2433 out of 2546.

## Configuration

Environment variables, or a `backend/.env` (see `app/config.py`):

| Variable | Default | Meaning |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | |
| `ROOM_TTL_S` | `43200` | room keys refresh to this on every write (12h) |
| `STALE_AFTER_S` | `45` | missed-heartbeat window before eviction |
| `REAP_INTERVAL_S` | `15` | how often the reaper sweeps |
| `BROADCAST_MS` | `250` | per-room broadcast ticker |
| `MIN_SCORE_INTERVAL_MS` | `50` | per-connection write window |
| `CORS_ORIGINS` | `["http://localhost:5173", ...]` | JSON list |

## Known limitations

- **No auth.** Anyone with the room code can join. One `client_id` is one score
  (writes are idempotent overwrites), so refresh-spam does nothing, but a
  determined ballot-stuffer forging many ids is not defended against.
- **Nothing persists.** All state is in Redis under a TTL; when the room expires
  the session is gone. There is no history across lectures.
- **Single worker assumed.** The design is multi-worker-ready — writes are atomic
  in Redis and fanout goes through pub/sub — but it has only been exercised with
  one uvicorn worker.

## Colour

Charts follow a validated palette: an ordinal single-hue ramp for the histogram
(the buckets are an ordered scale, not distinct identities), status colours for
the meter, always paired with a text label so colour never carries the reading
alone. Both light and dark ramps pass the ordinal checks — monotone lightness,
visible step gaps, and the end step clearing its surface. Palette values live at
the top of `frontend/src/styles.css`; swapping in a brand palette means changing
those hexes and re-running the validator.
