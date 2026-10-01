from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from app.adapters.cloud115_types import P115AccountInfo
from app.database import Database
from app.repositories.settings import SettingsRepository
from app.services.p115_login import P115QrLoginManager


class FakeP115Client:
    token_apps: list[str] = []

    @classmethod
    def login_qrcode_token(cls, app: str = "web") -> dict[str, Any]:
        cls.token_apps.append(app)
        return {"state": True, "data": {"uid": "qr-uid", "time": 1, "sign": "sig"}}

    @staticmethod
    def login_qrcode_scan_status(payload: dict[str, Any]) -> dict[str, Any]:
        assert payload["uid"] == "qr-uid"
        return {"state": True, "data": {"status": 2}}

    @staticmethod
    def login_qrcode_scan_result(uid: str, app: str) -> dict[str, Any]:
        assert uid == "qr-uid"
        assert app == "alipaymini"
        return {"state": True, "data": {"cookie": "UID=abc;"}}


class FakeCloudClient:
    def __init__(self, cookie: str) -> None:
        assert cookie == "UID=abc;"

    def account_info(self) -> P115AccountInfo:
        return P115AccountInfo("1", "user", "VIP", None, None, None, None)


def test_qrcode_login_saves_cookie_after_scan(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    connection = setup_database(tmp_path).connect()
    manager = P115QrLoginManager()
    monkeypatch.setattr("p115client.P115Client", FakeP115Client)
    monkeypatch.setattr("app.services.p115_login.P115CloudClient", FakeCloudClient)

    FakeP115Client.token_apps = []
    session = manager.start("alipaymini")
    result = manager.status(session.session_id, SettingsRepository(connection))

    # 二维码与换取 cookie 都绑定所选设备，扫码确认页才不会显示为网页端
    assert FakeP115Client.token_apps == ["alipaymini"]
    assert session.qrcode_url == "https://qrcodeapi.115.com/api/1.0/alipaymini/1.0/qrcode?uid=qr-uid"
    assert result["status"] == "succeeded"
    assert result["account"] == {
        "user_id": "1",
        "user_name": "user",
        "vip_label": "VIP",
        "vip_expires_at": None,
        "space_total": None,
        "space_used": None,
        "space_remaining": None,
    }
    assert SettingsRepository(connection).get("p115_cookie") == "UID=abc;"


def test_qrcode_long_poll_timeout_keeps_waiting(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    connection = setup_database(tmp_path).connect()
    manager = P115QrLoginManager()

    class TimeoutP115Client(FakeP115Client):
        @staticmethod
        def login_qrcode_scan_status(payload: dict[str, Any]) -> dict[str, Any]:
            # 115 长轮询超时且无人扫码时的真实响应
            return {"state": 1, "code": 0, "message": "", "data": {}}

    monkeypatch.setattr("p115client.P115Client", TimeoutP115Client)

    session = manager.start("alipaymini")
    result = manager.status(session.session_id, SettingsRepository(connection))

    assert result["status"] == "waiting"


def test_desktop_qrcode_uses_web_app(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("p115client.P115Client", FakeP115Client)
    FakeP115Client.token_apps = []

    session = P115QrLoginManager().start("desktop")

    assert FakeP115Client.token_apps == ["web"]
    assert "/api/1.0/web/1.0/qrcode" in session.qrcode_url
    assert session.device == "desktop"


def setup_database(tmp_path: Path) -> Database:
    database = Database(tmp_path / "test.sqlite3")
    database.initialize()
    return database
