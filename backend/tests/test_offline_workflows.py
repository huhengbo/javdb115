from __future__ import annotations

from pathlib import Path
from typing import Any, cast

from app.adapters.javdb_api import JavdbApiClient
from app.contracts import ActorCreate
from app.database import Database
from app.repositories.actors import ActorsRepository
from app.repositories.catalog import CatalogRepository
from app.repositories.follows import FollowsRepository
from app.repositories.logs import LogsRepository
from app.repositories.settings import SettingsRepository
from app.repositories.task_events import TaskEventsRepository
from app.repositories.tasks import TasksRepository
from app.services.follow_workflow import FollowWorkflowDependencies, FollowWorkflowService
from app.services.manual_offline import ManualOfflineDependencies, ManualOfflineService
from app.services.task_retry import TaskRetryDependencies, TaskRetryService

EMPTY_FILTER_RULES = '{"min_size_gb":0,"required_keywords":[],"excluded_keywords":[]}'


class FollowWorkflowClient(JavdbApiClient):
    def actor_detail(self, actor_id: str) -> dict:
        return {"id": actor_id, "type": 0}

    def actor_movies(
        self,
        actor_id: str,
        tag_ids: list[str] | None = None,
        sort_type: int = 0,
        page: int = 1,
        limit: int = 24,
    ) -> list[dict]:
        return [movie_summary()]

    def movie_detail(self, movie_id: str) -> dict:
        assert movie_id == "movie-1"
        return {
            **movie_summary(),
            "actors": [{"name": "Actor One"}],
            "tags": [{"id": "28"}],
            "type": 0,
        }

    def movie_magnets(self, movie_id: str) -> list[dict]:
        assert movie_id == "movie-1"
        return [{"hash": "hash-1", "name": "ONE-001.torrent", "size": 4096}]


class ManualClient:
    def movie_detail(self, movie_id: str) -> dict:
        assert movie_id == "abc123"
        return {
            "number": "ABC-123",
            "title": "Sample Movie",
            "cover_url": "https://c0.jdbstatic.com/covers/ab/abc123.jpg",
            "release_date": "2026-05-18",
            "actors": [{"id": "actor-1", "name": "Actor One"}],
        }

    def movie_magnets(self, movie_id: str) -> list[dict]:
        assert movie_id == "abc123"
        return [{"hash": "hash-1", "name": "ABC-123.torrent", "size": 2048}]

    def movie_source_url(self, movie_id: str) -> str:
        return f"https://javdb.com/v/{movie_id}"


class FakeCloud:
    def add_offline_url(
        self,
        url: str,
        target_dir_id: str,
        *,
        savepath: str | None = None,
    ) -> str:
        assert "hash-1" in url
        assert target_dir_id == "dir-1"
        assert savepath in {"ABC-123", "ONE-001"}
        return "cloud-task-1"


def test_manual_offline_service_creates_submitted_task(monkeypatch, tmp_path: Path) -> None:
    connection = setup_manual_database(monkeypatch, tmp_path)
    service = ManualOfflineService(manual_dependencies(connection))

    result = service.submit("abc123", "hash-1")
    task = TasksRepository(connection).list_all()[0]
    logs = LogsRepository(connection).list()
    events = TaskEventsRepository(connection).list_for_tasks([int(cast(int, task["id"]))])

    assert result.task_id == task["id"]
    assert task["status"] == "submitted"
    assert task["stage"] == "manual_115_submitted"
    assert task["actor"]["name"] == "Actor One"
    assert logs[0]["stage"] == "manual_115_submitted"
    assert events[int(cast(int, task["id"]))][0]["to_stage"] == "manual_115_submitted"


def test_manual_offline_duplicate_requires_force(monkeypatch, tmp_path: Path) -> None:
    connection = setup_manual_database(monkeypatch, tmp_path)
    service = ManualOfflineService(manual_dependencies(connection))

    first = service.submit("abc123", "hash-1")
    duplicate = service.submit("abc123", "hash-1")
    forced = service.submit("abc123", "hash-1", force=True)
    tasks = TasksRepository(connection).list_by_work_code("ABC-123")

    assert first.task_id is not None
    assert duplicate.task_id is None
    assert duplicate.duplicate_task is not None
    assert forced.task_id is not None
    assert len(tasks) == 2


def test_manual_offline_keeps_task_when_notification_fails(
    monkeypatch,
    tmp_path: Path,
) -> None:
    connection = setup_manual_database(monkeypatch, tmp_path)

    def fail_notification(self: Any, work: Any, size_label: str) -> None:
        raise RuntimeError("Telegram sendPhoto failed: HTTP 400")

    monkeypatch.setattr(
        "app.services.manual_offline.NotificationService.send_submitted",
        fail_notification,
    )

    result = ManualOfflineService(manual_dependencies(connection)).submit("abc123", "hash-1")
    task = TasksRepository(connection).get_raw(int(cast(int, result.task_id)))
    stages = [str(log["stage"]) for log in LogsRepository(connection).list()]

    assert task is not None
    assert task["status"] == "submitted"
    assert "notification_failed" in stages
    assert "manual_115_submitted" in stages


