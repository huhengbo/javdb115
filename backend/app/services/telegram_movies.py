from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from app.media_urls import external_image_url
from app.repositories.actors import ActorsRepository
from app.repositories.catalog import CatalogRepository
from app.repositories.follows import FollowsRepository
from app.repositories.logs import LogsRepository
from app.repositories.settings import SettingsRepository
from app.repositories.tasks import TasksRepository
from app.services.manual_offline import (
    ManualOfflineDependencies,
    ManualOfflineResult,
    ManualOfflineService,
)


class TelegramMovieJavdbClient(Protocol):
    def search(self, query: str) -> list[dict[str, object]]: ...
    def movie_detail(self, movie_id: str) -> dict[str, object]: ...
    def movie_magnets(self, movie_id: str) -> list[dict[str, object]]: ...
    def movie_source_url(self, movie_id: str) -> str: ...


@dataclass(frozen=True)
class TelegramMovieCard:
    movie_id: str
    title: str
    caption: str
    cover_url: str | None
    source_url: str


@dataclass(frozen=True)
class TelegramMovieDependencies:
    actors: ActorsRepository
    catalog: CatalogRepository
    follows: FollowsRepository
    logs: LogsRepository
    settings: SettingsRepository
    tasks: TasksRepository
    javdb: TelegramMovieJavdbClient


class TelegramMovieService:
    def __init__(self, dependencies: TelegramMovieDependencies) -> None:
        self.actors = dependencies.actors
        self.catalog = dependencies.catalog
        self.follows = dependencies.follows
        self.logs = dependencies.logs
        self.settings = dependencies.settings
        self.tasks = dependencies.tasks
        self.javdb = dependencies.javdb

    def lookup(self, query: str) -> TelegramMovieCard | None:
        movie = self._find_movie(query)
        if movie is None:
            return None
        movie_id = str(movie["id"])
        detail = self.javdb.movie_detail(movie_id)
        merged = {**movie, **detail, "id": movie_id}
        return self._card(merged)

    def subscribe(self, movie_id: str) -> str:
        detail = self.javdb.movie_detail(movie_id)
        self._save_movie_follow(movie_id, detail, ["后台处理中"])
        self._commit()
        try:
            result = self._submit_best_magnet(movie_id, detail)
        except Exception:
            self._save_movie_follow(movie_id, detail, ["提交失败"])
            self._commit()
            raise
        if result is None:
            return "已加入作品订阅，当前未找到可用磁力。"
        if result.duplicate_task:
            self._save_movie_follow(movie_id, detail, ["已有任务"])
            return "这个作品已有任务，不重复提交。"
        self._save_movie_follow(movie_id, detail, [f"任务 #{result.task_id}", "已提交"])
        return f"已提交自动下载整理任务：#{result.task_id}"

    def _submit_best_magnet(
        self,
        movie_id: str,
        detail: dict[str, object],
    ) -> ManualOfflineResult | None:
        magnet = self._best_magnet(self.javdb.movie_magnets(movie_id))
        if magnet is None:
            self._save_movie_follow(movie_id, detail, ["等待磁力"])
            return None
        return self._manual_offline().submit(movie_id, str(magnet["hash"]))

    def _find_movie(self, query: str) -> dict[str, object] | None:
        movies = self.javdb.search(query.strip())
        if not movies:
            return None
        normalized = self._normalize_code(query)
        for movie in movies:
            if self._normalize_code(str(movie.get("number") or "")) == normalized:
                return movie
        return movies[0]

    def _card(self, movie: dict[str, object]) -> TelegramMovieCard:
        number = str(movie.get("number") or movie["id"])
        title = str(movie.get("title") or "未知")
        source_url = self.javdb.movie_source_url(str(movie["id"]))
        return TelegramMovieCard(
            movie_id=str(movie["id"]),
            title=f"{number} {title}",
            caption=self._caption(movie, source_url),
            cover_url=external_image_url(self._optional_string(movie.get("cover_url"))),
            source_url=source_url,
        )

    def _caption(self, movie: dict[str, object], source_url: str) -> str:
        actors = self._actor_names(movie.get("actors"))
        lines = [
            f"番号: {movie.get('number') or movie['id']}",
            f"标题: {movie.get('title') or '未知'}",
            f"日期: {movie.get('release_date') or '未知'}",
            f"演员: {', '.join(actors) if actors else '未知'}",
            f"磁力: {movie.get('magnets_count') or '未知'}",
            source_url,
        ]
        return "\n".join(lines)

    def _best_magnet(
        self,
        magnets: list[dict[str, object]],
    ) -> dict[str, object] | None:
        valid = [magnet for magnet in magnets if magnet.get("hash")]
        if not valid:
            return None
        return min(valid, key=self._magnet_sort_key)

    def _magnet_sort_key(self, magnet: dict[str, object]) -> tuple[int, float]:
        return (self._variant_rank(magnet), -self._timestamp(magnet.get("created_at")))

    def _variant_rank(self, magnet: dict[str, object]) -> int:
        text = str(magnet.get("name") or "").upper()
        if "-UC" in text:
            return 0
        if "-U" in text:
            return 1
        if "-C" in text or bool(magnet.get("cnsub")):
            return 2
        return 3

    def _timestamp(self, value: object) -> float:
        if not value:
            return 0
        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
        except ValueError:
            return 0

    def _manual_offline(self) -> ManualOfflineService:
        return ManualOfflineService(
            ManualOfflineDependencies(
                actors=self.actors,
                catalog=self.catalog,
                logs=self.logs,
                settings=self.settings,
                tasks=self.tasks,
                javdb=self.javdb,
            )
        )

    def _normalize_code(self, code: str) -> str:
        return code.strip().replace("_", "-").upper()

    def _actor_names(self, actors: object) -> list[str]:
        if not isinstance(actors, list):
            return []
        return [
            str(actor.get("name"))
            for actor in actors
            if isinstance(actor, dict) and actor.get("name")
        ]

    def _optional_string(self, value: object) -> str | None:
        return str(value) if value else None

    def _save_movie_follow(
        self,
        movie_id: str,
        detail: dict[str, object],
        status_labels: list[str],
    ) -> None:
        self.follows.save_movie(
            movie_id,
            self._movie_follow_title(movie_id, detail),
            self.javdb.movie_source_url(movie_id),
            self._optional_string(detail.get("cover_url") or detail.get("thumb_url")),
            status_labels,
        )

    def _movie_follow_title(self, movie_id: str, detail: dict[str, object]) -> str:
        number = str(detail.get("number") or movie_id)
        title = str(detail.get("title") or "")
        return f"{number} {title}".strip()

    def _commit(self) -> None:
        self.tasks.connection.commit()
