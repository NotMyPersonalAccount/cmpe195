"""Drive a room with many simulated students over real WebSockets.

This is the multi-user test harness: it opens N student sockets plus one
dashboard socket, drags the sliders the way people actually would, and then
checks three numbers against each other:

    what the clients sent  ==  what Redis holds  ==  what the dashboard was told

Those three agreeing is the whole correctness claim. Any disagreement is a lost
update, a throttle dropping a final value, or a stale broadcast.

Usage:
    python scripts/simulate.py                          # 25 students, 12s
    python scripts/simulate.py --students 200 --duration 30
    python scripts/simulate.py --profile spike --students 50
    python scripts/simulate.py --room CMPE195 --watch    # join a room you have open

Profiles:
    drift   individuals wander; the room mean stays roughly flat
    spike   everyone climbs together, as if the lecture lost the room at once
    split   half the room follows, half is lost -- a bimodal distribution
    calm    a few people move, most sit still
"""

from __future__ import annotations

import argparse
import asyncio
import json
import random
import sys
import time
from dataclasses import dataclass, field

try:
    import websockets
except ImportError:
    sys.exit("needs `websockets`: uv pip install websockets")

import redis.asyncio as aioredis

DEFAULT_HTTP = "http://localhost:8000"
DEFAULT_WS = "ws://localhost:8000"
DEFAULT_REDIS = "redis://localhost:6379"

# Matches the client-side throttle in useRoomSocket.ts, so the simulation
# applies the same back-pressure a browser would.
SEND_INTERVAL_S = 0.1

# People do not drag continuously -- they grab the slider, move it for a moment,
# then leave it alone. Simulating that keeps the load honest (a room of 200
# sending 10/s forever is not a classroom, it is a load test of the harness).
DRAG_S = (0.3, 0.9)
IDLE_S = (0.8, 3.0)


@dataclass
class Student:
    """One simulated person, holding the value they last committed to."""

    client_id: str
    value: int
    target: int = 0
    sent: int | None = field(default=None)

    def step(self, profile: str, t: float, rng: random.Random) -> int:
        """Advance this student's slider one tick."""
        if profile == "drift":
            self.target = max(0, min(100, self.target + rng.randint(-12, 12)))
        elif profile == "spike":
            # Everyone climbs toward "lost" together as the lecture goes on.
            ramp = min(100, int(t * 12))
            self.target = max(0, min(100, ramp + rng.randint(-15, 15)))
        elif profile == "split":
            anchor = 15 if int(self.client_id[-2:], 36) % 2 == 0 else 85
            self.target = max(0, min(100, anchor + rng.randint(-10, 10)))
        elif profile == "calm":
            if rng.random() < 0.15:
                self.target = max(0, min(100, self.target + rng.randint(-20, 20)))

        # Ease toward the target so the socket sees a drag, not a teleport.
        self.value += max(-8, min(8, self.target - self.value))
        self.value = max(0, min(100, self.value))
        return self.value


