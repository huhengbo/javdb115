from __future__ import annotations

from pathlib import Path
from typing import Any

from app.database import Database
from app.repositories.actors import ActorsRepository
from app.repositories.catalog import CatalogRepository
from app.repositories.follows import FollowsRepository
from app.repositories.logs import LogsRepository
from app.repositories.settings import SettingsRepository
from app.repositories.tasks import TasksRepository
from app.services.telegram_movies import TelegramMovieDependencies, TelegramMovieService


class FakeJavdb:
    def search(self, query: str) -> list[dict[str, object]]:
        return [
            {"id": "movie-1", "number": "ABC-123", "title": "Sample"},
            {"id": "movie-2", "number": "ABC-1234", "title": "Other"},
        ]

    def movie_detail(self, movie_id: str) -> dict[str, object]:
        return {
            "id": movie_id,
            "number": "ABC-123",
            "title": "Sample",
            "release_date": "2026-05-20",
            "cover_url": "https://c0.jdbstatic.com/covers/ab/abc123.jpg",
            "actors": [{"name": "Actor One"}],
            "magnets_count": 3,
        }

    def movie_magnets(self, movie_id: str) -> list[dict[str, object]]:
        return [
            {"hash": "hash-c", "name": "ABC-123-C", "created_at": "2026-05-22T00:00:00Z"},
            {"hash": "hash-u", "name": "ABC-123-U", "created_at": "2026-05-21T00:00:00Z"},
            {"hash": "hash-uc", "name": "ABC-123-UC", "created_at": "2026-05-20T00:00:00Z"},
        ]

    def movie_source_url(self, movie_id: str) -> str:
        return f"https://javdb.com/v/{movie_id}"


class FakeCloud:
    def __init__(self, calls: list[str]) -> None:
        self.calls = calls

    def add_offline_url(
        self,
        url: str,
        target_dir_id: str,
        *,
        savepath: str | None = None,
    ) -> str:
        self.calls.append(url)
        assert target_dir_id == "dir-1"
        assert savepath == "ABC-123"
        return "cloud-task-1"


def test_lookup_uses_exact_number_match(tmp_path: Path) -> None:
    card = service(setup_database(tmp_path).connect()).lookup("abc_123")

    assert card is not None
    assert card.movie_id == "movie-1"
    assert "番号: ABC-123" in card.caption


def test_subscribe_prefers_uc_before_newer_u_or_c(monkeypatch: Any, tmp_path: Path) -> None:
    calls: list[str] = []
    connection = setup_database(tmp_path).connect()
    SettingsRepository(connection).upsert("p115_download_dir_id", "dir-1", False)
    monkeypatch.setattr(
        "app.services.manual_offline.CloudServiceFactory.create",
        lambda self: FakeCloud(calls),
    )

    message = service(connection).subscribe("movie-1")

    assert message == "已提交自动下载整理任务：#1"
    assert calls == ["magnet:?xt=urn:btih:hash-uc&dn=ABC-123-UC"]
    follows = FollowsRepository(connection).list_all()
    assert follows[0]["type"] == "movie"
    assert follows[0]["actor_external_id"] == "movie-1"
    assert follows[0]["selected_tag_names"] == ["任务 #1", "已提交"]


def service(connection: Any) -> TelegramMovieService:
    return TelegramMovieService(
        TelegramMovieDependencies(
                actors=ActorsRepository(connection),
                catalog=CatalogRepository(connection),
                follows=FollowsRepository(connection),
                logs=LogsRepository(connection),
            settings=SettingsRepository(connection),
            tasks=TasksRepository(connection),
            javdb=FakeJavdb(),
        )
    )


def setup_database(tmp_path: Path) -> Database:
    database = Database(tmp_path / "test.sqlite3")
    database.initialize()
    return database
