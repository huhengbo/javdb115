from __future__ import annotations

from sqlite3 import Connection

from fastapi import APIRouter, Depends, Query

from app.adapters.javdb_api import JavdbApiClient
from app.contracts import DashboardOut, TaskHistoryItem, TaskOut
from app.dependencies import get_connection, require_user
from app.repositories.actors import ActorsRepository
from app.repositories.catalog import CatalogRepository
from app.repositories.follows import FollowsRepository
from app.repositories.logs import LogsRepository
from app.repositories.settings import SettingsRepository
from app.repositories.task_events import TaskEventsRepository
from app.repositories.tasks import TasksRepository
from app.services.follow_workflow import FollowWorkflowDependencies, FollowWorkflowService
from app.services.integration_status import IntegrationStatusService

router = APIRouter(prefix="/api", tags=["tasks"], dependencies=[Depends(require_user)])


def get_client() -> JavdbApiClient:
    return JavdbApiClient()


@router.get("/tasks", response_model=list[TaskOut])
def list_tasks(
    limit: int = Query(default=50, ge=1, le=200),
    connection: Connection = Depends(get_connection),
) -> list[dict[str, object]]:
    return TasksRepository(connection).list_all(limit)


@router.get("/tasks/by-work/{code}", response_model=list[TaskHistoryItem])
def list_tasks_by_work(
    code: str,
    connection: Connection = Depends(get_connection),
) -> list[dict[str, object]]:
    repository = TasksRepository(connection)
    tasks = repository.list_by_work_code(code)
    events = TaskEventsRepository(connection).list_for_tasks(
        [int(task["id"]) for task in tasks]
    )
    return [{"task": task, "events": events.get(int(task["id"]), [])} for task in tasks]


@router.post("/tasks/{task_id}/retry")
def retry_task(
    task_id: int,
    connection: Connection = Depends(get_connection),
    javdb: JavdbApiClient = Depends(get_client),
) -> dict[str, bool]:
    FollowWorkflowService(
        FollowWorkflowDependencies(
            actors=ActorsRepository(connection),
            follows=FollowsRepository(connection),
            catalog=CatalogRepository(connection),
            tasks=TasksRepository(connection),
            logs=LogsRepository(connection),
            settings=SettingsRepository(connection),
            javdb=javdb,
        )
    ).retry_task(task_id)
    return {"ok": True}


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    connection: Connection = Depends(get_connection),
) -> dict[str, object]:
    repository = TasksRepository(connection)
    settings = SettingsRepository(connection)
    counts = repository.counts()
    stats = {
        "submitted": counts.get("submitted", 0),
        "downloading": counts.get("downloading", 0),
        "completed": counts.get("completed", 0),
        "failed": counts.get("failed", 0),
    }
    return {
        "stats": stats,
        "connections": IntegrationStatusService(settings).dashboard_status(),
        "recent_tasks": repository.list_all(8),
    }
