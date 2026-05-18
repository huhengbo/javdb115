from __future__ import annotations

from collections.abc import Generator
from sqlite3 import Connection

from fastapi import Depends, Header

from app.config import AppConfig, load_config
from app.database import Database
from app.errors import AuthError
from app.repositories.sessions import SessionsRepository
from app.services.auth import AuthService


def get_config() -> AppConfig:
    return load_config()


def get_database(config: AppConfig = Depends(get_config)) -> Database:
    return Database(config.database_path)


def get_connection(database: Database = Depends(get_database)) -> Generator[Connection]:
    with database.connect() as connection:
        yield connection


def get_token(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthError()
    return authorization.removeprefix("Bearer ").strip()


def require_user(
    token: str = Depends(get_token),
    connection: Connection = Depends(get_connection),
    config: AppConfig = Depends(get_config),
) -> str:
    return AuthService(SessionsRepository(connection), config).verify(token)
