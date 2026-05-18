from __future__ import annotations

from sqlite3 import Connection
from typing import cast

from fastapi import APIRouter, Depends, Query

from app.adapters.javdb_api import JavdbApiClient
from app.contracts import ManualOfflineRequest, ManualOfflineResponse, TaskOut
from app.dependencies import get_connection, require_user
from app.repositories.actors import ActorsRepository
from app.repositories.catalog import CatalogRepository
from app.repositories.logs import LogsRepository
from app.repositories.settings import SettingsRepository
from app.repositories.tasks import TasksRepository
from app.services.manual_offline import ManualOfflineDependencies, ManualOfflineService

router = APIRouter(prefix="/api/javdb", tags=["javdb"], dependencies=[Depends(require_user)])


def get_client() -> JavdbApiClient:
    return JavdbApiClient()


@router.get("/movies/latest")
def movies_latest(
    filter_by: str = Query(default="can_play"),
    page: int = Query(default=1),
    limit: int = Query(default=24),
    client: JavdbApiClient = Depends(get_client),
) -> list[dict]:
    return client.movies_latest(filter_by=filter_by, page=page, limit=limit)


@router.get("/movies/tags")
def movies_by_tag(
    filter_by: str = Query(),
    page: int = Query(default=1),
    limit: int = Query(default=24),
    client: JavdbApiClient = Depends(get_client),
) -> list[dict]:
    return client.movies_by_tag(filter_by, page=page, limit=limit)


@router.get("/movies/recommend")
def movies_recommend(
    period: str = Query(default="daily"),
    client: JavdbApiClient = Depends(get_client),
) -> list[dict]:
    return client.movies_recommend(period)


@router.get("/movies/{movie_id}")
def movie_detail(
    movie_id: str,
    client: JavdbApiClient = Depends(get_client),
) -> dict:
    return client.movie_detail(movie_id)


@router.get("/movies/{movie_id}/magnets")
def movie_magnets(
    movie_id: str,
    client: JavdbApiClient = Depends(get_client),
) -> list[dict]:
    return client.movie_magnets(movie_id)


@router.get("/movies/{movie_id}/reviews")
def movie_reviews(
    movie_id: str,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=5, ge=1, le=20),
    client: JavdbApiClient = Depends(get_client),
) -> list[dict]:
    return client.movie_reviews(movie_id, page=page, limit=limit)


@router.get("/rankings")
def rankings(
    type: str = Query(default="0"),
    period: str = Query(default="today"),
    client: JavdbApiClient = Depends(get_client),
) -> list[dict]:
    return client.rankings(rtype=type, period=period)


@router.get("/rankings/playback")
def rankings_playback(
    period: str = Query(default="daily"),
    filter_by: str = Query(default="high_score"),
    client: JavdbApiClient = Depends(get_client),
) -> list[dict]:
    return client.rankings_playback(period=period, filter_by=filter_by)


@router.get("/rankings/actors")
def rankings_actors(
    type: str = Query(default="monthly"),
    client: JavdbApiClient = Depends(get_client),
) -> list[dict]:
    return client.rankings_actors(rtype=type)


@router.get("/actors/{actor_id}")
def actor_detail(
    actor_id: str,
    client: JavdbApiClient = Depends(get_client),
) -> dict:
    return client.actor_detail(actor_id)


@router.get("/actors/{actor_id}/movies")
def actor_movies(
    actor_id: str,
    tag_ids: list[str] = Query(default_factory=list),
    sort_type: int = Query(default=0),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=24, ge=1, le=48),
    client: JavdbApiClient = Depends(get_client),
) -> list[dict]:
    return client.actor_movies(
        actor_id,
        tag_ids=tag_ids,
        sort_type=sort_type,
        page=page,
        limit=limit,
    )


@router.post("/movies/{movie_id}/offline", response_model=ManualOfflineResponse)
def submit_movie_offline(
    movie_id: str,
    payload: ManualOfflineRequest,
    connection: Connection = Depends(get_connection),
    client: JavdbApiClient = Depends(get_client),
) -> ManualOfflineResponse:
    result = ManualOfflineService(
        ManualOfflineDependencies(
            actors=ActorsRepository(connection),
            catalog=CatalogRepository(connection),
            logs=LogsRepository(connection),
            settings=SettingsRepository(connection),
            tasks=TasksRepository(connection),
            javdb=client,
        )
    ).submit(movie_id, payload.magnet_hash, force=payload.force)
    return ManualOfflineResponse(
        ok=result.task_id is not None,
        task_id=result.task_id,
        duplicate_task=cast(TaskOut | None, result.duplicate_task),
    )


@router.get("/search")
def search(
    q: str = Query(min_length=1),
    client: JavdbApiClient = Depends(get_client),
) -> list[dict]:
    return client.search(q)
