from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, cast

from app.errors import NotFoundError, ValidationAppError
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
class TaskRetryDependencies:
    catalog: CatalogRepository
    logs: LogsRepository
    settings: SettingsRepository
    tasks: TasksRepository


class TaskRetryService:
    def __init__(self, dependencies: TaskRetryDependencies) -> None:
        self.catalog = dependencies.catalog
        self.logs = dependencies.logs
        self.settings = dependencies.settings
        self.tasks = dependencies.tasks

    def retry(self, task_id: int) -> None:
        task = self.tasks.get(task_id)
        if task is None:
            raise NotFoundError(f"Task not found: {task_id}")
        self._validate(task)
        work = self._required_work(task)
        magnet = self._required_magnet(task)
        try:
            cloud_task_id = self._submit_to_115(work, magnet)
        except Exception as exc:
            self._mark_submit_failed(task, exc)
            raise
        self._mark_submitted(task, work, magnet, cloud_task_id)

    def _validate(self, task: dict[str, Any]) -> None:
        if task["status"] != "failed":
            raise ValidationAppError("只有失败任务可以重试")

    def _required_work(self, task: dict[str, Any]) -> dict[str, Any]:
        work = cast(dict[str, Any] | None, task.get("work"))
        if work is None:
            raise ValidationAppError("任务缺少作品信息，无法重试")
        return work

    def _required_magnet(self, task: dict[str, Any]) -> dict[str, Any]:
        magnet = cast(dict[str, Any] | None, task.get("magnet"))
        if magnet is None or not magnet.get("url"):
            raise ValidationAppError("任务缺少磁力信息，无法重试")
        return magnet

    def _submit_to_115(self, work: dict[str, Any], magnet: dict[str, Any]) -> str:
        cloud = CloudServiceFactory(self.settings).create()
        return cloud.add_offline_url(
            str(magnet["url"]),
            self.settings.require("p115_download_dir_id"),
            savepath=str(work["code"]),
        )

    def _mark_submitted(
        self,
        task: dict[str, Any],
        work: dict[str, Any],
        magnet: dict[str, Any],
        cloud_task_id: str,
    ) -> None:
        task_id = int(cast(int, task["id"]))
        self._state().transition(
            task_id,
            TaskTransition(
                "submitted",
                "manual_115_resubmitted",
                cloud_task_id=cloud_task_id,
                context=self._log_context(task),
            ),
        )
        self.catalog.mark_work_status(int(cast(int, work["id"])), "submitted")
        self.logs.add(
            "info",
            "manual_115_resubmitted",
            "Manual retry submitted",
            task_id,
            self._log_context(task),
        )
        self._send_submitted_notification(task_id, work, magnet)

    def _mark_submit_failed(self, task: dict[str, Any], exc: Exception) -> None:
        task_id = int(cast(int, task["id"]))
        self._state().transition(
            task_id,
            TaskTransition(
                "failed",
                "115_submit_failed",
                error_message=str(exc),
                context=self._log_context(task),
            ),
        )
        work = cast(dict[str, Any] | None, task.get("work"))
        if work is not None:
            self.catalog.mark_work_status(int(cast(int, work["id"])), "failed")
        self.logs.add("error", "115_submit_failed", str(exc), task_id, self._log_context(task))
        self._send_failed_notification(task, str(exc))

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
            NotificationService(self.settings).send_failed(title, "115_submit_failed", message)
        except Exception as exc:
            self._log_notification_failure(int(cast(int, task["id"])), title, exc)

    def _log_notification_failure(self, task_id: int, code: str, exc: Exception) -> None:
        try:
            self.logs.add("error", "notification_failed", str(exc), task_id, {"code": code})
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
