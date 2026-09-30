from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from sqlite3 import Connection

import pytest

from app.adapters.cloud115_types import (
    CloudDirectory,
    CloudDownloadUrl,
    CloudItem,
    CloudOfflineTask,
)
from app.database import Database
from app.errors import IntegrationError, NotFoundError, ValidationAppError
from app.repositories.playback import PlaybackRepository
from app.repositories.tasks import TasksRepository
from app.services.playback import (
    PlaybackService,
    magnet_info_hash,
    release_playback_sessions,
)

HASH_A = "a" * 40
HASH_B = "b" * 40
MAGNET_A = f"magnet:?xt=urn:btih:{HASH_A}&dn=ABC-123"
MAGNET_B = f"magnet:?xt=urn:btih:{HASH_B}"
GB = 1_000_000_000


class FakeCloud:
    """按 115 行为模拟：重复磁力返回已有任务，文件落在旧任务的目录中。"""

    def __init__(self) -> None:
        self.directories: dict[str, list[CloudDirectory]] = {"download-root": []}
        self.items: dict[str, list[CloudItem]] = {}
        self.tasks: dict[str, CloudOfflineTask] = {}
        self.offline_adds: list[tuple[str, str]] = []
        self.deleted: list[str] = []
        self.deleted_offline_tasks: list[str] = []
        self.fail_delete = False
        self._next_id = 0

    def list_directories(self, parent_id: str) -> list[CloudDirectory]:
        return list(self.directories.get(parent_id, []))

    def create_directory(self, parent_id: str, name: str) -> str:
        self._next_id += 1
        directory_id = f"dir-{self._next_id}"
        self.directories.setdefault(parent_id, []).append(
            CloudDirectory(directory_id, name, None, True)
        )
        self.directories[directory_id] = []
        return directory_id

    def add_offline_url(self, url: str, target_dir_id: str, *, savepath: str | None = None) -> str:
        del savepath
        task_hash = magnet_info_hash(url)
        assert task_hash is not None
        self.offline_adds.append((task_hash, target_dir_id))
        if task_hash not in self.tasks:
            self.tasks[task_hash] = CloudOfflineTask(
                id=task_hash,
                status="downloading",
                source_dir_id=None,
                progress_percent=30,
                message=None,
                download_root_id=target_dir_id,
            )
        return task_hash

    def complete(self, task_hash: str, files: list[CloudItem]) -> None:
        task = self.tasks[task_hash]
        self.tasks[task_hash] = CloudOfflineTask(
            id=task.id,
            status="completed",
            source_dir_id=None,
            progress_percent=100,
            message=None,
            download_root_id=task.download_root_id,
        )
        self.items[str(task.download_root_id)] = files

    def get_offline_tasks(self, task_ids: set[str]) -> dict[str, CloudOfflineTask]:
        return {task_id: self.tasks[task_id] for task_id in task_ids if task_id in self.tasks}

    def list_offline_tasks(self) -> list[CloudOfflineTask]:
        return list(self.tasks.values())

    def list_items(self, parent_id: str) -> list[CloudItem]:
        return list(self.items.get(parent_id, []))

    def get_download_url(self, file_id: str, pick_code: str | None = None) -> CloudDownloadUrl:
        return CloudDownloadUrl(
            f"https://cdn.example/{pick_code or file_id}",
            {"user-agent": ""},
        )

    def delete_offline_task(self, task_id: str) -> None:
        if self.fail_delete:
            raise RuntimeError("115 busy")
        self.deleted_offline_tasks.append(task_id)
        self.tasks.pop(task_id, None)

    def delete(self, file_ids: list[str]) -> None:
        if self.fail_delete:
            raise RuntimeError("115 busy")
        self.deleted.extend(file_ids)
        removed = set(file_ids)
        for parent_id, children in self.directories.items():
            self.directories[parent_id] = [item for item in children if item.id not in removed]
        for parent_id, files in self.items.items():
            self.items[parent_id] = [item for item in files if item.id not in removed]


