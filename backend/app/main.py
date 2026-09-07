from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import redis.asyncio as aioredis
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .reaper import reap_loop
from .redis_store import RoomStore
from .rooms import router as rooms_router
from .ws import ConnectionManager, pubsub_listener
from .ws import router as ws_router

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    redis = aioredis.from_url(
        settings.redis_url,
        decode_responses=True,
        max_connections=settings.redis_max_connections,
    )
    store = RoomStore(redis, settings.room_ttl_s)
    manager = ConnectionManager(store)

    app.state.redis = redis
    app.state.store = store
    app.state.manager = manager

    tasks = [
        asyncio.create_task(pubsub_listener(redis, manager)),
        asyncio.create_task(
            reap_loop(store, manager, settings.reap_interval_s, settings.stale_after_s)
        ),
    ]
    try:
        yield
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await manager.shutdown()
        await redis.aclose()


def create_app() -> FastAPI:
    app = FastAPI(title="Confusion Level API", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(rooms_router)
    app.include_router(ws_router)

    @app.get("/healthz")
    async def healthz() -> dict:
        pong = await app.state.redis.ping()
        return {"ok": bool(pong), "redis": "up" if pong else "down"}

    # Serve the built frontend when it exists, so a production run is one process.
    # Registered last so it cannot shadow /api, /ws, /healthz, or /docs.
    if FRONTEND_DIST.is_dir():
        root = FRONTEND_DIST.resolve()
        app.mount("/assets", StaticFiles(directory=root / "assets"), name="assets")

        @app.get("/{spa_path:path}", include_in_schema=False)
        async def spa(spa_path: str) -> FileResponse:
            """Serve real files, and fall back to index.html for client routes.

            Without the fallback every deep link (/dash/CMPE195, /r/CMPE195)
            404s on a page load -- StaticFiles only knows files on disk, and
            those paths only exist inside the React router.
            """
            # Never answer for the API surface: an unknown /api path must
            # 404 as JSON, not resolve to a page that loaded successfully.
            if spa_path.split("/", 1)[0] in ("api", "ws"):
                raise HTTPException(404, "Not Found")

            if spa_path:
                candidate = (root / spa_path).resolve()
                # The path comes from the URL, so confirm it stayed inside the
                # build directory before serving it.
                if candidate.is_file() and root in candidate.parents:
                    return FileResponse(candidate)
            return FileResponse(root / "index.html")

    return app


app = create_app()
