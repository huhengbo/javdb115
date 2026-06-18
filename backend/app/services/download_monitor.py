from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, cast
from urllib.parse import urlparse

from app.adapters.cloud115 import Cloud115Client
from app.adapters.cloud115_types import CloudOfflineTask
from app.javdb_models import JavdbWork
from app.repositories.catalog import CatalogRepository
from app.repositories.follows import FollowsRepository
from app.repositories.logs import LogsRepository
from app.repositories.settings import SettingsRepository
from app.repositories.task_events import TaskEventsRepository
from app.repositories.tasks import TasksRepository
from app.security import now_utc
from app.services.cloud import CloudServiceFactory
from app.services.emby_metadata import EmbyMovieMetadata
from app.services.notifier import NotificationService
from app.services.organizer import CloudOrganizer, OrganizeRequest
from app.services.task_state import TaskStateService, TaskTransition

LOGGER = logging.getLogger(__name__)
INCOMPLETE_SUBMIT_TIMEOUT_SECONDS = 300


@dataclass(frozen=True)
class DownloadMonitorDependencies:
    catalog: CatalogRepository
    follows: FollowsRepository
    logs: LogsRepository
    settings: SettingsRepository
    tasks: TasksRepository


@dataclass(frozen=True)
class DownloadMonitorResult:
    checked_count: int
    downloading_count: int
    completed_count: int
    failed_count: int


