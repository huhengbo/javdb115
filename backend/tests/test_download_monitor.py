from __future__ import annotations

from pathlib import Path
from sqlite3 import Connection
from typing import cast

from pytest import MonkeyPatch

from app.adapters.cloud115 import Cloud115Client
from app.adapters.cloud115_types import CloudDirectory, CloudItem, CloudOfflineTask
from app.database import Database
from app.javdb_models import JavdbMagnet, JavdbWork
from app.repositories.catalog import CatalogRepository
from app.repositories.logs import LogsRepository
from app.repositories.settings import SettingsRepository
from app.repositories.tasks import TasksRepository
from app.services.download_monitor import DownloadMonitorDependencies, DownloadMonitorService
from app.services.organizer import CloudOrganizer


class CompletedCloud:
    def __init__(self) -> None:
        self.renamed: list[tuple[str, str]] = []
        self.moved: tuple[list[str], str] | None = None
        self.deleted: list[str] = []
        self.uploaded: list[tuple[str, str, bytes]] = []

    def get_offline_tasks(self, task_ids: set[str]) -> dict[str, CloudOfflineTask]:
        assert task_ids == {"done-hash"}
        return {"done-hash": CloudOfflineTask("done-hash", "completed", "source-dir", 100, None)}

    def list_items(self, parent_id: str) -> list[CloudItem]:
        if parent_id == "target-dir":
            return []
        assert parent_id == "source-dir"
        return [
            CloudItem("small-video", "ad.mp4", 100, False),
            CloudItem("main-video", "movie.mkv", 500, False),
            CloudItem("subtitle", "movie.srt", 1, False),
        ]

    def list_directories(self, parent_id: str) -> list[CloudDirectory]:
        assert parent_id == "completed-root"
        return []

    def create_directory(self, parent_id: str, name: str) -> str:
        assert parent_id == "completed-root"
        assert name == "ABC-123"
        return "target-dir"

    def rename(self, file_id: str, name: str) -> None:
        self.renamed.append((file_id, name))

    def move(self, file_ids: list[str], target_dir_id: str) -> None:
        self.moved = (file_ids, target_dir_id)

    def delete(self, file_ids: list[str]) -> None:
        self.deleted.extend(file_ids)

    def upload_bytes(self, parent_id: str, filename: str, content: bytes) -> None:
        self.uploaded.append((parent_id, filename, content))


class FailedCloud:
    def get_offline_tasks(self, task_ids: set[str]) -> dict[str, CloudOfflineTask]:
        assert task_ids == {"bad-hash"}
        return {"bad-hash": CloudOfflineTask("bad-hash", "failed", None, None, "资源失效")}


class DownloadingCloud:
    def get_offline_tasks(self, task_ids: set[str]) -> dict[str, CloudOfflineTask]:
        assert task_ids == {"run-hash"}
        return {"run-hash": CloudOfflineTask("run-hash", "downloading", None, 50, None)}


class PartialMoveCloud:
    def __init__(self) -> None:
        self.moved: tuple[list[str], str] | None = None
        self.deleted: list[str] = []
        self.created = False

    def list_directories(self, parent_id: str) -> list[CloudDirectory]:
        assert parent_id == "completed-root"
        return [CloudDirectory("target-dir", "ABC-123", None, True)]

    def list_items(self, parent_id: str) -> list[CloudItem]:
        if parent_id == "target-dir":
            return [CloudItem("main-video", "ABC-123.mkv", 500, False)]
        assert parent_id == "source-dir"
        return [
            CloudItem("subtitle", "ABC-123.srt", 1, False),
            CloudItem("ad-file", "ad.url", 1, False),
        ]

    def create_directory(self, parent_id: str, name: str) -> str:
        self.created = True
        return "target-dir"

    def rename(self, file_id: str, name: str) -> None:
        raise AssertionError("partial cleanup should not rename the existing main video")

    def move(self, file_ids: list[str], target_dir_id: str) -> None:
        self.moved = (file_ids, target_dir_id)

    def delete(self, file_ids: list[str]) -> None:
        self.deleted.extend(file_ids)


