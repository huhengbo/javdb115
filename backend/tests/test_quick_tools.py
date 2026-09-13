from __future__ import annotations

from pathlib import Path

import pytest

from app.api.tools import OfflineDownloadRequest, submit_offline_download
from app.database import Database
from app.errors import ValidationAppError
from app.repositories.settings import SettingsRepository


class FakeCloud:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def add_offline_url(self, url: str, target_dir_id: str, *, savepath: str | None = None) -> str:
        del savepath
        self.calls.append((url, target_dir_id))
        return "task-1"


def test_quick_offline_uses_configured_download_directory(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    database = Database(tmp_path / "test.sqlite3")
    database.initialize()
    connection = database.connect()
    settings = SettingsRepository(connection)
    settings.upsert("p115_download_dir_id", "download-root", False)
    cloud = FakeCloud()
    monkeypatch.setattr("app.api.tools.CloudServiceFactory.create", lambda _: cloud)

    result = submit_offline_download(
        OfflineDownloadRequest(url="  https://example.com/file  "),
        connection,
    )

    assert result == {"ok": True, "task_id": "task-1"}
    assert cloud.calls == [("https://example.com/file", "download-root")]


def test_quick_offline_requires_download_directory(tmp_path: Path) -> None:
    database = Database(tmp_path / "test.sqlite3")
    database.initialize()
    connection = database.connect()

    with pytest.raises(ValidationAppError, match="115 下载临时目录"):
        submit_offline_download(OfflineDownloadRequest(url="https://example.com/file"), connection)