class Sim:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.rng = random.Random(args.seed)
        self.students: list[Student] = []
        self.frames: list[dict] = []
        self.stop = asyncio.Event()      # stop sliding
        self.teardown = asyncio.Event()  # close every socket
        self.leavers: set[str] = set()   # these students walk out early
        self.drops: list[tuple[str, str]] = []

    # ---- the dashboard's view -------------------------------------------

    async def watch(self) -> None:
        url = f"{self.args.ws}/ws/rooms/{self.args.room}?client_id=simdash&role=dashboard"
        async with websockets.connect(url) as ws:
            # Runs until teardown, not until sliding stops: the last broadcast
            # arrives after the final values settle.
            while not self.teardown.is_set():
                try:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=0.25))
                except asyncio.TimeoutError:
                    continue
                except websockets.exceptions.ConnectionClosed:
                    return
                if msg.get("type") == "state":
                    msg["_at"] = time.monotonic()
                    self.frames.append(msg)

    # ---- one student's socket -------------------------------------------

    async def run_student(self, s: Student, start_delay: float) -> None:
        await asyncio.sleep(start_delay)
        url = f"{self.args.ws}/ws/rooms/{self.args.room}?client_id={s.client_id}"
        try:
            async with websockets.connect(url, ping_timeout=60, close_timeout=5) as ws:
                await ws.recv()  # initial state

                # A browser drains incoming frames via onmessage. Without an
                # equivalent here the room's 4/s broadcasts fill the client
                # buffer until the socket dies -- which looks like a server
                # fault but is purely a simulator that never reads.
                async def drain() -> None:
                    try:
                        async for _ in ws:
                            pass
                    except Exception:
                        pass

                reader = asyncio.create_task(drain())
                t0 = time.monotonic()
                heartbeat = time.monotonic()

                while not self.stop.is_set():
                    # One drag: a burst of movement at the client throttle rate.
                    drag_until = time.monotonic() + self.rng.uniform(*DRAG_S)
                    while time.monotonic() < drag_until and not self.stop.is_set():
                        t = time.monotonic() - t0
                        value = s.step(self.args.profile, t, self.rng)
                        await ws.send(json.dumps({"type": "score", "value": value}))
                        s.sent = value
                        await asyncio.sleep(SEND_INTERVAL_S)

                    if time.monotonic() - heartbeat > 15:
                        await ws.send(json.dumps({"type": "ping"}))
                        heartbeat = time.monotonic()

                    # Hands off the slider.
                    idle_until = time.monotonic() + self.rng.uniform(*IDLE_S)
                    while time.monotonic() < idle_until and not self.stop.is_set():
                        await asyncio.sleep(0.1)

                # Stay connected while the checks run. A clean disconnect
                # correctly removes a student from the room, so closing here
                # would empty the room before there is anything to verify.
                while not self.teardown.is_set() and s.client_id not in self.leavers:
                    await asyncio.sleep(0.1)

                reader.cancel()
        except Exception as exc:
            # Recorded rather than printed inline, so a saturated simulator is
            # reported as its own check instead of looking like a server fault.
            self.drops.append((s.client_id, f"{type(exc).__name__}: {exc}"))

    # ---- live readout ----------------------------------------------------

    async def report(self) -> None:
        while not self.stop.is_set():
            await asyncio.sleep(1.0)
            if not self.frames:
                continue
            f = self.frames[-1]
            bars = "".join("#" * min(9, c) or "." for c in f["histogram"])
            print(
                f"  t+{len(self.frames):>3} frames | avg {f['average']:>5.1f} "
                f"| responding {f['responding']:>4} | dist [{bars}]"
            )

    # ---- the actual check ------------------------------------------------

    async def verify(self) -> int:
        r = aioredis.from_url(self.args.redis, decode_responses=True)
        raw = await r.hgetall(f"room:{self.args.room}:agg")
        await r.aclose()

        redis_sum = int(raw.pop(":sum", 0) or 0)
        redis_scores = {k: int(v) for k, v in raw.items()}
        redis_count = len(redis_scores)

        dropped = {cid for cid, _ in self.drops}
        expected = {
            s.client_id: s.sent
            for s in self.students
            if s.sent is not None and s.client_id not in dropped
        }

        print("\n" + "=" * 66)
        print("VERIFY  clients == redis == dashboard")
        print("=" * 66)

        failures = 0

        # 1. The running sum must equal the hash it summarises. This is the
        #    atomicity claim: if any update was lost, these diverge.
        actual_sum = sum(redis_scores.values())
        ok = redis_sum == actual_sum
        failures += not ok
        print(f"  [{'PASS' if ok else 'FAIL'}] running sum matches stored scores"
              f"   sum={redis_sum} scores={actual_sum}")

        # 2. Every student's last sent value is what Redis holds. This is what
        #    catches a throttle that drops the final message of a drag.
        mismatched = {
            cid: (v, redis_scores.get(cid))
            for cid, v in expected.items()
            if redis_scores.get(cid) != v
        }
        ok = not mismatched
        failures += not ok
        print(f"  [{'PASS' if ok else 'FAIL'}] every final slider value landed"
              f"   {len(expected) - len(mismatched)}/{len(expected)} exact")
        for cid, (want, got) in list(mismatched.items())[:5]:
            print(f"          {cid}: sent {want}, redis has {got}")

        # 3. Participant count matches.
        ok = redis_count == len(expected)
        failures += not ok
        print(f"  [{'PASS' if ok else 'FAIL'}] participant count"
              f"   redis={redis_count} expected={len(expected)}")

        # 4. The dashboard's last frame agrees with Redis.
        if self.frames:
            f = self.frames[-1]
            want_avg = round(actual_sum / redis_count, 1) if redis_count else 0.0
            ok = abs(f["average"] - want_avg) < 0.05 and f["responding"] == redis_count
            failures += not ok
            print(f"  [{'PASS' if ok else 'FAIL'}] dashboard agrees with redis"
                  f"   broadcast avg={f['average']} n={f['responding']}"
                  f" | redis avg={want_avg} n={redis_count}")

        # 5. Simulator health. A dropped client socket is a harness limit, not
        #    a server fault -- surfaced so the two are never confused.
        ok = not self.drops
        print(f"  [{'PASS' if ok else 'WARN'}] simulator kept every socket alive"
              f"   {len(self.students) - len(self.drops)}/{len(self.students)} survived")
        for cid, err in self.drops[:3]:
            print(f"          {cid}: {err}")

        # 6. Broadcasts were coalesced rather than one-per-update.
        if self.frames:
            span = self.frames[-1]["_at"] - self.frames[0]["_at"]
            ceiling = span / 0.25 + 2  # the 250ms ticker, plus slack
            sends = len(self.students) * (span / SEND_INTERVAL_S)
            ok = len(self.frames) <= ceiling
            failures += not ok
            print(f"  [{'PASS' if ok else 'FAIL'}] broadcasts coalesced"
                  f"   {len(self.frames)} frames over {span:.1f}s"
                  f" (ticker ceiling {ceiling:.0f}; unbatched would be ~{sends:.0f})")

        return failures

    async def verify_departure(self) -> int:
        """Half the students leave; the average must recompute without them."""
        r = aioredis.from_url(self.args.redis, decode_responses=True)
        key = f"room:{self.args.room}:agg"

        leaving = self.students[: len(self.students) // 2]
        staying = self.students[len(self.students) // 2 :]
        if not leaving:
            return 0

        # Marking them makes their socket loop exit, which closes the connection
        # exactly as a student closing the tab would.
        self.leavers = {s.client_id for s in leaving}
        await asyncio.sleep(2.5)

        raw = await r.hgetall(key)
        await r.aclose()
        stored_sum = int(raw.pop(":sum", 0) or 0)
        scores = {k: int(v) for k, v in raw.items()}

        dropped = {cid for cid, _ in self.drops}
        want = {
            s.client_id: s.sent
            for s in staying
            if s.sent is not None and s.client_id not in dropped
        }
        ok = set(scores) == set(want) and stored_sum == sum(scores.values())
        print(f"  [{'PASS' if ok else 'FAIL'}] departures drain from the average"
              f"   {len(leaving)} left, {len(scores)} remain (expected {len(want)}),"
              f" sum={stored_sum} matches={stored_sum == sum(scores.values())}")
        return 0 if ok else 1

    # ---- orchestration ---------------------------------------------------

    async def run(self) -> int:
        a = self.args
        self.students = [
            Student(client_id=f"sim{i:04d}", value=0, target=self.rng.randint(0, 100))
            for i in range(a.students)
        ]

        print(f"room {a.room} | {a.students} students | profile {a.profile} | {a.duration}s")
        print(f"watch it live at {a.http}/dash/{a.room}\n")

        watcher = asyncio.create_task(self.watch())
        reporter = asyncio.create_task(self.report())
        await asyncio.sleep(0.3)  # let the dashboard socket attach first

        # Stagger joins; a real class does not connect in lockstep.
        tasks = [
            asyncio.create_task(self.run_student(s, self.rng.uniform(0, a.ramp)))
            for s in self.students
        ]

        await asyncio.sleep(a.duration)
        self.stop.set()

        # Sliders are still; wait out the server's coalescing window so every
        # final value has flushed, then check while everyone is still connected.
        await asyncio.sleep(1.5)
        failures = await self.verify()

        if not a.watch:
            failures += await self.verify_departure()

        print("=" * 66)
        print("RESULT:", "all checks passed" if not failures else f"{failures} CHECK(S) FAILED")

        self.teardown.set()
        await asyncio.gather(*tasks, return_exceptions=True)
        reporter.cancel()
        watcher.cancel()
        await asyncio.gather(reporter, watcher, return_exceptions=True)
        return failures


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--students", type=int, default=25)
    p.add_argument("--duration", type=float, default=12.0, help="seconds of sliding")
    p.add_argument("--ramp", type=float, default=2.0, help="seconds over which students join")
    p.add_argument("--profile", choices=["drift", "spike", "split", "calm"], default="drift")
    p.add_argument("--room", default="SIMROOM")
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--ws", default=DEFAULT_WS)
    p.add_argument("--http", default=DEFAULT_HTTP)
    p.add_argument("--redis", default=DEFAULT_REDIS)
    p.add_argument("--watch", action="store_true",
                   help="skip verification; just generate traffic to watch in a browser")
    args = p.parse_args()

    sim = Sim(args)
    try:
        return asyncio.run(sim.run())
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