def test_monitor_organizes_completed_task(monkeypatch: MonkeyPatch, tmp_path: Path) -> None:
    database = setup_database(tmp_path)
    connection = database.connect()
    task_id = create_submitted_task(connection, "done-hash")
    cloud = CompletedCloud()
    monkeypatch.setattr(
        "app.services.download_monitor.CloudServiceFactory.create",
        lambda self: cloud,
    )

    result = service(connection).poll_unfinished()
    task = TasksRepository(connection).list_all()[0]
    logs = LogsRepository(connection).list()

    assert result.completed_count == 1
    assert task["id"] == task_id
    assert task["status"] == "completed"
    assert task["stage"] == "115_organized"
    assert task["cloud_file_id"] == "target-dir"
    assert task["cloud_file_name"] == "ABC-123"
    assert task["work"]["status"] == "completed"
    assert cloud.renamed == [
        ("main-video", "ABC-123.mkv"),
        ("subtitle", "ABC-123.srt"),
    ]
    assert cloud.moved == (["main-video", "subtitle"], "target-dir")
    assert cloud.deleted == ["small-video", "source-dir"]
    assert cloud.uploaded[0][0:2] == ("target-dir", "ABC-123.nfo")
    assert b"<title>Sample</title>" in cloud.uploaded[0][2]
    assert logs[0]["stage"] == "115_organized"


def test_organizer_preserves_code_variant_suffix_from_main_video_name() -> None:
    cloud = VariantSuffixCloud()

    plan = CloudOrganizer(cast(Cloud115Client, cloud)).organize(
        "source-dir",
        "completed-root",
        "SONE-801",
    )

    assert plan.target_dir_id == "target-dir"
    assert cloud.created_name == "SONE-801-UC"
    assert cloud.renamed == ("main-video", "SONE-801-UC.mkv")


def test_organizer_preserves_u_code_variant_suffix_from_main_video_name() -> None:
    cloud = VariantSuffixCloud("SONE-801-U")

    CloudOrganizer(cast(Cloud115Client, cloud)).organize(
        "source-dir",
        "completed-root",
        "SONE-801",
    )

    assert cloud.created_name == "SONE-801-U"
    assert cloud.renamed == ("main-video", "SONE-801-U.mkv")


def test_organizer_preserves_c_code_variant_suffix_from_main_video_name() -> None:
    cloud = VariantSuffixCloud("SONE-801-C")

    CloudOrganizer(cast(Cloud115Client, cloud)).organize(
        "source-dir",
        "completed-root",
        "SONE-801",
    )

    assert cloud.created_name == "SONE-801-C"
    assert cloud.renamed == ("main-video", "SONE-801-C.mkv")


def test_monitor_marks_failed_remote_task(monkeypatch: MonkeyPatch, tmp_path: Path) -> None:
    database = setup_database(tmp_path)
    connection = database.connect()
    create_submitted_task(connection, "bad-hash")
    monkeypatch.setattr(
        "app.services.download_monitor.CloudServiceFactory.create",
        lambda self: FailedCloud(),
    )

    result = service(connection).poll_unfinished()
    task = TasksRepository(connection).list_all()[0]

    assert result.failed_count == 1
    assert task["status"] == "failed"
    assert task["stage"] == "115_download_failed"
    assert task["error_message"] == "资源失效"
    assert task["work"]["status"] == "failed"


def test_monitor_marks_running_task_as_downloading(
    monkeypatch: MonkeyPatch,
    tmp_path: Path,
) -> None:
    database = setup_database(tmp_path)
    connection = database.connect()
    create_submitted_task(connection, "run-hash")
    monkeypatch.setattr(
        "app.services.download_monitor.CloudServiceFactory.create",
        lambda self: DownloadingCloud(),
    )

    result = service(connection).poll_unfinished()
    task = TasksRepository(connection).list_all()[0]

    assert result.downloading_count == 1
    assert task["status"] == "downloading"
    assert task["stage"] == "115_downloading"


