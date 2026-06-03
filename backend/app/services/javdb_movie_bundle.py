from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Protocol

JAVDB_MOVIE_BUNDLE_WORKERS = 3


class JavdbMovieBundleClient(Protocol):
    def movie_detail(self, movie_id: str) -> dict[str, Any]: ...
    def movie_magnets(self, movie_id: str) -> list[dict[str, Any]]: ...

    def movie_reviews(
        self,
        movie_id: str,
        page: int = 1,
        limit: int = 5,
    ) -> list[dict[str, Any]]: ...


@dataclass(frozen=True)
class JavdbMovieBundle:
    detail: dict[str, Any]
    magnets: list[dict[str, Any]]
    reviews: list[dict[str, Any]]
    reviews_error: str | None = None


@dataclass(frozen=True)
class JavdbReviewsResult:
    reviews: list[dict[str, Any]]
    reviews_error: str | None


class JavdbMovieBundleService:
    def __init__(self, client: JavdbMovieBundleClient) -> None:
        self.client = client

    def load(self, movie_id: str) -> JavdbMovieBundle:
        with ThreadPoolExecutor(
            max_workers=JAVDB_MOVIE_BUNDLE_WORKERS,
            thread_name_prefix="javdb-bundle",
        ) as executor:
            detail_future = executor.submit(self.client.movie_detail, movie_id)
            magnets_future = executor.submit(self.client.movie_magnets, movie_id)
            reviews_future = executor.submit(self.client.movie_reviews, movie_id)
            reviews = self._reviews_result(reviews_future)
            return JavdbMovieBundle(
                detail=detail_future.result(),
                magnets=magnets_future.result(),
                reviews=reviews.reviews,
                reviews_error=reviews.reviews_error,
            )

    def _reviews_result(
        self,
        future: Future[list[dict[str, Any]]],
    ) -> JavdbReviewsResult:
        try:
            return JavdbReviewsResult(future.result(), None)
        except Exception as exc:
            return JavdbReviewsResult([], str(exc))