class DownloadMonitorService:
    def __init__(self, dependencies: DownloadMonitorDependencies) -> None:
        self.catalog = dependencies.catalog
        self.follows = dependencies.follows
        self.logs = dependencies.logs
        self.settings = dependencies.settings
        self.tasks = dependencies.tasks

    def poll_unfinished(self) -> DownloadMonitorResult:
        recovered_count = self._fail_incomplete_submissions()
        remote_result = self._poll_remote_tasks()
        return DownloadMonitorResult(
            checked_count=remote_result.checked_count + recovered_count,
            downloading_count=remote_result.downloading_count,
            completed_count=remote_result.completed_count,
            failed_count=remote_result.failed_count + recovered_count,
        )

    def _poll_remote_tasks(self) -> DownloadMonitorResult:
        tasks = self.tasks.list_unfinished()
        if not tasks:
            return DownloadMonitorResult(0, 0, 0, 0)
        cloud = CloudServiceFactory(self.settings).create()
        remote_tasks = cloud.get_offline_tasks(self._cloud_task_ids(tasks))
        return self._apply_remote_tasks(tasks, remote_tasks, cloud)

    def _fail_incomplete_submissions(self) -> int:
        tasks = self.tasks.list_incomplete_submissions(self._incomplete_submit_cutoff())
        for task in tasks:
            self._fail_task(task, "115_submit_incomplete", self._incomplete_submit_message())
        return len(tasks)

    def _incomplete_submit_cutoff(self) -> str:
        timeout = timedelta(seconds=INCOMPLETE_SUBMIT_TIMEOUT_SECONDS)
        return (now_utc() - timeout).isoformat()

    def _incomplete_submit_message(self) -> str:
        return "115 离线提交未完成：任务创建后没有拿到 115 task id"

    def _apply_remote_tasks(
        self,
        tasks: list[dict[str, Any]],
        remote_tasks: dict[str, CloudOfflineTask],
        cloud: Cloud115Client,
    ) -> DownloadMonitorResult:
        counts = {"downloading": 0, "completed": 0, "failed": 0}
        for task in tasks:
            status = remote_tasks.get(str(task["cloud_task_id"]).casefold())
            self._apply_one_task(task, status, cloud, counts)
        return DownloadMonitorResult(
            checked_count=len(tasks),
            downloading_count=counts["downloading"],
            completed_count=counts["completed"],
            failed_count=counts["failed"],
        )

    def _apply_one_task(
        self,
        task: dict[str, Any],
        remote: CloudOfflineTask | None,
        cloud: Cloud115Client,
        counts: dict[str, int],
    ) -> None:
        if remote is None:
            self._mark_missing(task)
            counts["failed"] += 1
            return
        if remote.status == "completed":
            counter = "completed" if self._organize_completed(task, remote, cloud) else "failed"
            counts[counter] += 1
            return
        if remote.status == "failed":
            self._mark_download_failed(task, remote)
            counts["failed"] += 1
            return
        self._mark_downloading(task, remote)
        counts["downloading"] += 1

    def _organize_completed(
        self,
        task: dict[str, Any],
        remote: CloudOfflineTask,
        cloud: Cloud115Client,
    ) -> bool:
        task_id = int(cast(int, task["id"]))
        work = cast(dict[str, Any], task["work"])
        if not remote.source_dir_id:
            self._mark_organize_failed(
                task,
                ValueError("115 completed task did not include source folder id"),
            )
            return False
        self._state().transition(task_id, TaskTransition("organizing", "115_organizing"))
        self._commit()
        try:
            plan = CloudOrganizer(cloud).organize(self._organize_request(remote, work))
        except Exception as exc:
            self._mark_organize_failed(task, exc)
            return False
        self._state().transition(
            task_id,
            TaskTransition(
                "completed",
                "115_organized",
                cloud_file_id=plan.target_dir_id,
                cloud_file_name=plan.target_dir_name or str(work["code"]),
            ),
        )
        self.catalog.mark_work_status(int(cast(int, work["id"])), "completed")
        self._delete_completed_movie_follow(work)
        self.logs.add(
            "info",
            "115_organized",
            "115 cloud files organized",
            task_id,
            self._log_context(task),
        )
        self._commit()
        self._send_completed_notification(task, plan.target_dir_id)
        return True

    def _organize_request(
        self,
        remote: CloudOfflineTask,
        work: dict[str, Any],
    ) -> OrganizeRequest:
        download_root_id = self.settings.require("p115_download_dir_id")
        if remote.download_root_id and remote.download_root_id != download_root_id:
            raise ValueError("115 completed task is not under the configured download folder")
        return OrganizeRequest(
            source_dir_id=str(remote.source_dir_id),
            download_root_id=download_root_id,
            completed_root_id=self.settings.require("p115_completed_dir_id"),
            code=str(work["code"]),
            source_dir_name=remote.source_dir_name,
            metadata=self._metadata(work),
        )

    def _delete_completed_movie_follow(self, work: dict[str, Any]) -> None:
        movie_id = self._movie_id_from_source_url(str(work.get("source_url") or ""))
        if movie_id is None:
            return
        self.follows.delete_movie(movie_id)

    def _movie_id_from_source_url(self, source_url: str) -> str | None:
        path = urlparse(source_url).path.rstrip("/")
        if "/v/" not in path:
            return None
        movie_id = path.rsplit("/v/", 1)[-1]
        return movie_id or None

    def _mark_downloading(self, task: dict[str, Any], remote: CloudOfflineTask) -> None:
        progress = "" if remote.progress_percent is None else f" ({remote.progress_percent}%)"
        task_id = int(cast(int, task["id"]))
        self._state().transition(task_id, TaskTransition("downloading", "115_downloading"))
        self.logs.add("info", "115_downloading", f"115 offline task is running{progress}", task_id)

    def _mark_download_failed(self, task: dict[str, Any], remote: CloudOfflineTask) -> None:
        message = remote.message or "115 离线任务失败"
        self._fail_task(task, "115_download_failed", message)

    def _mark_missing(self, task: dict[str, Any]) -> None:
        self._fail_task(task, "115_task_missing", "115 离线任务列表中未找到该任务")

    def _mark_organize_failed(self, task: dict[str, Any], exc: Exception) -> None:
        self._fail_task(task, "115_organize_failed", str(exc))

    def _fail_task(self, task: dict[str, Any], stage: str, message: str) -> None:
        task_id = int(cast(int, task["id"]))
        self._state().transition(
            task_id,
            TaskTransition("failed", stage, error_message=message),
        )
        work = cast(dict[str, Any] | None, task.get("work"))
        if work:
            self.catalog.mark_work_status(int(cast(int, work["id"])), "failed")
        self.logs.add("error", stage, message, task_id, self._log_context(task))
        self._commit()
        self._send_failed_notification(task, stage, message)

    def _send_completed_notification(self, task: dict[str, Any], cloud_file_id: str) -> None:
        try:
            NotificationService(self.settings).send_completed(
                self._work_for_notification(task),
                cloud_file_id,
            )
        except Exception:
            LOGGER.exception("Unable to send completed notification")

    def _send_failed_notification(self, task: dict[str, Any], stage: str, message: str) -> None:
        work = cast(dict[str, Any] | None, task.get("work"))
        title = str(work["code"]) if work else f"任务 #{task['id']}"
        try:
            NotificationService(self.settings).send_failed(title, stage, message)
        except Exception:
            LOGGER.exception("Unable to send failed notification")

    def _work_for_notification(self, task: dict[str, Any]) -> JavdbWork:
        work = cast(dict[str, Any], task["work"])
        return JavdbWork(
            code=str(work["code"]),
            title=cast(str | None, work.get("title")),
            cover_url=cast(str | None, work.get("cover_url")),
            release_date=cast(str | None, work.get("release_date")),
            source_url=str(work["source_url"]),
            actors=cast(list[str], work.get("actors") or []),
            magnets=[],
        )

    def _metadata(self, work: dict[str, Any]) -> EmbyMovieMetadata:
        return EmbyMovieMetadata(
            code=str(work["code"]),
            title=cast(str | None, work.get("title")),
            release_date=cast(str | None, work.get("release_date")),
            source_url=str(work["source_url"]),
            actors=cast(list[str], work.get("actors") or []),
            cover_url=cast(str | None, work.get("cover_url")),
            tags=[],
        )

    def _log_context(self, task: dict[str, Any]) -> dict[str, object]:
        work = cast(dict[str, Any] | None, task.get("work"))
        return {
            "code": work.get("code") if work else None,
            "cloud_task_id": task.get("cloud_task_id"),
        }

    def _cloud_task_ids(self, tasks: list[dict[str, Any]]) -> set[str]:
        return {str(task["cloud_task_id"]) for task in tasks if task.get("cloud_task_id")}

    def _state(self) -> TaskStateService:
        return TaskStateService(self.tasks, TaskEventsRepository(self.tasks.connection))

    def _commit(self) -> None:
        self.tasks.connection.commit()