def test_organizer_recovers_after_main_video_was_already_moved() -> None:
    cloud = PartialMoveCloud()

    plan = CloudOrganizer(cast(Cloud115Client, cloud)).organize(
        "source-dir",
        "completed-root",
        "ABC-123",
    )

    assert plan.target_dir_id == "target-dir"
    assert plan.main_video.id == "main-video"
    assert cloud.created is False
    assert cloud.moved == (["subtitle"], "target-dir")
    assert cloud.deleted == ["ad-file", "source-dir"]


def test_organizer_refuses_to_delete_when_source_is_target() -> None:
    cloud = SameSourceTargetCloud()

    try:
        CloudOrganizer(cast(Cloud115Client, cloud)).organize(
            "source-dir",
            "completed-root",
            "ABC-123",
        )
    except ValueError as exc:
        assert "source folder and target folder are the same" in str(exc)
    else:
        raise AssertionError("Expected organizer to refuse same source and target folders")
    assert cloud.deleted == []


class SameSourceTargetCloud:
    def __init__(self) -> None:
        self.deleted: list[str] = []

    def list_directories(self, parent_id: str) -> list[CloudDirectory]:
        assert parent_id == "completed-root"
        return [CloudDirectory("source-dir", "ABC-123", None, True)]

    def list_items(self, parent_id: str) -> list[CloudItem]:
        assert parent_id == "source-dir"
        return [CloudItem("main-video", "ABC-123.mkv", 500, False)]

    def delete(self, file_ids: list[str]) -> None:
        self.deleted.extend(file_ids)


class VariantSuffixCloud:
    def __init__(self, filename_code: str = "SONE-801-UC") -> None:
        self.filename_code = filename_code
        self.created_name: str | None = None
        self.renamed: tuple[str, str] | None = None

    def list_items(self, parent_id: str) -> list[CloudItem]:
        if parent_id == "target-dir":
            return []
        assert parent_id == "source-dir"
        return [
            CloudItem("main-video", f"{self.filename_code}_variant.mkv", 500, False),
            CloudItem("subtitle", f"{self.filename_code}.srt", 1, False),
        ]

    def list_directories(self, parent_id: str) -> list[CloudDirectory]:
        assert parent_id == "completed-root"
        return []

    def create_directory(self, parent_id: str, name: str) -> str:
        assert parent_id == "completed-root"
        self.created_name = name
        return "target-dir"

    def rename(self, file_id: str, name: str) -> None:
        self.renamed = (file_id, name)

    def move(self, file_ids: list[str], target_dir_id: str) -> None:
        assert file_ids == ["main-video", "subtitle"]
        assert target_dir_id == "target-dir"

    def delete(self, file_ids: list[str]) -> None:
        assert file_ids == ["source-dir"]


def create_submitted_task(connection: Connection, cloud_task_id: str) -> int:
    catalog = CatalogRepository(connection)
    work_id = catalog.upsert_work(
        JavdbWork(
            code="ABC-123",
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
        JavdbMagnet("ABC-123.torrent", "magnet:?xt=urn:btih:test", 100),
        "manual",
        "manual_submit",
        0,
    )
    tasks = TasksRepository(connection)
    task_id = tasks.create(work_id, None, magnet_id)
    tasks.update_status(task_id, "submitted", "manual_115_submitted", cloud_task_id=cloud_task_id)
    SettingsRepository(connection).upsert("p115_completed_dir_id", "completed-root", False)
    return task_id


def service(connection: Connection) -> DownloadMonitorService:
    return DownloadMonitorService(
        DownloadMonitorDependencies(
            catalog=CatalogRepository(connection),
            logs=LogsRepository(connection),
            settings=SettingsRepository(connection),
            tasks=TasksRepository(connection),
        )
    )


def setup_database(tmp_path: Path) -> Database:
    database = Database(tmp_path / "test.sqlite3")
    database.initialize()
    return database
