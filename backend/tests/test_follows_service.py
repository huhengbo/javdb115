from __future__ import annotations

from pathlib import Path
from typing import cast

from app.adapters.javdb_api import JavdbApiClient
from app.database import Database
from app.repositories.follows import FollowsRepository
from app.services.follows import FollowsService


class PagedActorMoviesClient(JavdbApiClient):
    def __init__(self, pages: dict[int, list[dict]]) -> None:
        super().__init__()
        self.pages = pages
        self.calls: list[tuple[int, int]] = []

    def actor_movies(
        self,
        actor_id: str,
        tag_ids: list[str] | None = None,
        sort_type: int = 0,
        page: int = 1,
        limit: int = 24,
    ) -> list[dict]:
        self.calls.append((page, limit))
        return self.pages.get(page, [])


def test_baseline_records_configured_first_page_scope_used_by_checks(tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    repository = FollowsRepository(connection)
    follow = repository.save(
        "actor-1",
        "Actor One",
        "https://javdb.com/actors/actor-1",
        None,
        ["s"],
        ["单体作品"],
    )
    client = PagedActorMoviesClient({1: [movie("old-1"), movie("old-2"), movie("old-3")]})
    service = FollowsService(repository, client)

    service.baseline(follow)
    client.pages = {1: [movie("new-1"), movie("old-1"), movie("old-2")]}
    result = service.check_one(follow)

    assert result["new_count"] == 1
    assert [item["id"] for item in result["movies"]] == ["new-1"]
    assert repository.list_seen_movie_ids(int(cast(int, follow["id"]))) == {
        "old-1",
        "old-2",
        "old-3",
        "new-1"
    }
    assert client.calls == [(1, 3), (1, 3)]


def movie(movie_id: str) -> dict:
    return {"id": movie_id, "number": movie_id.upper(), "title": movie_id}


def setup_database(tmp_path: Path) -> Database:
    database = Database(tmp_path / "test.sqlite3")
    database.initialize()
    return database
