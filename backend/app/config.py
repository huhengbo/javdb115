from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

DEFAULT_DATABASE_PATH = "data/app.sqlite3"
DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_SESSION_TTL_HOURS = 24
DEFAULT_SESSION_COOKIE_NAME = "javdb115_session"


@dataclass(frozen=True)
class AppConfig:
    database_path: Path
    admin_username: str
    admin_password: str
    secret_key: str
    session_ttl_hours: int
    session_cookie_name: str
    session_cookie_secure: bool


def require_env(name: str) -> str:
    value = os.getenv(name)
    if value:
        return value
    raise RuntimeError(f"Missing required environment variable: {name}")


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def load_config() -> AppConfig:
    database_path = Path(os.getenv("APP_DATABASE_PATH", DEFAULT_DATABASE_PATH))
    ttl = int(os.getenv("APP_SESSION_TTL_HOURS", str(DEFAULT_SESSION_TTL_HOURS)))
    return AppConfig(
        database_path=database_path,
        admin_username=os.getenv("APP_ADMIN_USERNAME", DEFAULT_ADMIN_USERNAME),
        admin_password=require_env("APP_ADMIN_PASSWORD"),
        secret_key=require_env("APP_SECRET_KEY"),
        session_ttl_hours=ttl,
        session_cookie_name=os.getenv("APP_SESSION_COOKIE_NAME", DEFAULT_SESSION_COOKIE_NAME),
        session_cookie_secure=env_bool("APP_SESSION_COOKIE_SECURE"),
    )