@pytest.fixture
def connection(tmp_path: Path) -> Iterator[Connection]:
    database = Database(tmp_path / "playback.sqlite3")
    database.initialize()
    with database.connect() as connection:
        yield connection


def _session_dir(connection: Connection, session_id: str) -> str:
    session = PlaybackRepository(connection).get(session_id)
    assert session is not None and session.session_dir_id is not None
    return session.session_dir_id


def _expire(connection: Connection, session_id: str) -> None:
    connection.execute(
        "UPDATE playback_sessions SET expires_at = '2000-01-01T00:00:00+00:00' WHERE id = ?",
        (session_id,),
    )
    connection.commit()


def test_magnet_info_hash_normalizes_hex_and_base32() -> None:
    assert magnet_info_hash(f"magnet:?xt=urn:btih:{HASH_A.upper()}") == HASH_A
    base32 = "MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43U"
    assert magnet_info_hash(f"magnet:?xt=urn:btih:{base32}") == (
        "6162636465666768696a6b6c6d6e6f7071727374"
    )
    assert magnet_info_hash("https://example.com/a.torrent") is None


def test_auto_select_keeps_main_video_and_returns_proxy_url(connection: Connection) -> None:
    cloud = FakeCloud()
    service = PlaybackService(cloud, "download-root", connection)

    created = service.create(MAGNET_A)
    session_id = str(created["session_id"])
    assert created["status"] == "offline_waiting"
    assert created["play_url"] is None
    cloud.complete(
        HASH_A,
        [
            CloudItem("main", "ABC-123.mkv", 4 * GB, False, "pc-main"),
            CloudItem("sample", "sample.mp4", 100_000_000, False, "pc-sample"),
            CloudItem("subtitle", "ABC-123.zh.srt", 120_000, False, "pc-sub"),
            CloudItem("ad", "最新地址.txt", 2_000, False, "pc-ad"),
        ],
    )

    result = service.get(session_id)

    assert result["status"] == "ready"
    assert result["file"] == {"id": "main", "name": "ABC-123.mkv", "size": 4 * GB}
    play_url = str(result["play_url"])
    assert play_url.startswith("/api/playback/stream/")
    assert play_url.endswith("/ABC-123.mkv")
    assert "cdn.example" not in play_url
    assert cloud.deleted == ["sample", "ad"]
    item, source = service.stream_source(play_url.split("/")[4])
    assert item.id == "main"
    assert source.url == "https://cdn.example/pc-main"
    assert source.headers == {"user-agent": ""}


def test_multi_part_selection_keeps_every_part_and_allows_switching(
    connection: Connection,
) -> None:
    cloud = FakeCloud()
    service = PlaybackService(cloud, "download-root", connection)
    session_id = str(service.create(MAGNET_A)["session_id"])
    cloud.complete(
        HASH_A,
        [
            CloudItem("part-1", "ABC-123-CD1.mp4", 4 * GB, False, "pc-1"),
            CloudItem("part-2", "ABC-123-CD2.mp4", int(3.8 * GB), False, "pc-2"),
        ],
    )

    pending = service.get(session_id)
    assert pending["status"] == "select_required"
    assert len(pending["files"]) == 2  # type: ignore[arg-type]

    first = service.select(session_id, "part-2")
    assert first["status"] == "ready"
    assert str(first["play_url"]).endswith("/ABC-123-CD2.mp4")
    second = service.select(session_id, "part-1")
    assert str(second["play_url"]).endswith("/ABC-123-CD1.mp4")
    assert cloud.deleted == []
    with pytest.raises(ValidationAppError):
        service.select(session_id, "missing")


def test_same_magnet_reuses_active_session(connection: Connection) -> None:
    cloud = FakeCloud()
    service = PlaybackService(cloud, "download-root", connection)
    first = service.create(MAGNET_A)
    cloud.complete(HASH_A, [CloudItem("main", "ABC-123.mp4", 2 * GB, False, "pc-main")])
    service.get(str(first["session_id"]))

    second = service.create(f"magnet:?xt=urn:btih:{HASH_A.upper()}")

    assert second["session_id"] == first["session_id"]
    assert second["status"] == "ready"
    assert len(cloud.offline_adds) == 1


