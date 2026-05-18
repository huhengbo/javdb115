from __future__ import annotations

from sqlite3 import Connection

from fastapi import APIRouter, Depends

from app.adapters.javdb_api import JavdbApiClient
from app.dependencies import get_connection, require_user
from app.repositories.actors import ActorsRepository
from app.repositories.catalog import CatalogRepository
from app.repositories.follows import FollowsRepository
from app.repositories.logs import LogsRepository
from app.repositories.settings import SettingsRepository
from app.repositories.tasks import TasksRepository
from app.services.follow_workflow import FollowWorkflowDependencies, FollowWorkflowService

router = APIRouter(prefix="/api/checks", tags=["checks"], dependencies=[Depends(require_user)])


def get_client() -> JavdbApiClient:
    return JavdbApiClient()


@router.post("/run")
def run_all(
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
    ).check_all_enabled()
    return {"ok": True}
