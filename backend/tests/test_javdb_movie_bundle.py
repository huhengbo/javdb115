from __future__ import annotations

from typing import Any

from app.services.javdb_movie_bundle import JavdbMovieBundleService
from app.services.javdb_movie_payload import fetch_javdb_movie_payload


class BundleClient:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def movie_detail(self, movie_id: str) -> dict[str, Any]:
        self.calls.append(f"detail:{movie_id}")
        return {"id": movie_id, "number": "ABC-123"}

    def movie_magnets(self, movie_id: str) -> list[dict[str, Any]]:
        self.calls.append(f"magnets:{movie_id}")
        return [{"hash": "hash-1"}]

    def movie_reviews(
        self,
        movie_id: str,
        page: int = 1,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        self.calls.append(f"reviews:{movie_id}:{page}:{limit}")
        raise RuntimeError("JavDB reviews failed with 502")


def test_movie_payload_fetches_detail_and_magnets() -> None:
    client = BundleClient()

    payload = fetch_javdb_movie_payload(client, "movie-1")

    assert payload.detail == {"id": "movie-1", "number": "ABC-123"}
    assert payload.magnets == [{"hash": "hash-1"}]


def test_movie_bundle_keeps_review_error_explicit() -> None:
    client = BundleClient()

    bundle = JavdbMovieBundleService(client).load("movie-1")

    assert bundle.detail == {"id": "movie-1", "number": "ABC-123"}
    assert bundle.magnets == [{"hash": "hash-1"}]
    assert bundle.reviews == []
    assert bundle.reviews_error == "JavDB reviews failed with 502"