def test_expired_session_is_released_before_resubmitting(connection: Connection) -> None:
    cloud = FakeCloud()
    service = PlaybackService(cloud, "download-root", connection)
    first = str(service.create(MAGNET_A)["session_id"])
    old_dir = _session_dir(connection, first)
    cloud.complete(HASH_A, [CloudItem("main", "ABC-123.mp4", 2 * GB, False, "pc-main")])
    _expire(connection, first)

    with pytest.raises(NotFoundError):
        service.get(first)
    second = service.create(MAGNET_A)

    assert second["session_id"] != first
    assert cloud.deleted_offline_tasks == [HASH_A]
    assert old_dir in cloud.deleted
    new_dir = _session_dir(connection, str(second["session_id"]))
    assert cloud.offline_adds[-1] == (HASH_A, new_dir)
    cloud.complete(HASH_A, [CloudItem("main2", "ABC-123.mp4", 2 * GB, False, "pc-2")])
    assert service.get(str(second["session_id"]))["status"] == "ready"


def test_release_failure_blocks_new_session_without_leaking(connection: Connection) -> None:
    cloud = FakeCloud()
    service = PlaybackService(cloud, "download-root", connection)
    first = str(service.create(MAGNET_A)["session_id"])
    _expire(connection, first)
    cloud.fail_delete = True

    with pytest.raises(IntegrationError):
        service.create(MAGNET_A)

    cloud.fail_delete = False
    assert service.create(MAGNET_B)["status"] == "offline_waiting"


def test_formal_task_in_progress_rejects_playback(connection: Connection) -> None:
    tasks = TasksRepository(connection)
    task_id = tasks.create(None, None, None)
    tasks.update_status(task_id, "downloading", "115_downloading", cloud_task_id=HASH_A)
    connection.commit()
    cloud = FakeCloud()

    with pytest.raises(ValidationAppError):
        PlaybackService(cloud, "download-root", connection).create(MAGNET_A)
    assert cloud.offline_adds == []


def test_completed_formal_task_plays_library_files_without_deleting(
    connection: Connection,
) -> None:
    tasks = TasksRepository(connection)
    task_id = tasks.create(None, None, None)
    tasks.update_status(
        task_id, "completed", "done", cloud_task_id=HASH_A.upper(), cloud_file_id="library-dir"
    )
    connection.commit()
    cloud = FakeCloud()
    cloud.items["library-dir"] = [
        CloudItem("movie", "ABC-123.mp4", 3 * GB, False, "pc-movie"),
        CloudItem("poster", "poster.jpg", 200_000, False, "pc-poster"),
    ]
    service = PlaybackService(cloud, "download-root", connection)

    result = service.create(MAGNET_A)
    session = PlaybackRepository(connection).get(str(result["session_id"]))
    assert session is not None
    _expire(connection, session.id)
    service.cleanup_due()

    assert result["status"] == "ready"
    assert cloud.offline_adds == []
    assert cloud.deleted == []
    assert cloud.deleted_offline_tasks == []
    assert PlaybackRepository(connection).get(session.id) is None


def test_foreign_duplicate_task_is_not_deleted(connection: Connection) -> None:
    cloud = FakeCloud()
    cloud.tasks[HASH_A] = CloudOfflineTask(
        id=HASH_A,
        status="completed",
        source_dir_id=None,
        progress_percent=100,
        message=None,
        download_root_id="someone-else-dir",
    )
    service = PlaybackService(cloud, "download-root", connection)

    session_id = str(service.create(MAGNET_A)["session_id"])
    result = service.get(session_id)
    _expire(connection, session_id)
    service.cleanup_due()

    assert result["status"] == "failed"
    assert "115 离线列表删除" in str(result["message"])
    assert HASH_A in cloud.tasks
    assert cloud.deleted_offline_tasks == []


