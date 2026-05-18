from __future__ import annotations

import json
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

EMPTY_FILTER_RULES = (
    '{"min_size_gb":0,"required_keywords":[],"excluded_keywords":[]}'
)


class ActorMoviesClient(JavdbApiClient):
    def __init__(self, actor_type: int, movies: list[dict], details: dict[str, dict]) -> None:
        super().__init__()
        self.actor_type = actor_type
        self.movies = movies
        self.details = details
        self.calls: list[tuple[str, str, int, int]] = []
        self.detail_calls: list[str] = []

    def actor_detail(self, actor_id: str) -> dict:
        return {"id": actor_id, "type": self.actor_type}

    def movies_by_tag(
        self,
        filter_by: str,
        sort_by: str = "update",
        page: int = 1,
        limit: int = 24,
    ) -> list[dict]:
        self.calls.append((filter_by, sort_by, page, limit))
        return self.movies[:limit]

    def movie_detail(self, movie_id: str) -> dict:
        self.detail_calls.append(movie_id)
        return self.details[movie_id]


class FollowWorkflowClient(ActorMoviesClient):
    def __init__(self) -> None:
        super().__init__(
            0,
            [
                {
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
            ],
            {
                "movie-1": {
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
                    "actors": [{"name": "Actor One"}],
                    "tags": [{"id": "28"}],
                    "type": 0,
                }
            },
        )

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


class ApiCaptureBrowser:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def javdb_api_get(self, path: str, query: str, sig: str) -> str:
        self.calls.append((path, query))
        if path == "/api/v1/rankings/actors":
            return json.dumps({"data": {"actors": [{"id": "actor-1"}]}})
        if path == "/api/v1/movies/movie-1/reviews":
            return json.dumps({"data": {"reviews": [{"id": 1, "content": "ok"}]}})
        return json.dumps({"data": {"movies": [{"id": "movie-1"}]}})


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


def test_follows_repository_upserts_actor_rule(tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    repository = FollowsRepository(connection)

    created = repository.save(
        "actor-1",
        "Actor One",
        "https://javdb.com/actors/actor-1",
        "https://c0.jdbstatic.com/avatars/ac/actor-1.jpg",
        ["0", "s"],
        ["有码", "单体作品"],
    )
    updated = repository.save(
        "actor-1",
        "Actor One",
        "https://javdb.com/actors/actor-1",
        "https://c0.jdbstatic.com/avatars/ac/actor-1.jpg",
        ["s"],
        ["单体作品"],
    )

    assert created["id"] == updated["id"]
    assert updated["selected_tag_ids"] == ["s"]
    assert len(repository.list_all()) == 1


def test_actor_movies_filters_with_all_selected_tags() -> None:
    client = ActorMoviesClient(
        0,
        [
            {
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
            },
            {
                "id": "movie-2",
                "number": "TWO-002",
                "title": "Movie Two",
                "thumb_url": "https://c0.jdbstatic.com/covers/mo/movie-2.jpg",
                "cover_url": "https://c0.jdbstatic.com/covers/mo/movie-2.jpg",
                "duration": 90,
                "release_date": "2026-05-17",
                "score": "4.0",
                "can_play": True,
                "has_cnsub": False,
                "has_preview_images": False,
                "magnets_count": 1,
            },
        ],
        {
            "movie-1": {
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
                "tags": [{"id": "28"}],
            },
            "movie-2": {
                "number": "TWO-002",
                "title": "Movie Two",
                "thumb_url": "https://c0.jdbstatic.com/covers/mo/movie-2.jpg",
                "cover_url": "https://c0.jdbstatic.com/covers/mo/movie-2.jpg",
                "duration": 90,
                "release_date": "2026-05-17",
                "score": "4.0",
                "can_play": True,
                "has_cnsub": False,
                "has_preview_images": False,
                "magnets_count": 1,
                "tags": [{"id": "28"}],
            },
        },
    )

    movies = client.actor_movies("actor-1", tag_ids=["s", "c"])

    assert client.calls == [("s:a:actor-1", "release", 1, 24)]
    assert client.detail_calls == []
    assert [movie["id"] for movie in movies] == ["movie-1"]
    assert movies[0]["has_cnsub"] is True


def test_actor_movies_uses_selected_app_filter_before_local_filtering() -> None:
    client = ActorMoviesClient(
        0,
        [{"id": "movie-1", "number": "ONE-001"}],
        {"movie-1": {"type": 0, "tags": [{"id": "28"}], "magnets_count": 1, "has_cnsub": False}},
    )

    client.actor_movies("actor-1", tag_ids=["s"], sort_type=4, limit=3)

    assert client.calls == [("s:a:actor-1", "watched_count", 1, 3)]
    assert client.detail_calls == []


def test_actor_movies_prefers_app_work_filter_when_type_and_work_tag_selected() -> None:
    client = ActorMoviesClient(
        0,
        [{"id": "movie-1", "number": "ONE-001"}],
        {"movie-1": {"type": 0, "tags": [{"id": "28"}], "magnets_count": 1}},
    )

    client.actor_movies("actor-1", tag_ids=["0", "s"], sort_type=0, limit=3)

    assert client.calls == [("s:a:actor-1", "release", 1, 3)]
    assert client.detail_calls == []


def test_actor_movies_uses_actor_type_when_no_tag_selected() -> None:
    client = ActorMoviesClient(
        0,
        [{"id": "movie-1", "number": "ONE-001"}],
        {"movie-1": {"type": 0, "tags": [], "magnets_count": 0, "has_cnsub": False}},
    )

    client.actor_movies("actor-1", tag_ids=[], sort_type=2, limit=5)

    assert client.calls == [("0:a:actor-1", "hit", 1, 5)]


def test_actor_movies_maps_magnet_tag_to_app_filter() -> None:
    client = ActorMoviesClient(
        0,
        [{"id": "movie-1", "number": "ONE-001"}],
        {"movie-1": {"type": 0, "tags": [], "magnets_count": 1, "has_cnsub": False}},
    )

    client.actor_movies("actor-1", tag_ids=["m"], sort_type=0, limit=1)

    assert client.calls == [("m:a:actor-1", "release", 1, 1)]
    assert client.detail_calls == []


def test_rankings_forwards_app_query_parameters() -> None:
    browser = ApiCaptureBrowser()
    client = JavdbApiClient(cast(Any, browser))

    movies = client.rankings(rtype="1", period="today")
    playback = client.rankings_playback(period="weekly", filter_by="all")
    actors = client.rankings_actors(rtype="monthly")

    assert movies == [{"id": "movie-1"}]
    assert playback == [{"id": "movie-1"}]
    assert actors == [{"id": "actor-1"}]
    assert browser.calls[0][0] == "/api/v1/rankings"
    assert "type=1&period=today" in browser.calls[0][1]
    assert browser.calls[1][0] == "/api/v1/rankings/playback"
    assert "period=weekly&filter_by=all" in browser.calls[1][1]
    assert browser.calls[2][0] == "/api/v1/rankings/actors"
    assert "type=monthly" in browser.calls[2][1]


def test_movie_reviews_forwards_hot_sort_parameters() -> None:
    browser = ApiCaptureBrowser()
    client = JavdbApiClient(cast(Any, browser))

    reviews = client.movie_reviews("movie-1", page=2, limit=7)

    assert reviews == [{"id": 1, "content": "ok"}]
    assert browser.calls[0][0] == "/api/v1/movies/movie-1/reviews"
    assert "page=2&sort_by=hotly&limit=7" in browser.calls[0][1]


def test_follows_repository_normalizes_legacy_tag_ids(tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    repository = FollowsRepository(connection)

    follow = repository.save(
        "actor-1",
        "Actor One",
        "https://javdb.com/actors/actor-1",
        "https://c0.jdbstatic.com/avatars/ac/actor-1.jpg",
        ["type:0", "28", "d"],
        ["有码", "单体作品", "含磁链"],
    )

    assert follow["selected_tag_ids"] == ["0", "s", "m"]


def test_manual_offline_service_creates_submitted_task(
    monkeypatch,
    tmp_path: Path,
) -> None:
    database = setup_database(tmp_path)
    connection = database.connect()
    settings = SettingsRepository(connection)
    settings.upsert("p115_download_dir_id", "dir-1", False)
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

    service = ManualOfflineService(
        ManualOfflineDependencies(
            actors=ActorsRepository(connection),
            catalog=CatalogRepository(connection),
            logs=LogsRepository(connection),
            settings=settings,
            tasks=TasksRepository(connection),
            javdb=ManualClient(),
        )
    )

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


def test_follow_workflow_creates_submitted_task(monkeypatch, tmp_path: Path) -> None:
    database = setup_database(tmp_path)
    connection = database.connect()
    settings = SettingsRepository(connection)
    settings.upsert("p115_download_dir_id", "dir-1", False)
    settings.upsert("filter_rules", EMPTY_FILTER_RULES, False)
    follow = FollowsRepository(connection).save(
        "actor-1",
        "Actor One",
        "https://javdb.com/actors/actor-1",
        "https://c0.jdbstatic.com/avatars/ac/actor-1.jpg",
        ["s", "c"],
        ["单体作品", "含字幕"],
    )
    FollowsRepository(connection).add_seen_movies(int(cast(int, follow["id"])), ["old-movie"])
    monkeypatch.setattr(
        "app.services.follow_workflow.CloudServiceFactory.create",
        lambda self: FakeCloud(),
    )

    result = FollowWorkflowService(
        FollowWorkflowDependencies(
            actors=ActorsRepository(connection),
            follows=FollowsRepository(connection),
            catalog=CatalogRepository(connection),
            tasks=TasksRepository(connection),
            logs=LogsRepository(connection),
            settings=settings,
            javdb=FollowWorkflowClient(),
        )
    ).check_follow(int(cast(int, follow["id"])))

    task = TasksRepository(connection).list_all()[0]
    assert result.processed_count == 1
    assert task["status"] == "submitted"
    assert task["work"]["code"] == "ONE-001"
    assert task["actor"]["name"] == "Actor One"


def test_follow_workflow_retry_uses_follow_rule(monkeypatch, tmp_path: Path) -> None:
    database = setup_database(tmp_path)
    connection = database.connect()
    settings = SettingsRepository(connection)
    settings.upsert("p115_download_dir_id", "dir-1", False)
    settings.upsert("filter_rules", EMPTY_FILTER_RULES, False)
    follow = FollowsRepository(connection).save(
        "actor-1",
        "Actor One",
        "https://javdb.com/actors/actor-1",
        "https://c0.jdbstatic.com/avatars/ac/actor-1.jpg",
        ["s"],
        ["单体作品"],
    )
    FollowsRepository(connection).add_seen_movies(int(cast(int, follow["id"])), ["old-movie"])
    monkeypatch.setattr(
        "app.services.follow_workflow.CloudServiceFactory.create",
        lambda self: FakeCloud(),
    )
    service = FollowWorkflowService(
        FollowWorkflowDependencies(
            actors=ActorsRepository(connection),
            follows=FollowsRepository(connection),
            catalog=CatalogRepository(connection),
            tasks=TasksRepository(connection),
            logs=LogsRepository(connection),
            settings=settings,
            javdb=FollowWorkflowClient(),
        )
    )
    service.check_follow(int(cast(int, follow["id"])))
    task_id = TasksRepository(connection).list_all()[0]["id"]

    service.retry_task(int(cast(int, task_id)))

    assert len(TasksRepository(connection).list_all()) >= 1


def setup_manual_database(monkeypatch, tmp_path: Path) -> Any:
    connection = setup_database(tmp_path).connect()
    settings = SettingsRepository(connection)
    settings.upsert("p115_download_dir_id", "dir-1", False)
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


def manual_dependencies(connection: Any) -> ManualOfflineDependencies:
    settings = SettingsRepository(connection)
    return ManualOfflineDependencies(
        actors=ActorsRepository(connection),
        catalog=CatalogRepository(connection),
        logs=LogsRepository(connection),
        settings=settings,
        tasks=TasksRepository(connection),
        javdb=ManualClient(),
    )


def setup_database(tmp_path: Path) -> Database:
    database = Database(tmp_path / "test.sqlite3")
    database.initialize()
    return database
