from __future__ import annotations

from app.adapters.cloud115_types import CloudDirectory, CloudItem, CloudOfflineTask
from app.services.playback import PlaybackService


class FakeCloud:
    def __init__(self, items: list[CloudItem]) -> None:
        self.items = items
        self.deleted: list[str] = []
        self.created: list[tuple[str, str]] = []

    def list_directories(self, parent_id: str) -> list[CloudDirectory]:
        if parent_id == "download-root":
            return [CloudDirectory("play-root", ".play", None, True)]
        if parent_id == "play-root":
            return [CloudDirectory("source-dir", "owned-session", None, True)]
        return []

    def create_directory(self, parent_id: str, name: str) -> str:
        self.created.append((parent_id, name))
        return "play-root"

    def add_offline_url(self, url: str, target_dir_id: str, *, savepath: str | None = None) -> str:
        assert url.startswith("magnet:")
        assert target_dir_id == "play-root"
        assert savepath
        return "task-hash"

    def get_offline_tasks(self, task_ids: set[str]) -> dict[str, CloudOfflineTask]:
        assert task_ids == {"task-hash"}
        return {
            "task-hash": CloudOfflineTask(
                id="task-hash",
                status="completed",
                source_dir_id="source-dir",
                progress_percent=100,
                message=None,
                source_dir_name=None,
                download_root_id="play-root",
            )
        }

    def list_items(self, parent_id: str) -> list[CloudItem]:
        assert parent_id == "source-dir"
        return self.items

    def get_download_url(self, file_id: str, pick_code: str | None = None) -> str:
        return f"https://download.example/{pick_code or file_id}"

    def delete(self, file_ids: list[str]) -> None:
        self.deleted.extend(file_ids)


def test_playback_auto_selects_clear_main_video() -> None:
    cloud = FakeCloud(
        [
            CloudItem("main", "ABC-123.mkv", 4_000_000_000, False, "pc-main"),
            CloudItem("sample", "sample.mp4", 100_000_000, False, "pc-sample"),
        ]
    )
    service = PlaybackService(cloud, "download-root")

    created = service.create("magnet:?xt=urn:btih:test")
    result = service.get(str(created["session_id"]))

    assert result["status"] == "ready"
    assert result["file"] == {"id": "main", "name": "ABC-123.mkv", "size": 4_000_000_000}
    assert result["play_url"] == "https://download.example/pc-main"


def test_playback_requires_selection_for_similar_large_files() -> None:
    cloud = FakeCloud(
        [
            CloudItem("part-1", "ABC-123-CD1.mp4", 4_000_000_000, False, "pc-1"),
            CloudItem("part-2", "ABC-123-CD2.mp4", 3_800_000_000, False, "pc-2"),
        ]
    )
    service = PlaybackService(cloud, "download-root")

    created = service.create("magnet:?xt=urn:btih:test2")
    pending = service.get(str(created["session_id"]))

    assert pending["status"] == "select_required"
    assert len(pending["files"]) == 2

    ready = service.select(str(created["session_id"]), "part-2")
    assert ready["status"] == "ready"
    assert ready["play_url"] == "https://download.example/pc-2"
