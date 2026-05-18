from __future__ import annotations

import os
from dataclasses import dataclass

from app.adapters.javdb_api import JavdbApiClient

DEFAULT_ACTOR_SORT_TYPE = 0
DEFAULT_ACTOR_MOVIE_CHECK_LIMIT = 3


def actor_movie_check_limit() -> int:
    raw = os.getenv("APP_ACTOR_MOVIE_CHECK_LIMIT", str(DEFAULT_ACTOR_MOVIE_CHECK_LIMIT))
    value = int(raw)
    if value < 1:
        raise ValueError("APP_ACTOR_MOVIE_CHECK_LIMIT must be greater than 0")
    return value


@dataclass(frozen=True)
class ActorMovieScan:
    sort_type: int = DEFAULT_ACTOR_SORT_TYPE
    limit: int = actor_movie_check_limit()


DEFAULT_ACTOR_MOVIE_SCAN = ActorMovieScan()


def collect_actor_movies(
    client: JavdbApiClient,
    actor_id: str,
    tag_ids: list[str],
    *,
    scan: ActorMovieScan = DEFAULT_ACTOR_MOVIE_SCAN,
) -> list[dict]:
    movies: list[dict] = []
    seen_ids: set[str] = set()
    page_movies = client.actor_movies(
        actor_id,
        tag_ids=tag_ids,
        sort_type=scan.sort_type,
        page=1,
        limit=scan.limit,
    )
    for movie in page_movies:
        movie_id = str(movie["id"])
        if movie_id in seen_ids:
            continue
        seen_ids.add(movie_id)
        movies.append(movie)
    return movies
