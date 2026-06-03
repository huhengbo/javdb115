from __future__ import annotations

import logging
from sqlite3 import Connection
from typing import Any, cast

from fastapi import APIRouter, BackgroundTasks, Depends

from app.adapters.javdb_api import JavdbApiClient
from app.config import load_config
from app.contracts import FollowCreate, FollowOut, FollowUpdate
from app.database import Database
from app.dependencies import get_connection, require_user
from app.errors import NotFoundError
from app.repositories.follows import FollowsRepository
from app.services.follows import FollowsService

router = APIRouter(prefix="/api/follows", tags=["follows"], dependencies=[Depends(require_user)])
LOGGER = logging.getLogger(__name__)


def get_api_client() -> JavdbApiClient:
    return JavdbApiClient()


@router.get("", response_model=list[FollowOut])
def list_follows(connection: Connection = Depends(get_connection)) -> list[dict[str, Any]]:
    return FollowsRepository(connection).list_all()


@router.post("", response_model=FollowOut)
def create_follow(
    payload: FollowCreate,
    background_tasks: BackgroundTasks,
    connection: Connection = Depends(get_connection),
) -> dict[str, Any]:
    repository = FollowsRepository(connection)
    follow = repository.save(
        payload.actor_external_id,
        payload.actor_name,
        payload.actor_profile_url,
        payload.actor_avatar_url,
        payload.selected_tag_ids,
        payload.selected_tag_names,
        payload.type,
    )
    connection.commit()
    schedule_baseline(background_tasks, int(cast(int, follow["id"])))
    return follow


@router.patch("/{follow_id}", response_model=FollowOut)
def update_follow(
    follow_id: int,
    payload: FollowUpdate,
    background_tasks: BackgroundTasks,
    connection: Connection = Depends(get_connection),
) -> dict[str, Any]:
    repository = FollowsRepository(connection)
    result = repository.update(
        follow_id,
        payload.enabled,
        payload.selected_tag_ids,
        payload.selected_tag_names,
    )
    if not result:
        raise NotFoundError(f"Follow not found: {follow_id}")
    if payload.selected_tag_ids is not None or payload.selected_tag_names is not None:
        repository.update_latest(follow_id, 0)
        connection.commit()
        schedule_baseline(background_tasks, follow_id)
        result = repository.get(follow_id) or result
    return result


def schedule_baseline(
    background_tasks: BackgroundTasks,
    follow_id: int,
) -> None:
    background_tasks.add_task(run_baseline_task, follow_id)


def run_baseline_task(follow_id: int) -> None:
    database = Database(load_config().database_path)
    with database.connect() as connection:
        repository = FollowsRepository(connection)
        follow = repository.get(follow_id)
        if follow is None:
            LOGGER.warning("Follow baseline skipped for missing follow %s", follow_id)
            return
        try:
            FollowsService(repository, JavdbApiClient()).baseline(follow)
            connection.commit()
        except Exception:
            connection.rollback()
            LOGGER.exception("Follow baseline failed for follow %s", follow_id)


@router.delete("/{follow_id}")
def delete_follow(
    follow_id: int,
    connection: Connection = Depends(get_connection),
) -> dict[str, bool]:
    FollowsRepository(connection).delete(follow_id)
    return {"ok": True}


@router.post("/{follow_id}/check")
def check_follow(
    follow_id: int,
    connection: Connection = Depends(get_connection),
    api_client: JavdbApiClient = Depends(get_api_client),
) -> dict[str, Any]:
    repository = FollowsRepository(connection)
    follow = repository.get(follow_id)
    if not follow:
        raise NotFoundError(f"Follow not found: {follow_id}")
    return FollowsService(repository, api_client).check_one(follow)


@router.post("/check")
def check_all(
    connection: Connection = Depends(get_connection),
    api_client: JavdbApiClient = Depends(get_api_client),
) -> list[dict[str, Any]]:
    repository = FollowsRepository(connection)
    return FollowsService(repository, api_client).check_all()
