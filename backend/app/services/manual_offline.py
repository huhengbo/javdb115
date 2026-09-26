from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Protocol, cast

from app.errors import NotFoundError
from app.javdb_models import JavdbMagnet, JavdbWork
from app.repositories.actors import ActorsRepository
from app.repositories.catalog import CatalogRepository
from app.repositories.logs import LogsRepository
from app.repositories.settings import SettingsRepository
from app.repositories.task_events import TaskEventsRepository
from app.repositories.tasks import TasksRepository
from app.services.cloud import CloudServiceFactory
from app.services.javdb_movie_payload import JavdbMoviePayload, fetch_javdb_movie_payload
from app.services.notifier import NotificationService
from app.services.task_state import TaskStateService, TaskTransition

BYTES_PER_MB = 1024 * 1024
LOGGER = logging.getLogger(__name__)


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
class ManualOfflineQueueDependencies:
    catalog: CatalogRepository
    logs: LogsRepository
    settings: SettingsRepository
    tasks: TasksRepository


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
        task_id = self._create_local_task(work, magnet, payload.detail)
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

    def enqueue_prefetched(
        self,
        movie_id: str,
        magnet_hash: str,
        detail: dict[str, Any],
        magnet_data: dict[str, Any],
        *,
        force: bool = False,
    ) -> ManualOfflineResult:
        magnet_data = self._find_magnet([magnet_data], movie_id, magnet_hash)
        work = self._to_prefetched_work(movie_id, detail)
        duplicate = self.tasks.find_blocking_duplicate_by_code(work.code)
        if duplicate and not force:
            return ManualOfflineResult(None, duplicate)
        magnet = self._to_magnet(magnet_data)
        task_id = self._create_local_task(work, magnet, detail)
        self._state().transition(
            task_id,
            TaskTransition(
                "pending",
                "manual_115_queued",
                message="已加入 115 离线提交队列",
                context={"movie_id": movie_id},
            ),
        )
        self.logs.add(
            "info",
            "manual_115_queued",
            "Manual magnet queued",
            task_id,
            {"movie_id": movie_id},
        )
        self._commit()
        return ManualOfflineResult(task_id)

    def _create_local_task(
        self,
        work: JavdbWork,
        magnet: JavdbMagnet,
        detail: dict[str, Any],
    ) -> int:
        work_id = self.catalog.upsert_work(work, "submitted")
        magnet_id = self.catalog.add_magnet(
            work_id,
            magnet,
            "manual",
            "manual_submit",
            0,
        )
        actor_id = self._actor_id(detail)
        return self.tasks.create(work_id, actor_id, magnet_id)

    def _submit_to_115(self, task_id: int, work: JavdbWork, magnet: JavdbMagnet) -> str:
        try:
            return (
                CloudServiceFactory(self.settings)
                .create()
                .add_offline_url(
                    magnet.url,
                    self.settings.require("p115_download_dir_id"),
                    savepath=work.code,
                )
            )
        except Exception as exc:
            self._state().transition(
                task_id,
                TaskTransition("failed", "115_submit_failed", error_message=str(exc)),
            )
            self._commit()
            raise

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
        return self._work_from_detail(
            movie_id,
            detail,
            self.javdb.movie_source_url(movie_id),
        )

    def _to_prefetched_work(self, movie_id: str, detail: dict[str, Any]) -> JavdbWork:
        return self._work_from_detail(
            movie_id,
            detail,
            f"https://javdb.com/v/{movie_id}",
        )

    def _work_from_detail(
        self,
        movie_id: str,
        detail: dict[str, Any],
        source_url: str,
    ) -> JavdbWork:
        actors = [
            str(actor.get("name"))
            for actor in detail.get("actors", [])
            if actor.get("name")
        ]
        return JavdbWork(
            code=str(detail.get("number") or detail.get("code") or movie_id),
            title=str(detail.get("title") or movie_id),
            cover_url=str(detail.get("cover_url") or detail.get("thumb_url") or ""),
            release_date=str(detail.get("release_date") or ""),
            source_url=source_url,
            actors=actors,
            magnets=[],
        )

    def _to_magnet(self, magnet_data: dict[str, Any]) -> JavdbMagnet:
        name = str(magnet_data.get("name") or magnet_data.get("hash") or "magnet")
        magnet_hash = str(magnet_data.get("hash") or "")
        raw_size = magnet_data.get("size")
        if raw_size is None:
            raw_size = magnet_data.get("size_mb")
        return JavdbMagnet(
            name=name,
            url=f"magnet:?xt=urn:btih:{magnet_hash}&dn={name}",
            size_bytes=self._size_bytes(raw_size),
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
            NotificationService(self.settings).send_submitted(
                work,
                self._size_label(magnet),
            )
        except Exception as exc:
            self._log_notification_failure(task_id, work.code, exc)

    def _log_notification_failure(self, task_id: int, code: str, exc: Exception) -> None:
        try:
            self.logs.add(
                "error",
                "notification_failed",
                str(exc),
                task_id,
                {"code": code},
            )
        except Exception:
            LOGGER.exception("Unable to record notification failure")

    def _state(self) -> TaskStateService:
        return TaskStateService(self.tasks, TaskEventsRepository(self.tasks.connection))

    def _commit(self) -> None:
        self.tasks.connection.commit()


class ManualOfflineQueueService:
    def __init__(self, dependencies: ManualOfflineQueueDependencies) -> None:
        self.catalog = dependencies.catalog
        self.logs = dependencies.logs
        self.settings = dependencies.settings
        self.tasks = dependencies.tasks

    def process_pending(self, limit: int = 10) -> int:
        processed = 0
        for task_id in self.tasks.list_manual_submission_queue_ids(limit):
            if not self.tasks.claim_manual_submission(task_id):
                continue
            self._commit()
            task = self.tasks.get(task_id)
            if task is None:
                continue
            self._process_one(task)
            processed += 1
        return processed

    def _process_one(self, task: dict[str, Any]) -> None:
        task_id = int(cast(int, task["id"]))
        work = cast(dict[str, Any] | None, task.get("work"))
        magnet = cast(dict[str, Any] | None, task.get("magnet"))
        if work is None or magnet is None or not magnet.get("url"):
            self._mark_failed(task, "任务缺少作品或磁力信息")
            return
        try:
            cloud_task_id = self._submit_to_115(work, magnet)
        except Exception as exc:
            self._mark_failed(task, str(exc))
            return
        self._state().transition(
            task_id,
            TaskTransition(
                "submitted",
                "manual_115_submitted",
                cloud_task_id=cloud_task_id,
            ),
        )
        self.catalog.mark_work_status(int(cast(int, work["id"])), "submitted")
        self.logs.add(
            "info",
            "manual_115_submitted",
            "Queued manual magnet submitted",
            task_id,
            {"code": work.get("code")},
        )
        self._commit()
        self._send_submitted_notification(task_id, work, magnet)

    def _submit_to_115(
        self,
        work: dict[str, Any],
        magnet: dict[str, Any],
    ) -> str:
        cloud = CloudServiceFactory(self.settings).create()
        return cloud.add_offline_url(
            str(magnet["url"]),
            self.settings.require("p115_download_dir_id"),
            savepath=str(work["code"]),
        )

    def _mark_failed(self, task: dict[str, Any], message: str) -> None:
        task_id = int(cast(int, task["id"]))
        self._state().transition(
            task_id,
            TaskTransition(
                "failed",
                "115_submit_failed",
                error_message=message,
            ),
        )
        work = cast(dict[str, Any] | None, task.get("work"))
        if work is not None:
            self.catalog.mark_work_status(int(cast(int, work["id"])), "failed")
        self.logs.add(
            "error",
            "115_submit_failed",
            message,
            task_id,
            {"code": work.get("code") if work else None},
        )
        self._commit()
        self._send_failed_notification(task, message)

    def _send_submitted_notification(
        self,
        task_id: int,
        work: dict[str, Any],
        magnet: dict[str, Any],
    ) -> None:
        try:
            NotificationService(self.settings).send_submitted(
                self._work_for_notification(work),
                self._size_label(magnet),
            )
        except Exception as exc:
            self._log_notification_failure(task_id, str(work["code"]), exc)

    def _send_failed_notification(
        self,
        task: dict[str, Any],
        message: str,
    ) -> None:
        work = cast(dict[str, Any] | None, task.get("work"))
        title = str(work["code"]) if work else f"任务 #{task['id']}"
        try:
            NotificationService(self.settings).send_failed(
                title,
                "115_submit_failed",
                message,
            )
        except Exception as exc:
            self._log_notification_failure(
                int(cast(int, task["id"])),
                title,
                exc,
            )

    def _work_for_notification(self, work: dict[str, Any]) -> JavdbWork:
        return JavdbWork(
            code=str(work["code"]),
            title=cast(str | None, work.get("title")),
            cover_url=cast(str | None, work.get("cover_url")),
            release_date=cast(str | None, work.get("release_date")),
            source_url=str(work["source_url"]),
            actors=cast(list[str], work.get("actors") or []),
            magnets=[],
        )

    def _size_label(self, magnet: dict[str, Any]) -> str:
        size = magnet.get("size_bytes")
        if size is None:
            return "未知"
        return f"{int(cast(int, size)) / (1024**3):.2f} GB"

    def _log_notification_failure(
        self,
        task_id: int,
        code: str,
        exc: Exception,
    ) -> None:
        try:
            self.logs.add(
                "error",
                "notification_failed",
                str(exc),
                task_id,
                {"code": code},
            )
            self._commit()
        except Exception:
            LOGGER.exception("Unable to record notification failure")

    def _state(self) -> TaskStateService:
        return TaskStateService(self.tasks, TaskEventsRepository(self.tasks.connection))

    def _commit(self) -> None:
        self.tasks.connection.commit()
