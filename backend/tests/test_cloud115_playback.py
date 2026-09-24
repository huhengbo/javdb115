from __future__ import annotations

from app.adapters.cloud115 import P115CloudClient


class FakeP115Client:
    def __init__(self) -> None:
        self.deleted_payload: dict[str, object] | None = None

    def download_url(self, pick_code: str) -> str:
        assert pick_code == "pick-123"
        return "https://download.example/video.mp4?token=abc"

    def to_pickcode(self, file_id: str) -> str:
        assert file_id == "file-123"
        return "pick-from-id"

    def clouddownload_task_del(self, payload: dict[str, object]) -> dict[str, object]:
        self.deleted_payload = payload
        return {"state": True}


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


def test_delete_offline_task_keeps_downloaded_files() -> None:
    client = FakePlaybackCloud("cookie")

    client.delete_offline_task("hash-123")

    assert client.client.deleted_payload == {"hash[0]": "hash-123", "flag": 0}
