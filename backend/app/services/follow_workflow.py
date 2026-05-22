from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import cast

from app.adapters.javdb_api import JavdbApiClient
from app.contracts import ActorCreate
from app.errors import NotFoundError, ValidationAppError
from app.javdb_models import JavdbMagnet, JavdbWork
from app.repositories.actors import ActorsRepository
from app.repositories.catalog import CatalogRepository
from app.repositories.follows import FollowsRepository
from app.repositories.logs import LogsRepository
from app.repositories.settings import SettingsRepository
from app.repositories.task_events import TaskEventsRepository
from app.repositories.tasks import TasksRepository
from app.services.actor_movie_scan import collect_actor_movies
from app.services.cloud import CloudServiceFactory
from app.services.magnet_filter import MagnetDecision, MagnetFilter
from app.services.notifier import NotificationService
from app.services.settings import SettingsService
from app.services.task_state import TaskStateService, TaskTransition

LOGGER = logging.getLogger(__name__)
BYTES_PER_MB = 1024 * 1024


@dataclass(frozen=True)
class FollowWorkflowResult:
    processed_count: int
    failed_count: int
    warnings: list[str]


@dataclass(frozen=True)
class FollowWorkflowDependencies:
    actors: ActorsRepository
    follows: FollowsRepository
    catalog: CatalogRepository
    tasks: TasksRepository
    logs: LogsRepository
    settings: SettingsRepository
    javdb: JavdbApiClient


@dataclass(frozen=True)
class SubmitRequest:
    actor_id: int
    work_id: int
    work: JavdbWork
    best: MagnetDecision


