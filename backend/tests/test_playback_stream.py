from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.cloud115_types import CloudDownloadUrl, CloudItem
from app.api import playback_stream
from app.config import AppConfig
from app.database import Database
from app.dependencies import get_config
from app.errors import AppError, app_error_handler
from app.repositories.settings import SettingsRepository
from app.services.playback import PlaybackService
from tests.test_playback import FakeCloud

HASH = "c" * 40
VIDEO = bytes(range(256)) * 4


class ChunkedStream(httpx.AsyncByteStream):
    """模拟真实网络响应：未预读的分块流（content= 构造的响应会被 httpx 预先读完）。"""

    def __init__(self, data: bytes) -> None:
        self.data = data

    async def __aiter__(self) -> AsyncIterator[bytes]:
        for start in range(0, len(self.data), 256):
            yield self.data[start:start + 256]


class LinkCloud(FakeCloud):
    def __init__(self) -> None:
        super().__init__()
        self.link_requests = 0

    def get_download_url(self, file_id: str, pick_code: str | None = None) -> CloudDownloadUrl:
        self.link_requests += 1
        return CloudDownloadUrl(
            f"https://cdn.example/{pick_code}?v={self.link_requests}",
            {"user-agent": "", "cookie": "cdn"},
        )


@pytest.fixture
def stream_env(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[TestClient, LinkCloud, list[httpx.Request], str]:
    database = Database(tmp_path / "stream.sqlite3")
    database.initialize()
    config = AppConfig(database.path, "admin", "test-password", "test-secret", 24)
    with database.connect() as connection:
        SettingsRepository(connection).upsert("p115_download_dir_id", "download-root")
        connection.commit()

    cloud = LinkCloud()
    monkeypatch.setattr("app.api.tools.CloudServiceFactory.create", lambda _: cloud)
    monkeypatch.setattr(playback_stream, "_URL_CACHE", {})
    upstream_requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        upstream_requests.append(request)
        # 旧直链失效时 115 CDN 返回 403
        if request.url.params.get("v") == "1" and cloud.link_requests > 1:
            return httpx.Response(403)
        range_header = request.headers.get("range")
        if range_header == "bytes=10-19":
            return httpx.Response(
                206,
                stream=ChunkedStream(VIDEO[10:20]),
                headers={
                    "content-range": f"bytes 10-19/{len(VIDEO)}",
                    "content-length": "10",
                    "content-type": "application/octet-stream",
                    "set-cookie": "cdn=1",
                },
            )
        return httpx.Response(
            200,
            stream=ChunkedStream(VIDEO),
            headers={"content-length": str(len(VIDEO))},
        )

    monkeypatch.setattr(
        playback_stream,
        "_new_upstream_client",
        lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )

    app = FastAPI()
    app.include_router(playback_stream.router)
    app.add_exception_handler(AppError, app_error_handler)
    app.dependency_overrides[get_config] = lambda: config

    with database.connect() as connection:
        service = PlaybackService(cloud, "download-root", connection)
        session_id = str(service.create(f"magnet:?xt=urn:btih:{HASH}")["session_id"])
        cloud.complete(HASH, [CloudItem("main", "ABC-123.mkv", 3_000_000_000, False, "pc")])
        play_url = str(service.get(session_id)["play_url"])
    return TestClient(app), cloud, upstream_requests, play_url


def test_stream_forwards_range_and_115_headers(
    stream_env: tuple[TestClient, LinkCloud, list[httpx.Request], str],
) -> None:
    client, _, upstream_requests, play_url = stream_env

    response = client.get(play_url, headers={"Range": "bytes=10-19"})

    assert response.status_code == 206
    assert response.content == VIDEO[10:20]
    assert response.headers["content-range"] == f"bytes 10-19/{len(VIDEO)}"
    assert response.headers["content-type"] == "video/x-matroska"
    assert response.headers["accept-ranges"] == "bytes"
    assert "set-cookie" not in response.headers
    sent = upstream_requests[0].headers
    assert sent["range"] == "bytes=10-19"
    assert sent["user-agent"] == ""
    assert sent["cookie"] == "cdn"


def test_stream_head_and_full_body(
    stream_env: tuple[TestClient, LinkCloud, list[httpx.Request], str],
) -> None:
    client, cloud, _, play_url = stream_env

    head = client.head(play_url)
    full = client.get(play_url)

    assert head.status_code == 200
    assert head.headers["content-length"] == str(len(VIDEO))
    assert head.content == b""
    assert full.content == VIDEO
    assert cloud.link_requests == 1  # 直链在有效期内复用，不会每次拖动都请求 115


def test_stream_refreshes_expired_link_once(
    stream_env: tuple[TestClient, LinkCloud, list[httpx.Request], str],
) -> None:
    client, cloud, upstream_requests, play_url = stream_env
    assert client.get(play_url).status_code == 200
    cloud.link_requests += 1  # 模拟旧直链已失效

    response = client.get(play_url, headers={"Range": "bytes=10-19"})

    assert response.status_code == 206
    assert [request.url.params["v"] for request in upstream_requests] == ["1", "1", "3"]


def test_stream_rejects_unknown_token(
    stream_env: tuple[TestClient, LinkCloud, list[httpx.Request], str],
) -> None:
    client, _, upstream_requests, _ = stream_env

    response = client.get("/api/playback/stream/not-a-token/video.mkv")

    assert response.status_code == 404
    assert upstream_requests == []