def test_task_retry_resubmits_failed_manual_task(monkeypatch, tmp_path: Path) -> None:
    connection = setup_manual_database(monkeypatch, tmp_path)
    result = ManualOfflineService(manual_dependencies(connection)).submit("abc123", "hash-1")
    task_id = int(cast(int, result.task_id))
    TasksRepository(connection).update_status(task_id, "failed", "115_submit_failed")
    monkeypatch.setattr(
        "app.services.task_retry.CloudServiceFactory.create",
        lambda self: FakeCloud(),
    )

    TaskRetryService(task_retry_dependencies(connection)).retry(task_id)

    task = TasksRepository(connection).list_all()[0]
    assert task["status"] == "submitted"
    assert task["stage"] == "manual_115_resubmitted"


def test_follow_workflow_creates_submitted_task(monkeypatch, tmp_path: Path) -> None:
    connection = setup_follow_database(monkeypatch, tmp_path)
    follow = actor_follow(connection, ["s", "c"], ["单体作品", "含字幕"])
    FollowsRepository(connection).add_seen_movies(int(cast(int, follow["id"])), ["old-movie"])

    result = FollowWorkflowService(follow_dependencies(connection)).check_follow(
        int(cast(int, follow["id"]))
    )

    task = TasksRepository(connection).list_all()[0]
    assert result.processed_count == 1
    assert task["status"] == "submitted"
    assert task["work"]["code"] == "ONE-001"
    assert task["actor"]["name"] == "Actor One"


def test_follow_workflow_retry_uses_follow_rule(monkeypatch, tmp_path: Path) -> None:
    connection = setup_follow_database(monkeypatch, tmp_path)
    follow = actor_follow(connection, ["s"], ["单体作品"])
    FollowsRepository(connection).add_seen_movies(int(cast(int, follow["id"])), ["old-movie"])
    service = FollowWorkflowService(follow_dependencies(connection))
    service.check_follow(int(cast(int, follow["id"])))
    task_id = TasksRepository(connection).list_all()[0]["id"]

    service.retry_task(int(cast(int, task_id)))

    assert len(TasksRepository(connection).list_all()) >= 1


def movie_summary() -> dict:
    return {
        "id": "movie-1",
        "number": "ONE-001",
        "title": "Movie One",
        "thumb_url": "https://c0.jdbstatic.com/covers/mo/movie-1.jpg",
        "cover_url": "https://c0.jdbstatic.com/covers/mo/movie-1.jpg",
        "duration": 120,
        "release_date": "2026-05-18",
        "score": "4.5",
        "can_play": True,
        "has_cnsub": True,
        "has_preview_images": True,
        "magnets_count": 1,
    }


def setup_manual_database(monkeypatch, tmp_path: Path) -> Any:
    connection = setup_database(tmp_path).connect()
    SettingsRepository(connection).upsert("p115_download_dir_id", "dir-1", False)
    ActorsRepository(connection).create(
        ActorCreate(
            name="Actor One",
            profile_url="https://javdb.com/actors/actor-1",
            external_id="actor-1",
        )
    )
    monkeypatch.setattr(
        "app.services.manual_offline.CloudServiceFactory.create",
        lambda self: FakeCloud(),
    )
    return connection


def setup_follow_database(monkeypatch, tmp_path: Path) -> Any:
    connection = setup_database(tmp_path).connect()
    settings = SettingsRepository(connection)
    settings.upsert("p115_download_dir_id", "dir-1", False)
    settings.upsert("filter_rules", EMPTY_FILTER_RULES, False)
    monkeypatch.setattr(
        "app.services.follow_workflow.CloudServiceFactory.create",
        lambda self: FakeCloud(),
    )
    return connection


def actor_follow(connection: Any, tag_ids: list[str], tag_names: list[str]) -> dict:
    return FollowsRepository(connection).save(
        "actor-1",
        "Actor One",
        "https://javdb.com/actors/actor-1",
        "https://c0.jdbstatic.com/avatars/ac/actor-1.jpg",
        tag_ids,
        tag_names,
    )


def manual_dependencies(connection: Any) -> ManualOfflineDependencies:
    return ManualOfflineDependencies(
        actors=ActorsRepository(connection),
        catalog=CatalogRepository(connection),
        logs=LogsRepository(connection),
        settings=SettingsRepository(connection),
        tasks=TasksRepository(connection),
        javdb=ManualClient(),
    )


def follow_dependencies(connection: Any) -> FollowWorkflowDependencies:
    return FollowWorkflowDependencies(
        actors=ActorsRepository(connection),
        follows=FollowsRepository(connection),
        catalog=CatalogRepository(connection),
        tasks=TasksRepository(connection),
        logs=LogsRepository(connection),
        settings=SettingsRepository(connection),
        javdb=FollowWorkflowClient(),
    )


def task_retry_dependencies(connection: Any) -> TaskRetryDependencies:
    return TaskRetryDependencies(
        catalog=CatalogRepository(connection),
        logs=LogsRepository(connection),
        settings=SettingsRepository(connection),
        tasks=TasksRepository(connection),
    )


def setup_database(tmp_path: Path) -> Database:
    database = Database(tmp_path / "test.sqlite3")
    database.initialize()
    return database
