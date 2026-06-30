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
from app.repositories.tasks import TasksRepository
from app.services.download_monitor import DownloadMonitorDependencies, DownloadMonitorService


class CategoryCompletedCloud:
    def __init__(self, code: str, completed_root_id: str) -> None:
        self.code = code
        self.completed_root_id = completed_root_id
        self.created_parent_id: str | None = None

    def get_offline_tasks(self, task_ids: set[str]) -> dict[str, CloudOfflineTask]:
        assert task_ids == {"done-hash"}
        return {"done-hash": completed_remote_task(self.code)}

    def list_directories(self, parent_id: str) -> list[CloudDirectory]:
        if parent_id == "download-root":
            return [CloudDirectory("source-dir", self.code, None, True)]
        assert parent_id == self.completed_root_id
        return []

    def list_items(self, parent_id: str) -> list[CloudItem]:
        if parent_id == "target-dir":
            return []
        assert parent_id == "source-dir"
        return [CloudItem("main-video", "movie.mkv", 500, False)]

    def create_directory(self, parent_id: str, name: str) -> str:
        self.created_parent_id = parent_id
        assert name == self.code
        return "target-dir"

    def rename(self, file_id: str, name: str) -> None:
        assert (file_id, name) == ("main-video", f"{self.code}.mkv")

    def move(self, file_ids: list[str], target_dir_id: str) -> None:
        assert file_ids == ["main-video"]
        assert target_dir_id == "target-dir"

    def delete(self, file_ids: list[str]) -> None:
        assert file_ids == ["source-dir"]

    def upload_bytes(self, parent_id: str, filename: str, content: bytes) -> None:
        assert parent_id == "target-dir"
        assert filename == f"{self.code}.nfo"
        assert content


def test_monitor_uses_category_completed_directory(
    monkeypatch: MonkeyPatch,
    tmp_path: Path,
) -> None:
    connection = setup_database(tmp_path).connect()
    create_submitted_task(connection, "done-hash", "FC2-3179516")
    settings = SettingsRepository(connection)
    settings.upsert("p115_completed_dir_mode", "category", False)
    settings.upsert("p115_completed_fc2_dir_id", "fc2-root", False)
    cloud = CategoryCompletedCloud("FC2-3179516", "fc2-root")
    monkeypatch.setattr(
        "app.services.download_monitor.CloudServiceFactory.create",
        lambda self: cloud,
    )

    result = service(connection).poll_unfinished()

    assert result.completed_count == 1
    assert cloud.created_parent_id == "fc2-root"


def create_submitted_task(connection: Connection, cloud_task_id: str, code: str) -> None:
    catalog = CatalogRepository(connection)
    work_id = catalog.upsert_work(
        JavdbWork(
            code=code,
            title="Sample",
            cover_url=None,
            release_date=None,
            source_url="https://javdb.com/v/abc",
            actors=["Actor"],
            magnets=[],
        ),
        "submitted",
    )
    magnet_id = catalog.add_magnet(
        work_id,
        JavdbMagnet(f"{code}.torrent", "magnet:?xt=urn:btih:test", 100),
        "manual",
        "manual_submit",
        0,
    )
    tasks = TasksRepository(connection)
    task_id = tasks.create(work_id, None, magnet_id)
    tasks.update_status(task_id, "submitted", "manual_115_submitted", cloud_task_id=cloud_task_id)
    SettingsRepository(connection).upsert("p115_download_dir_id", "download-root", False)
    SettingsRepository(connection).upsert("p115_completed_dir_id", "completed-root", False)


def completed_remote_task(source_dir_name: str) -> CloudOfflineTask:
    return CloudOfflineTask(
        "done-hash", "completed", "source-dir", 100, None, source_dir_name, "download-root"
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
