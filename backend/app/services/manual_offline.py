from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Protocol, cast

from app.errors import NotFoundError
from app.javdb_models import JavdbMagnet, JavdbWork
from app.repositories.actors import ActorsRepository
from app.repositories.catalog import CatalogRepository
from app.repositories.logs import LogsRepository
from app.repositories.settings import SettingsRepository
from app.repositories.task_events import TaskEventsRepository
from app.repositories.tasks import TasksRepository
from app.services.cloud import CloudServiceFactory
from app.services.notifier import NotificationService
from app.services.task_state import TaskStateService, TaskTransition

BYTES_PER_MB = 1024 * 1024
LOGGER = logging.getLogger(__name__)


class ManualJavdbClient(Protocol):
    def movie_detail(self, movie_id: str) -> dict: ...
    def movie_magnets(self, movie_id: str) -> list[dict]: ...
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
    duplicate_task: dict | None = None


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
        detail = self.javdb.movie_detail(movie_id)
        magnet_data = self._find_magnet(movie_id, magnet_hash)
        work = self._to_work(movie_id, detail)
        duplicate = self.tasks.find_blocking_duplicate_by_code(work.code)
        if duplicate and not force:
            return ManualOfflineResult(None, duplicate)
        magnet = self._to_magnet(magnet_data)
        work_id = self.catalog.upsert_work(work, "submitted")
        magnet_id = self.catalog.add_magnet(work_id, magnet, "manual", "manual_submit", 0)
        actor_id = self._actor_id(detail)
        task_id = self.tasks.create(work_id, actor_id, magnet_id)
        self._commit()
        cloud_task_id = self._submit_to_115(task_id, work, magnet)
        self._state().transition(
            task_id,
            TaskTransition(
                "submitted",
                "manual_115_submitted",
                cloud_task_id=cloud_task_id,
            ),
        )
        self.logs.add(
            "info",
            "manual_115_submitted",
            "Manual magnet submitted",
            task_id,
            {"movie_id": movie_id},
        )
        self._commit()
        self._send_submitted_notification(task_id, work, magnet)
        return ManualOfflineResult(task_id)

    def _submit_to_115(self, task_id: int, work: JavdbWork, magnet: JavdbMagnet) -> str:
        try:
            return CloudServiceFactory(self.settings).create().add_offline_url(
                magnet.url,
                self.settings.require("p115_download_dir_id"),
                savepath=work.code,
            )
        except Exception as exc:
            self._state().transition(
                task_id,
                TaskTransition("failed", "115_submit_failed", error_message=str(exc)),
            )
            self._commit()
            raise

    def _find_magnet(self, movie_id: str, magnet_hash: str) -> dict:
        for magnet in self.javdb.movie_magnets(movie_id):
            if str(magnet.get("hash")) == magnet_hash:
                return magnet
        raise NotFoundError(f"Magnet not found for movie: {movie_id}")

    def _to_work(self, movie_id: str, detail: dict) -> JavdbWork:
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

    def _to_magnet(self, magnet_data: dict) -> JavdbMagnet:
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

    def _actor_id(self, detail: dict) -> int | None:
        actors = detail.get("actors", [])
        if not actors:
            return None
        external_id = str(actors[0].get("id") or "")
        if not external_id:
            return None
        actor = self.actors.find_by_external_id(external_id)
        return int(cast(int, actor["id"])) if actor else None

    def _size_label(self, magnet: JavdbMagnet) -> str:
        if magnet.size_bytes is None:
            return "未知"
        return f"{magnet.size_bytes / (1024**3):.2f} GB"

    def _send_submitted_notification(
        self,
        task_id: int,
        work: JavdbWork,
        magnet: JavdbMagnet,
    ) -> None:
        try:
            NotificationService(self.settings).send_submitted(work, self._size_label(magnet))
        except Exception as exc:
            self._log_notification_failure(task_id, work.code, exc)

    def _log_notification_failure(self, task_id: int, code: str, exc: Exception) -> None:
        try:
            self.logs.add("error", "notification_failed", str(exc), task_id, {"code": code})
        except Exception:
            LOGGER.exception("Unable to record notification failure")

    def _state(self) -> TaskStateService:
        return TaskStateService(self.tasks, TaskEventsRepository(self.tasks.connection))

    def _commit(self) -> None:
        self.tasks.connection.commit()
