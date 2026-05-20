from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

from app.adapters.javdb_api import JavdbApiClient
from app.database import Database
from app.repositories.follows import FollowsRepository


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


def setup_database(tmp_path: Path) -> Database:
    database = Database(tmp_path / "test.sqlite3")
    database.initialize()
    return database