def test_orphan_play_directory_is_healed_and_resubmitted(connection: Connection) -> None:
    cloud = FakeCloud()
    play_root = cloud.create_directory("download-root", ".play")
    orphan_dir = cloud.create_directory(play_root, "0123456789abcdef")
    cloud.add_offline_url(MAGNET_A, orphan_dir)
    cloud.offline_adds.clear()
    service = PlaybackService(cloud, "download-root", connection)

    session_id = str(service.create(MAGNET_A)["session_id"])
    result = service.get(session_id)

    session_dir = _session_dir(connection, session_id)
    assert result["status"] == "offline_waiting"
    assert cloud.deleted_offline_tasks == [HASH_A]
    assert orphan_dir in cloud.deleted
    assert cloud.offline_adds == [(HASH_A, session_dir), (HASH_A, session_dir)]
    assert cloud.tasks[HASH_A].download_root_id == session_dir


def test_cleanup_orphan_directories_skips_known_sessions(connection: Connection) -> None:
    cloud = FakeCloud()
    service = PlaybackService(cloud, "download-root", connection)
    session_id = str(service.create(MAGNET_B)["session_id"])
    play_root = cloud.directories["download-root"][0].id
    orphan_dir = cloud.create_directory(play_root, "fedcba9876543210")
    cloud.add_offline_url(MAGNET_A, orphan_dir)

    service.cleanup_orphan_directories()

    assert cloud.deleted_offline_tasks == [HASH_A]
    assert cloud.deleted == [orphan_dir]
    assert HASH_B in cloud.tasks
    assert PlaybackRepository(connection).get(session_id) is not None


def test_cleanup_due_keeps_going_after_failures(connection: Connection) -> None:
    cloud = FakeCloud()
    service = PlaybackService(cloud, "download-root", connection)
    first = str(service.create(MAGNET_A)["session_id"])
    _expire(connection, first)
    cloud.fail_delete = True

    service.cleanup_due()

    stale = PlaybackRepository(connection).get(first)
    assert stale is not None and stale.cleanup_error == "115 busy"
    cloud.fail_delete = False
    service.cleanup_due()
    assert PlaybackRepository(connection).get(first) is None
    assert cloud.deleted_offline_tasks == [HASH_A]


def test_release_playback_sessions_before_formal_offline(connection: Connection) -> None:
    cloud = FakeCloud()
    service = PlaybackService(cloud, "download-root", connection)
    session_id = str(service.create(MAGNET_A)["session_id"])
    session_dir = _session_dir(connection, session_id)

    release_playback_sessions(connection, cloud, MAGNET_A)
    release_playback_sessions(connection, cloud, "https://not-a-magnet")

    assert cloud.deleted_offline_tasks == [HASH_A]
    assert session_dir in cloud.deleted
    assert PlaybackRepository(connection).list_by_hash(HASH_A) == []


def test_stream_source_rejects_unknown_or_unready_token(connection: Connection) -> None:
    cloud = FakeCloud()
    service = PlaybackService(cloud, "download-root", connection)
    session_id = str(service.create(MAGNET_A)["session_id"])
    session = PlaybackRepository(connection).get(session_id)
    assert session is not None

    with pytest.raises(NotFoundError):
        service.stream_source("missing-token")
    with pytest.raises(NotFoundError):
        service.stream_source(session.stream_token)


def test_scheduled_cleanup_skips_until_115_configured(
    connection: Connection,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.main import _run_playback_cleanup
    from app.repositories.settings import SettingsRepository

    assert _run_playback_cleanup(connection, True) is False

    cloud = FakeCloud()
    service = PlaybackService(cloud, "download-root", connection)
    session_id = str(service.create(MAGNET_A)["session_id"])
    _expire(connection, session_id)
    settings = SettingsRepository(connection)
    settings.upsert("p115_download_dir_id", "download-root")
    settings.upsert("p115_cookie", "UID=test")
    monkeypatch.setattr("app.main.CloudServiceFactory.create", lambda _: cloud)

    assert _run_playback_cleanup(connection, True) is True
    assert PlaybackRepository(connection).get(session_id) is None
    assert cloud.deleted_offline_tasks == [HASH_A]
