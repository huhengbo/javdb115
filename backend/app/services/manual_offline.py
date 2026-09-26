from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol, cast

from app.errors import NotFoundError
from app.javdb_models import JavdbMagnet, JavdbWork
from app.repositories.actors import ActorsRepository
from app.repositories.catalog import CatalogRepository
from app.repositories.logs import LogsRepository
from app.repositories.settings import SettingsRepository
from app.repositories.tasks import TasksRepository
from app.services.javdb_movie_payload import JavdbMoviePayload, fetch_javdb_movie_payload
from app.services.task_state import TaskStateService, TaskTransition

BYTES_PER_MB = 1024 * 1024

class ManualJavdbClient(Protocol):
    def movie_detail(self, movie_id: str) -> dict[str, Any]: ...
    def movie_magnets(self, movie_id: str) -> list[dict[str, Any]]: ...
    def movie_source_url(self, movie_id: str) -> str: ...


@dataclass(frozen=True)
class ManualOfflineDependencies:
    actors: ActorsRepository
    catalog: CatalogRepository
    logs: LogsRepository
    settings: SettingsRepository
    tasks: TasksRepository
    javdb: ManualJavdbClient


@dataclass(frozen=True)
class ManualOfflineResult:
    task_id: int | None
    duplicate_task: dict[str, Any] | None = None


class ManualOfflineService:
    def __init__(self, dependencies: ManualOfflineDependencies) -> None:
        self.actors = dependencies.actors
        self.catalog = dependencies.catalog
        self.logs = dependencies.logs
        self.settings = dependencies.settings
        self.tasks = dependencies.tasks
        self.javdb = dependencies.javdb

    def submit(
        self,
        movie_id: str,
        magnet_hash: str,
        *,
        force: bool = False,
    ) -> ManualOfflineResult:
        payload = fetch_javdb_movie_payload(self.javdb, movie_id)
        return self.submit_prefetched(movie_id, magnet_hash, payload, force=force)

    def submit_prefetched(
        self,
        movie_id: str,
        magnet_hash: str,
        payload: JavdbMoviePayload,
        *,
        force: bool = False,
    ) -> ManualOfflineResult:
        magnet_data = self._find_magnet(payload.magnets, movie_id, magnet_hash)
        work = self._to_work(movie_id, payload.detail)
        duplicate = self.tasks.find_blocking_duplicate_by_code(work.code)
        if duplicate and not force:
            return ManualOfflineResult(None, duplicate)
        magnet = self._to_magnet(magnet_data)
        work_id = self.catalog.upsert_work(work, "submitted")
        magnet_id = self.catalog.add_magnet(work_id, magnet, "manual", "manual_submit", 0)
        actor_id = self._actor_id(payload.detail)
        task_id = self.tasks.create(work_id, actor_id, magnet_id)
        self._state().transition(
            task_id,
            TaskTransition(
                "pending",
                "manual_115_queued",
                context={"movie_id": movie_id},
            ),
        )
        self.logs.add(
            "info",
            "manual_115_queued",
            "Manual magnet queued for 115 submission",
            task_id,
            {"movie_id": movie_id},
        )
        self._commit()
        return ManualOfflineResult(task_id)

    def _find_magnet(
        self,
        magnets: list[dict[str, Any]],
        movie_id: str,
        magnet_hash: str,
    ) -> dict[str, Any]:
        for magnet in magnets:
            if str(magnet.get("hash")) == magnet_hash:
                return magnet
        raise NotFoundError(f"Magnet not found for movie: {movie_id}")

    def _to_work(self, movie_id: str, detail: dict[str, Any]) -> JavdbWork:
        actors = [str(actor.get("name")) for actor in detail.get("actors", []) if actor.get("name")]
        return JavdbWork(
            code=str(detail.get("number") or movie_id),
            title=str(detail.get("title") or movie_id),
            cover_url=str(detail.get("cover_url") or detail.get("thumb_url") or ""),
            release_date=str(detail.get("release_date") or ""),
            source_url=self.javdb.movie_source_url(movie_id),
            actors=actors,
            magnets=[],
        )

    def _to_magnet(self, magnet_data: dict[str, Any]) -> JavdbMagnet:
        name = str(magnet_data.get("name") or magnet_data.get("hash") or "magnet")
        magnet_hash = str(magnet_data.get("hash") or "")
        return JavdbMagnet(
            name=name,
            url=f"magnet:?xt=urn:btih:{magnet_hash}&dn={name}",
            size_bytes=self._size_bytes(magnet_data.get("size")),
        )

    def _size_bytes(self, raw_size: object) -> int | None:
        if raw_size in (None, ""):
            return None
        return int(float(str(raw_size)) * BYTES_PER_MB)

    def _actor_id(self, detail: dict[str, Any]) -> int | None:
        actors = detail.get("actors", [])
        if not actors:
            return None
        external_id = str(actors[0].get("id") or "")
        if not external_id:
            return None
        actor = self.actors.find_by_external_id(external_id)
        return int(cast(int, actor["id"])) if actor else None

    def _state(self) -> TaskStateService:
        from app.repositories.task_events import TaskEventsRepository

        return TaskStateService(self.tasks, TaskEventsRepository(self.tasks.connection))

    def _commit(self) -> None:
        self.tasks.connection.commit()
