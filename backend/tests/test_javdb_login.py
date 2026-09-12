from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

import pytest

from app.adapters.javdb_api import JavdbApiClient, make_request_headers
from app.database import Database
from app.errors import IntegrationError, ValidationAppError
from app.repositories.settings import SettingsRepository
from app.secret_store import SECRET_VALUE_PREFIX
from app.services.javdb_login import JAVDB_DEVICE_UUID_KEY, JAVDB_TOKEN_KEY, JavdbLoginService


class LoginTransport:
    def __init__(self, payload: dict[str, Any] | None = None) -> None:
        self.posts: list[tuple[str, str, dict[str, str]]] = []
        self.gets: list[tuple[str, str]] = []
        self.payload = payload or {
            "success": 1,
            "data": {
                "token": "jwt-token",
                "user": {
                    "id": 1967331,
                    "username": "huhu1992",
                    "email": "user@example.com",
                    "is_vip": False,
                    "vip_expired_at": None,
                },
                "following_tags": [],
            },
        }

    def javdb_api_get(self, path: str, query: str, sig: str) -> str:
        del sig
        self.gets.append((path, query))
        return json.dumps(
            {
                "success": 1,
                "data": {
                    "user": {
                        "id": 1967331,
                        "username": "huhu1992",
                        "email": "user@example.com",
                        "is_vip": False,
                        "vip_expired_at": None,
                    }
                },
            }
        )

    def javdb_api_post(self, path: str, query: str, sig: str, fields: dict[str, str]) -> str:
        del sig
        self.posts.append((path, query, fields))
        return json.dumps(self.payload)


def test_login_posts_apk_session_fields_and_stores_encrypted_token(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("APP_SECRET_KEY", "javdb-login-secret")
    connection = setup_database(tmp_path).connect()
    transport = LoginTransport()
    service = JavdbLoginService(
        SettingsRepository(connection),
        JavdbApiClient(cast(Any, transport)),
    )

    result = service.login(" huhbo1992@gmail.com ", "secret-password")

    assert result["ok"] is True
    assert result["account"] == {
        "user_id": "1967331",
        "username": "huhu1992",
        "email": "user@example.com",
        "is_vip": False,
        "vip_expired_at": None,
    }
    assert len(transport.posts) == 1
    path, query, fields = transport.posts[0]
    assert path == "/api/v1/sessions"
    assert "platform=android" in query
    assert fields["username"] == "huhbo1992@gmail.com"
    assert fields["password"] == "secret-password"
    assert fields["device_uuid"]
    assert fields["device_name"] == "javdb115"
    assert fields["platform"] == "android"
    stored = connection.execute(
        "SELECT value FROM settings WHERE key = ?",
        (JAVDB_TOKEN_KEY,),
    ).fetchone()
    assert stored is not None
    assert str(stored["value"]).startswith(SECRET_VALUE_PREFIX)
    assert SettingsRepository(connection).get(JAVDB_TOKEN_KEY) == "jwt-token"
    assert SettingsRepository(connection).get(JAVDB_DEVICE_UUID_KEY) == fields["device_uuid"]


def test_login_reuses_saved_device_uuid(tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    settings = SettingsRepository(connection)
    settings.upsert(JAVDB_DEVICE_UUID_KEY, "device-1", False)
    transport = LoginTransport()
    service = JavdbLoginService(settings, JavdbApiClient(cast(Any, transport)))

    service.login("user", "pass")

    assert transport.posts[0][2]["device_uuid"] == "device-1"


def test_login_rejects_blank_credentials(tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    client = JavdbApiClient(cast(Any, LoginTransport()))
    service = JavdbLoginService(SettingsRepository(connection), client)

    with pytest.raises(ValidationAppError, match="用户名不能为空"):
        service.login("  ", "pass")
    with pytest.raises(ValidationAppError, match="密码不能为空"):
        service.login("user", "")


def test_failed_login_does_not_store_token(tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    transport = LoginTransport(
        {"success": 0, "action": "LoginError", "message": "用户名或密码错误", "data": None}
    )
    service = JavdbLoginService(
        SettingsRepository(connection),
        JavdbApiClient(cast(Any, transport)),
    )

    with pytest.raises(IntegrationError, match="用户名或密码错误"):
        service.login("user", "wrong")
    assert SettingsRepository(connection).get(JAVDB_TOKEN_KEY) is None


def test_status_and_logout(tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    settings = SettingsRepository(connection)
    transport = LoginTransport()
    service = JavdbLoginService(settings, JavdbApiClient(cast(Any, transport)))

    assert service.status()["configured"] is False
    service.login("user", "pass")
    status = service.status()
    assert status["ok"] is True
    assert status["configured"] is True
    assert status["account"]["username"] == "huhu1992"
    assert transport.gets[0][0] == "/api/v1/users"

    service.logout()
    assert settings.get(JAVDB_TOKEN_KEY) == ""
    assert service.status()["configured"] is False


def test_expired_token_status(tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    settings = SettingsRepository(connection)
    settings.upsert(JAVDB_TOKEN_KEY, "expired", True)

    class ExpiredTransport:
        def javdb_api_get(self, path: str, query: str, sig: str) -> str:
            del path, query, sig
            return json.dumps(
                {
                    "success": 0,
                    "action": "JWTVerificationError",
                    "message": "請登錄帳號",
                    "data": None,
                }
            )

    status = JavdbLoginService(
        settings,
        JavdbApiClient(cast(Any, ExpiredTransport())),
    ).status()

    assert status["configured"] is True
    assert status["ok"] is False
    assert "請登錄帳號" in str(status["message"])


def test_request_headers_include_raw_authorization() -> None:
    headers = make_request_headers("sig-1", "jwt-token")
    assert headers["jdsignature"] == "sig-1"
    assert headers["authorization"] == "jwt-token"
    assert "Bearer" not in headers["authorization"]


def setup_database(tmp_path: Path) -> Database:
    database = Database(tmp_path / "test.sqlite3")
    database.initialize()
    return database
