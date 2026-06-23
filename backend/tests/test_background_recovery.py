from __future__ import annotations

from pathlib import Path
from sqlite3 import Connection

from pytest import MonkeyPatch

from app.adapters.cloud115_types import CloudDirectory, CloudItem, CloudOfflineTask
from app.database import Database
from app.javdb_models import JavdbMagnet, JavdbWork
from app.repositories.catalog import CatalogRepository
from app.repositories.follows import FollowsRepository
from app.repositories.logs import LogsRepository
from app.repositories.settings import SettingsRepository
from app.repositories.task_events import TaskEventsRepository
from app.repositories.tasks import TasksRepository
from app.services.download_monitor import DownloadMonitorDependencies, DownloadMonitorService

OLD_TASK_TIMESTAMP = "2026-01-01T00:00:00+00:00"


def test_monitor_fails_stale_created_submission(
    monkeypatch: MonkeyPatch,
    tmp_path: Path,
) -> None:
    connection = setup_database(tmp_path).connect()
    task_id = create_stale_created_task(connection)
    monkeypatch.setattr("app.services.download_monitor.CloudServiceFactory.create", fail_cloud)

    result = service(connection).poll_unfinished()
    task = TasksRepository(connection).get(task_id)
    logs = LogsRepository(connection).list()
    events = TaskEventsRepository(connection).list_for_tasks([task_id])

    assert result.checked_count == 1
    assert result.failed_count == 1
    assert task is not None
    assert task["status"] == "failed"
    assert task["stage"] == "115_submit_incomplete"
    assert task["work"]["status"] == "failed"
    assert logs[0]["stage"] == "115_submit_incomplete"
    assert events[task_id][0]["to_stage"] == "115_submit_incomplete"


def test_monitor_recovers_stale_organizing_task(
    monkeypatch: MonkeyPatch,
    tmp_path: Path,
) -> None:
    connection = setup_database(tmp_path).connect()
    task_id = create_stale_organizing_task(connection)
    cloud = CompletedCloud()
    monkeypatch.setattr("app.services.download_monitor.CloudServiceFactory.create", lambda _: cloud)
    SettingsRepository(connection).upsert("p115_download_dir_id", "download-root", False)
    SettingsRepository(connection).upsert("p115_completed_dir_id", "completed-root", False)

    result = service(connection).poll_unfinished()
    task = TasksRepository(connection).get(task_id)
    logs = LogsRepository(connection).list()
    events = TaskEventsRepository(connection).list_for_tasks([task_id])

    assert result.checked_count == 1
    assert result.completed_count == 1
    assert task is not None
    assert task["status"] == "completed"
    assert task["stage"] == "115_organized"
    assert task["cloud_file_name"] == "ABC-123"
    assert cloud.moved == (["main-video"], "target-dir")
    assert logs[0]["stage"] == "115_organized"
    assert events[task_id][-1]["to_stage"] == "115_organized"


class CompletedCloud:
    def __init__(self) -> None:
        self.moved: tuple[list[str], str] | None = None

    def get_offline_tasks(self, task_ids: set[str]) -> dict[str, CloudOfflineTask]:
        assert task_ids == {"done-hash"}
        return {"done-hash": self._remote_task()}

    def list_directories(self, parent_id: str) -> list[CloudDirectory]:
        if parent_id == "download-root":
            return [CloudDirectory("source-dir", "ABC-123", None, True)]
        assert parent_id == "completed-root"
        return []

    def list_items(self, parent_id: str) -> list[CloudItem]:
        if parent_id == "target-dir":
            return []
        assert parent_id == "source-dir"
        return [CloudItem("main-video", "movie.mkv", 500, False)]

    def create_directory(self, parent_id: str, name: str) -> str:
        assert parent_id == "completed-root"
        assert name == "ABC-123"
        return "target-dir"

    def rename(self, file_id: str, name: str) -> None:
        assert (file_id, name) == ("main-video", "ABC-123.mkv")

    def move(self, file_ids: list[str], target_dir_id: str) -> None:
        self.moved = (file_ids, target_dir_id)

    def delete(self, file_ids: list[str]) -> None:
        assert file_ids == ["source-dir"]

    def upload_bytes(self, parent_id: str, filename: str, content: bytes) -> None:
        assert parent_id == "target-dir"
        assert filename == "ABC-123.nfo"
        assert b"ABC-123" in content

    def _remote_task(self) -> CloudOfflineTask:
        return CloudOfflineTask(
            "done-hash",
            "completed",
            "source-dir",
            100,
            None,
            "ABC-123",
            "download-root",
        )


def fail_cloud(self: object) -> object:
    raise AssertionError("stale pending recovery must not call 115")


def create_stale_created_task(connection: Connection) -> int:
    catalog = CatalogRepository(connection)
    work_id = catalog.upsert_work(sample_work(), "discovered")
    magnet_id = catalog.add_magnet(
        work_id,
        JavdbMagnet("ABC-123.torrent", "magnet:?xt=urn:btih:test", 100),
        "selected",
        "test",
        0,
    )
    task_id = TasksRepository(connection).create(work_id, None, magnet_id)
    connection.execute(
        "UPDATE tasks SET created_at = ?, updated_at = ? WHERE id = ?",
        (OLD_TASK_TIMESTAMP, OLD_TASK_TIMESTAMP, task_id),
    )
    connection.commit()
    return task_id


def create_stale_organizing_task(connection: Connection) -> int:
    task_id = create_stale_created_task(connection)
    TasksRepository(connection).update_status(
        task_id,
        "organizing",
        "115_organizing",
        cloud_task_id="done-hash",
    )
    connection.execute(
        "UPDATE tasks SET created_at = ?, updated_at = ? WHERE id = ?",
        (OLD_TASK_TIMESTAMP, OLD_TASK_TIMESTAMP, task_id),
    )
    connection.commit()
    return task_id


def sample_work() -> JavdbWork:
    return JavdbWork(
        code="ABC-123",
        title="Sample",
        cover_url=None,
        release_date=None,
        source_url="https://javdb.com/v/abc",
        actors=["Actor"],
        magnets=[],
    )


def service(connection: Connection) -> DownloadMonitorService:
    return DownloadMonitorService(
        DownloadMonitorDependencies(
            catalog=CatalogRepository(connection),
            follows=FollowsRepository(connection),
            logs=LogsRepository(connection),
            settings=SettingsRepository(connection),
            tasks=TasksRepository(connection),
        )
    )


def setup_database(tmp_path: Path) -> Database:
    database = Database(tmp_path / "test.sqlite3")
    database.initialize()
    return database
