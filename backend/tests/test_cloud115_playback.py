from __future__ import annotations

from app.adapters.cloud115 import P115CloudClient


class FakeP115Client:
    def download_url(self, pick_code: str) -> str:
        assert pick_code == "pick-123"
        return "https://download.example/video.mp4?token=abc"

    def to_pickcode(self, file_id: str) -> str:
        assert file_id == "file-123"
        return "pick-from-id"


class FakePlaybackCloud(P115CloudClient):
    def _new_client(self, _: str) -> FakeP115Client:
        return FakeP115Client()


def test_get_download_url_uses_pick_code_when_available() -> None:
    url = FakePlaybackCloud("cookie").get_download_url("file-123", "pick-123")

    assert url == "https://download.example/video.mp4?token=abc"


def test_get_download_url_resolves_pick_code_from_file_id() -> None:
    client = FakePlaybackCloud("cookie")
    client.client.download_url = lambda pick_code: f"https://download.example/{pick_code}"

    url = client.get_download_url("file-123")

    assert url == "https://download.example/pick-from-id"
