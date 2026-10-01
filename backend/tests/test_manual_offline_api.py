from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.javdb_api import JavdbApiClient
from app.api import javdb_proxy
from app.config import AppConfig
from app.database import Database
from app.dependencies import get_config
from app.errors import AppError, app_error_handler
from app.repositories.sessions import SessionsRepository
from app.repositories.settings import SettingsRepository
from app.repositories.tasks import TasksRepository
from app.services.auth import AuthService


def offline_client(tmp_path: Path) -> tuple[TestClient, Database]:
    database = Database(tmp_path / "manual-offline.sqlite3")
    database.initialize()
    config = AppConfig(database.path, "admin", "test-password", "test-secret", 24)
    with database.connect() as connection:
        SettingsRepository(connection).upsert("p115_download_dir_id", "dir-1", False)
        token = AuthService(SessionsRepository(connection), config).login(
            "admin", "test-password", client_key="manual-offline-test"
        )

    app = FastAPI()
    app.include_router(javdb_proxy.router)
    app.add_exception_handler(AppError, app_error_handler)
    app.dependency_overrides[get_config] = lambda: config
    app.dependency_overrides[javdb_proxy.get_client] = lambda: JavdbApiClient()
    client = TestClient(app)
    client.cookies.set(config.session_cookie_name, token)
    return client, database


def prefetched_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "magnet_hash": "hash-1",
        "force": False,
        "work": {
            "code": "DAZD-306",
            "title": "Title",
            "cover_url": "https://example.com/cover.jpg",
            "release_date": "2026-01-01",
            "actors": [{"id": "actor-1", "name": "Actor One", "avatar_url": "https://example.com/a.jpg"}],
        },
        "magnet": {"hash": "hash-1", "name": "DAZD-306.torrent", "size_mb": 9185.28},
    }
    payload.update(overrides)
    return payload


def test_offline_accepts_null_fields_from_javdb(tmp_path: Path) -> None:
    client, database = offline_client(tmp_path)
    # JavDB 中无头像、未命名的演员以及缺失的封面/日期都是 null，前端原样透传
    payload = prefetched_payload(
        work={
            "code": "DAZD-306",
            "title": "Title",
            "cover_url": None,
            "release_date": None,
            "actors": [
                {"id": "actor-1", "name": "Actor One", "avatar_url": None},
                {"id": None, "name": None, "avatar_url": None},
            ],
        },
        magnet={"hash": "hash-1", "name": None, "size_mb": 9185.28},
    )

    response = client.post("/api/javdb/movies/abc123/offline", json=payload)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["ok"] is True
    with database.connect() as connection:
        task = TasksRepository(connection).get(body["task_id"])
        assert task is not None
        assert task["status"] == "pending"
        work = connection.execute(
            "SELECT code, cover_url, release_date FROM works WHERE code = 'DAZD-306'"
        ).fetchone()
        assert tuple(work) == ("DAZD-306", "", "")
        magnet = connection.execute("SELECT name, url FROM magnets").fetchone()
        assert magnet["name"] == "hash-1"
        assert magnet["url"].startswith("magnet:?xt=urn:btih:hash-1")


def test_offline_still_rejects_missing_magnet_hash(tmp_path: Path) -> None:
    client, _ = offline_client(tmp_path)
    payload = prefetched_payload()
    del payload["magnet_hash"]

    response = client.post("/api/javdb/movies/abc123/offline", json=payload)

    assert response.status_code == 422
