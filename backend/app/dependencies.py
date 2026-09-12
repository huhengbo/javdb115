from __future__ import annotations

from collections.abc import Generator
from sqlite3 import Connection

from fastapi import Depends, Header, Request

from app.adapters.javdb_api import JavdbApiClient, client_from_token
from app.config import AppConfig, load_config
from app.database import Database
from app.errors import AuthError
from app.repositories.sessions import SessionsRepository
from app.repositories.settings import SettingsRepository
from app.services.auth import AuthService


def get_config() -> AppConfig:
    return load_config()


def get_database(config: AppConfig = Depends(get_config)) -> Database:
    return Database(config.database_path)


def get_connection(database: Database = Depends(get_database)) -> Generator[Connection]:
    with database.connect() as connection:
        yield connection


def get_token(
    request: Request,
    authorization: str | None = Header(default=None),
    config: AppConfig = Depends(get_config),
) -> str:
    cookie_token = request.cookies.get(config.session_cookie_name)
    if cookie_token:
        return cookie_token
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        if token:
            return token
    raise AuthError()


def require_user(
    token: str = Depends(get_token),
    connection: Connection = Depends(get_connection),
    config: AppConfig = Depends(get_config),
) -> str:
    return AuthService(SessionsRepository(connection), config).verify(token)


def get_javdb_client(connection: Connection = Depends(get_connection)) -> JavdbApiClient:
    return client_from_token(SettingsRepository(connection).get("javdb_token"))
