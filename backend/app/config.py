from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    redis_url: str = "redis://localhost:6379"
    redis_max_connections: int = 100

    # A room's keys are refreshed to this on every write, so an abandoned room
    # evaporates on its own rather than accumulating forever.
    room_ttl_s: int = 43200  # 12h

    # A client that misses this many seconds of heartbeats is evicted from the
    # average. Three missed 15s beats.
    stale_after_s: int = 45
    reap_interval_s: int = 15

    # State is published at most this often per room, however fast sliders move.
    broadcast_ms: int = 250

    # Ignore score messages arriving faster than this from one connection.
    min_score_interval_ms: int = 50

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]


settings = Settings()
