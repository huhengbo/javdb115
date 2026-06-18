from __future__ import annotations

from pathlib import Path
from sqlite3 import Connection

from pytest import MonkeyPatch

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