class FollowWorkflowService:
    def __init__(self, dependencies: FollowWorkflowDependencies) -> None:
        self.actors = dependencies.actors
        self.follows = dependencies.follows
        self.catalog = dependencies.catalog
        self.tasks = dependencies.tasks
        self.logs = dependencies.logs
        self.settings = dependencies.settings
        self.javdb = dependencies.javdb

    def check_all_enabled(self) -> list[FollowWorkflowResult]:
        return [
            self.check_follow(int(cast(int, follow["id"])))
            for follow in self.follows.list_enabled_actors()
        ]

    def check_follow(self, follow_id: int) -> FollowWorkflowResult:
        follow = self.follows.get(follow_id)
        if follow is None:
            raise NotFoundError(f"Follow not found: {follow_id}")
        if follow["type"] != "actor":
            raise ValidationAppError("Only actor follows can be checked")
        actor_id = self._ensure_actor_record(follow)
        movies = collect_actor_movies(
            self.javdb,
            str(follow["actor_external_id"]),
            cast(list[str], follow["selected_tag_ids"]),
        )
        target_movies = self._new_movies(follow, movies)
        warnings: list[str] = []
        processed_count = 0
        for movie in target_movies:
            try:
                self._process_movie(actor_id, movie)
                self.follows.add_seen_movies(int(cast(int, follow["id"])), [str(movie["id"])])
                processed_count += 1
            except Exception as exc:
                warnings.append(f"作品处理失败，已跳过: {movie['id']} ({exc})")
                self.logs.add(
                    "error",
                    "javdb_movie_failed",
                    str(exc),
                    None,
                    {"follow_id": follow_id, "movie_id": movie["id"]},
                )
        if not target_movies:
            self.follows.add_seen_movies(follow_id, self._movie_ids(movies))
        self.follows.mark_checked(follow_id, processed_count)
        return FollowWorkflowResult(processed_count, len(warnings), warnings)

    def _new_movies(self, follow: dict[str, object], movies: list[dict]) -> list[dict]:
        follow_id = int(cast(int, follow["id"]))
        seen = self.follows.list_seen_movie_ids(follow_id)
        if not seen and not follow.get("last_checked_at"):
            return []
        return [movie for movie in movies if str(movie["id"]) not in seen]

    def _movie_ids(self, movies: list[dict]) -> list[str]:
        return [str(movie["id"]) for movie in movies]

    def retry_task(self, task_id: int) -> None:
        task = self.tasks.get_raw(task_id)
        if task is None:
            raise NotFoundError(f"Task not found: {task_id}")
        actor_id = task.get("actor_id")
        if actor_id is None:
            raise ValidationAppError("Task does not have an actor to retry")
        actor = self.actors.get(int(actor_id))
        if actor is None or not actor.get("external_id"):
            raise ValidationAppError("Task actor does not map to a followed actor")
        follow = self.follows.find_by_actor_external_id(str(actor["external_id"]))
        if follow is None:
            raise ValidationAppError("No follow rule found for this task actor")
        self.check_follow(int(cast(int, follow["id"])))

    def _ensure_actor_record(self, follow: dict[str, object]) -> int:
        external_id = str(follow["actor_external_id"])
        existing = self.actors.find_by_external_id(external_id)
        if existing:
            actor_id = int(cast(int, existing["id"]))
            self.actors.update_name_and_avatar(
                actor_id,
                str(follow["actor_name"]),
                self._optional_string(follow.get("actor_avatar_url")),
            )
            return actor_id
        actor = self.actors.create(
            ActorCreate(
                name=str(follow["actor_name"]),
                profile_url=str(follow["actor_profile_url"]),
                external_id=external_id,
                avatar_url=self._optional_string(follow.get("actor_avatar_url")),
            )
        )
        return int(cast(int, actor["id"]))

    def _process_movie(self, actor_id: int, movie: dict) -> None:
        work = self._to_work(movie)
        if self.tasks.find_blocking_duplicate_by_code(work.code):
            self.logs.add(
                "info",
                "duplicate_active",
                "Skipped duplicate work",
                None,
                {"code": work.code},
            )
            return
        rules = SettingsService(self.settings).filter_rules()
        decisions = MagnetFilter(rules).evaluate(work.magnets)
        work_id = self.catalog.upsert_work(work, "discovered")
        best = MagnetFilter(rules).choose_best(decisions)
        self._persist_decisions(work_id, decisions)
        if best is None:
            self.catalog.mark_work_status(work_id, "skipped")
            self.logs.add("info", "filter", "No magnet matched rules", None, {"code": work.code})
            return
        self._submit(SubmitRequest(actor_id, work_id, work, best))

    def _to_work(self, movie: dict) -> JavdbWork:
        movie_id = str(movie["id"])
        detail = self.javdb.movie_detail(movie_id)
        magnets = self._to_magnets(self.javdb.movie_magnets(movie_id))
        actors = [str(actor.get("name")) for actor in detail.get("actors", []) if actor.get("name")]
        return JavdbWork(
            code=str(detail.get("number") or movie["number"]),
            title=str(detail.get("title") or movie["title"]),
            cover_url=self._optional_string(detail.get("cover_url") or movie.get("cover_url")),
            release_date=self._optional_string(
                detail.get("release_date") or movie.get("release_date")
            ),
            source_url=self.javdb.movie_source_url(movie_id),
            actors=actors,
            magnets=magnets,
        )

    def _to_magnets(self, items: list[dict]) -> list[JavdbMagnet]:
        magnets: list[JavdbMagnet] = []
        for item in items:
            magnet_hash = str(item.get("hash") or "")
            if not magnet_hash:
                continue
            name = str(item.get("name") or magnet_hash)
            magnets.append(
                JavdbMagnet(
                    name=name,
                    url=f"magnet:?xt=urn:btih:{magnet_hash}&dn={name}",
                    size_bytes=self._size_bytes(item.get("size")),
                )
            )
        return magnets

    def _persist_decisions(self, work_id: int, decisions: list[MagnetDecision]) -> None:
        for decision in decisions:
            self.catalog.add_magnet(
                work_id,
                decision.magnet,
                decision.decision,
                decision.reason,
                decision.score,
            )

    def _submit(self, request: SubmitRequest) -> None:
        magnet_id = self.catalog.add_magnet(
            request.work_id,
            request.best.magnet,
            "selected",
            request.best.reason,
            request.best.score,
        )
        task_id = self.tasks.create(request.work_id, request.actor_id, magnet_id)
        self._commit()
        try:
            cloud_task_id = self._submit_to_115(request.work, request.best.magnet)
            self._state().transition(
                task_id,
                TaskTransition(
                    "submitted",
                    "115_submitted",
                    cloud_task_id=cloud_task_id,
                ),
            )
            self.catalog.mark_work_status(request.work_id, "submitted")
        except Exception as exc:
            self._handle_submit_failure(task_id, request.work, exc)
            raise
        self._commit()
        self._send_submitted_notification(task_id, request.work, request.best.magnet)

    def _handle_submit_failure(self, task_id: int, work: JavdbWork, exc: Exception) -> None:
        self._state().transition(
            task_id,
            TaskTransition("failed", "115_submit_failed", error_message=str(exc)),
        )
        self.logs.add("error", "115_submit_failed", str(exc), task_id, {"code": work.code})
        self._commit()
        self._send_failed_notification(task_id, work.code, str(exc))

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

    def _send_failed_notification(self, task_id: int, code: str, message: str) -> None:
        try:
            NotificationService(self.settings).send_failed(code, "115_submit_failed", message)
        except Exception as exc:
            self._log_notification_failure(task_id, code, exc)

    def _log_notification_failure(self, task_id: int, code: str, exc: Exception) -> None:
        try:
            self.logs.add("error", "notification_failed", str(exc), task_id, {"code": code})
        except Exception:
            LOGGER.exception("Unable to record notification failure")

    def _submit_to_115(self, work: JavdbWork, magnet: JavdbMagnet) -> str:
        download_dir_id = self.settings.require("p115_download_dir_id")
        cloud = CloudServiceFactory(self.settings).create()
        return cloud.add_offline_url(magnet.url, download_dir_id, savepath=work.code)

    def _size_bytes(self, raw_size: object) -> int | None:
        if raw_size in (None, ""):
            return None
        return int(float(str(raw_size)) * BYTES_PER_MB)

    def _size_label(self, magnet: JavdbMagnet) -> str:
        if magnet.size_bytes is None:
            return "未知"
        return f"{magnet.size_bytes / (1024**3):.2f} GB"

    def _optional_string(self, value: object) -> str | None:
        return str(value) if value else None

    def _state(self) -> TaskStateService:
        return TaskStateService(self.tasks, TaskEventsRepository(self.tasks.connection))

    def _commit(self) -> None:
        self.tasks.connection.commit()
