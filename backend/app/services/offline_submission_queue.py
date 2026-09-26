from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, cast

from app.javdb_models import JavdbWork
from app.repositories.catalog import CatalogRepository
from app.repositories.logs import LogsRepository
from app.repositories.settings import SettingsRepository
from app.repositories.task_events import TaskEventsRepository
from app.repositories.tasks import TasksRepository
from app.services.cloud import CloudServiceFactory
from app.services.notifier import NotificationService
from app.services.task_state import TaskStateService, TaskTransition

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class OfflineSubmissionQueueDependencies:
    catalog: CatalogRepository
    logs: LogsRepository
    settings: SettingsRepository
    tasks: TasksRepository


class OfflineSubmissionQueueService:
    def __init__(self, dependencies: OfflineSubmissionQueueDependencies) -> None:
        self.catalog = dependencies.catalog
        self.logs = dependencies.logs
        self.settings = dependencies.settings
        self.tasks = dependencies.tasks

    def process_next(self) -> bool:
        queued = self.tasks.list_queued_submissions(1)
        if not queued:
            return False
        self._submit(queued[0])
        return True

    def _submit(self, task: dict[str, Any]) -> None:
        task_id = int(cast(int, task["id"]))
        work = cast(dict[str, Any] | None, task.get("work"))
        magnet = cast(dict[str, Any] | None, task.get("magnet"))
        if work is None or magnet is None or not magnet.get("url"):
            self._mark_failed(task, "任务缺少作品或磁力信息，无法提交到 115")
            return

        self._state().transition(
            task_id,
            TaskTransition(
                "pending",
                "manual_115_submitting",
                context=self._log_context(task),
            ),
        )
        self._commit()

        try:
            cloud_task_id = (
                CloudServiceFactory(self.settings)
                .create()
                .add_offline_url(
                    str(magnet["url"]),
                    self.settings.require("p115_download_dir_id"),
                    savepath=str(work["code"]),
                )
            )
        except Exception as exc:
            self._mark_failed(task, str(exc))
            return

        self._state().transition(
            task_id,
            TaskTransition(
                "submitted",
                "manual_115_submitted",
                cloud_task_id=cloud_task_id,
                context=self._log_context(task),
            ),
        )
        self.catalog.mark_work_status(int(cast(int, work["id"])), "submitted")
        self.logs.add(
            "info",
            "manual_115_submitted",
            "Queued manual magnet submitted to 115",
            task_id,
            self._log_context(task),
        )
        self._commit()
        self._send_submitted_notification(task_id, work, magnet)

    def _mark_failed(self, task: dict[str, Any], message: str) -> None:
        task_id = int(cast(int, task["id"]))
        self._state().transition(
            task_id,
            TaskTransition(
                "failed",
                "115_submit_failed",
                error_message=message,
                context=self._log_context(task),
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
            self._log_context(task),
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

    def _send_failed_notification(self, task: dict[str, Any], message: str) -> None:
        work = cast(dict[str, Any] | None, task.get("work"))
        title = str(work["code"]) if work else f"任务 #{task['id']}"
        try:
            NotificationService(self.settings).send_failed(
                title,
                "115_submit_failed",
                message,
            )
        except Exception as exc:
            self._log_notification_failure(int(cast(int, task["id"])), title, exc)

    def _log_notification_failure(self, task_id: int, code: str, exc: Exception) -> None:
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

    def _log_context(self, task: dict[str, Any]) -> dict[str, object]:
        work = cast(dict[str, Any] | None, task.get("work"))
        return {
            "code": work.get("code") if work else None,
            "cloud_task_id": task.get("cloud_task_id"),
        }

    def _state(self) -> TaskStateService:
        return TaskStateService(self.tasks, TaskEventsRepository(self.tasks.connection))

    def _commit(self) -> None:
        self.tasks.connection.commit()
