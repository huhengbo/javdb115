from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Protocol

JAVDB_MOVIE_PAYLOAD_WORKERS = 2


class JavdbMoviePayloadClient(Protocol):
    def movie_detail(self, movie_id: str) -> dict[str, Any]: ...
    def movie_magnets(self, movie_id: str) -> list[dict[str, Any]]: ...


@dataclass(frozen=True)
class JavdbMoviePayload:
    detail: dict[str, Any]
    magnets: list[dict[str, Any]]


def fetch_javdb_movie_payload(
    client: JavdbMoviePayloadClient,
    movie_id: str,
) -> JavdbMoviePayload:
    with ThreadPoolExecutor(
        max_workers=JAVDB_MOVIE_PAYLOAD_WORKERS,
        thread_name_prefix="javdb-movie",
    ) as executor:
        detail_future = executor.submit(client.movie_detail, movie_id)
        magnets_future = executor.submit(client.movie_magnets, movie_id)
        return JavdbMoviePayload(
            detail=detail_future.result(),
            magnets=magnets_future.result(),
        )
