from __future__ import annotations

import hashlib
import json
import time
from typing import Protocol
from urllib.parse import urljoin

import httpx

from app.errors import IntegrationError

PART1 = (
    "71cf27bb3c0bcdf207b64abecddc970098c7421ee7203b9cdae54478478a199e"
    "7d5a6e1a57691123c1a931c057842fb73ba3b3c83bcd69c17ccf174081e3d8aa"
)
DEVICE_ID = "lpw6vgqzsp"
API_BASE_URL = "https://jdforrepam.com"
API_TIMEOUT_SECONDS = 20
COMMON_PARAMS = (
    "platform=android&app_channel=official&app_version=official&app_version_number=1.9.35"
)
API_HEADERS = {
    "Accept": "application/json",
    "Accept-Language": "zh-tw",
    "User-Agent": "Dart/3.4 (dart:io)",
}
ACTOR_SORT_BY_MAP = {
    0: "release",
    1: "score",
    2: "hit",
    3: "want_watch_count",
    4: "watched_count",
}
ACTOR_FILTER_PRIORITY = ("s", "m", "c", "p", "1", "0")
TYPE_TAG_IDS = {"0", "1"}


def make_signature(ts: int | None = None) -> str:
    ts = ts or int(time.time())
    return f"{ts}.{DEVICE_ID}.{hashlib.md5(f"{ts}{PART1}".encode()).hexdigest()}"


class JavdbApiTransport(Protocol):
    def javdb_api_get(self, path: str, query: str, sig: str) -> str: ...


class HttpJavdbApiTransport:
    def __init__(
        self,
        base_url: str = API_BASE_URL,
        timeout_seconds: int = API_TIMEOUT_SECONDS,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout_seconds = timeout_seconds

    def javdb_api_get(self, path: str, query: str, sig: str) -> str:
        url = f"{self._base_url}{path}?{query}"
        response = httpx.get(
            url,
            headers={**API_HEADERS, "jdsignature": sig},
            timeout=self._timeout_seconds,
        )
        response.raise_for_status()
        return response.text


class JavdbApiClient:
    def __init__(
        self,
        transport: JavdbApiTransport | None = None,
        site_base_url: str = "https://javdb.com",
    ) -> None:
        self._transport = transport or HttpJavdbApiTransport()
        self._site_base_url = site_base_url.rstrip("/")

    def _get(self, path: str, extra_params: str = "") -> dict:
        sig = make_signature()
        query = f"{COMMON_PARAMS}&{extra_params}" if extra_params else COMMON_PARAMS
        try:
            raw = self._transport.javdb_api_get(path, query, sig)
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            raise IntegrationError(f"JavDB API returned invalid JSON: {path}") from exc
        except Exception as exc:
            raise IntegrationError(f"JavDB API request failed: {path}") from exc

    def about(self) -> list[dict]:
        return self._get("/api/v1/about").get("data", [])

    def startup(self) -> dict:
        return self._get("/api/v1/startup").get("data", {})

    def movies_recommend(self, period: str = "daily") -> list[dict]:
        return self._get("/api/v1/movies/recommend", f"period={period}").get(
            "data", {}
        ).get("movies", [])

    def movies_latest(
        self, filter_by: str = "can_play", sort_by: str = "update",
        page: int = 1, limit: int = 24,
    ) -> list[dict]:
        return self._get(
            "/api/v1/movies/latest",
            f"type=all&filter_by={filter_by}&sort_by={sort_by}&page={page}&limit={limit}",
        ).get("data", {}).get("movies", [])

    def movies_by_tag(
        self, filter_by: str, sort_by: str = "update",
        page: int = 1, limit: int = 24,
    ) -> list[dict]:
        return self._get(
            "/api/v1/movies/tags",
            f"filter_by={filter_by}&sort_by={sort_by}&page={page}&limit={limit}",
        ).get("data", {}).get("movies", [])

    def movie_detail(self, movie_id: str) -> dict:
        return self._get(f"/api/v4/movies/{movie_id}").get("data", {}).get("movie", {})

    def movie_magnets(self, movie_id: str) -> list[dict]:
        return self._get(f"/api/v1/movies/{movie_id}/magnets").get(
            "data", {}
        ).get("magnets", [])

    def movie_reviews(
        self, movie_id: str, page: int = 1, limit: int = 5
    ) -> list[dict]:
        return self._get(
            f"/api/v1/movies/{movie_id}/reviews",
            f"page={page}&sort_by=hotly&limit={limit}",
        ).get("data", {}).get("reviews", [])

    def rankings(self, rtype: str = "0", period: str = "today") -> list[dict]:
        return self._get(
            "/api/v1/rankings", f"type={rtype}&period={period}"
        ).get("data", {}).get("movies", [])

    def rankings_playback(
        self, period: str = "daily", filter_by: str = "high_score"
    ) -> list[dict]:
        return self._get(
            "/api/v1/rankings/playback", f"period={period}&filter_by={filter_by}"
        ).get("data", {}).get("movies", [])

    def rankings_actors(self, rtype: str = "monthly") -> list[dict]:
        return self._get(
            "/api/v1/rankings/actors", f"type={rtype}"
        ).get("data", {}).get("actors", [])

    def search(self, query: str) -> list[dict]:
        return self._get("/api/v2/search", f"q={query}").get("data", {}).get("movies", [])

    def actor_detail(self, actor_id: str) -> dict:
        return self._get(f"/api/v1/actors/{actor_id}").get("data", {}).get("actor", {})

    def actor_filter_tags(self, actor_id: str) -> list[dict]:
        return self._get(f"/api/v1/actors/{actor_id}").get("data", {}).get("filter_tags", [])

    def actor_movies(
        self,
        actor_id: str,
        tag_ids: list[str] | None = None,
        sort_type: int = 0,
        page: int = 1,
        limit: int = 24,
    ) -> list[dict]:
        normalized_tag_ids = [tag_id for tag_id in tag_ids or [] if tag_id]
        actor_type_tag = self._default_actor_tag(actor_id)
        primary_tag_id = self._primary_actor_tag(normalized_tag_ids, actor_type_tag)
        movies = self.movies_by_tag(
            self._actor_filter_value(actor_id, primary_tag_id),
            sort_by=self._actor_sort_by(sort_type),
            page=page,
            limit=limit,
        )
        remaining_tag_ids = [
            tag_id for tag_id in normalized_tag_ids if tag_id != primary_tag_id
        ]
        if not remaining_tag_ids:
            return movies
        filtered_movies = [
            movie
            for movie in movies
            if self._movie_matches_tags(movie, remaining_tag_ids, actor_type_tag)
        ]
        return filtered_movies

    def _primary_actor_tag(self, tag_ids: list[str], actor_type_tag: str) -> str:
        for tag_id in ACTOR_FILTER_PRIORITY:
            if tag_id in tag_ids:
                return tag_id
        return actor_type_tag

    def _movie_matches_tags(
        self,
        movie: dict,
        tag_ids: list[str],
        actor_type_tag: str,
    ) -> bool:
        detail: dict | None = None
        for tag_id in tag_ids:
            list_match = self._matches_list_tag(movie, tag_id, actor_type_tag)
            if list_match is False:
                return False
            if list_match is True:
                continue
            detail = detail or self.movie_detail(str(movie["id"]))
            if not self._matches_detail_tag(detail, tag_id):
                return False
        return True

    def _matches_list_tag(
        self,
        movie: dict,
        tag_id: str,
        actor_type_tag: str,
    ) -> bool | None:
        if tag_id in TYPE_TAG_IDS:
            movie_type = movie.get("type")
            return str(movie_type) == tag_id if movie_type is not None else actor_type_tag == tag_id
        if tag_id == "p":
            return bool(movie.get("can_play"))
        if tag_id == "m":
            return int(movie.get("magnets_count") or 0) > 0
        if tag_id == "c":
            return bool(movie.get("has_cnsub"))
        tag_values = {str(tag.get("id")) for tag in movie.get("tags", [])}
        if tag_values:
            return "28" in tag_values if tag_id == "s" else tag_id in tag_values
        return None

    def _matches_detail_tag(self, detail: dict, tag_id: str) -> bool:
        if tag_id == "s":
            tag_values = {str(tag.get("id")) for tag in detail.get("tags", [])}
            return "28" in tag_values
        return self._matches_tag(detail, tag_id)

    def _matches_tag(self, detail: dict, tag_id: str) -> bool:
        if tag_id in {"0", "1"}:
            return str(detail.get("type")) == tag_id
        if tag_id == "p":
            return bool(detail.get("can_play"))
        if tag_id == "m":
            return int(detail.get("magnets_count") or 0) > 0
        if tag_id == "c":
            return bool(detail.get("has_cnsub"))
        if tag_id == "s":
            tag_values = {str(tag.get("id")) for tag in detail.get("tags", [])}
            return "28" in tag_values
        tag_values = {str(tag.get("id")) for tag in detail.get("tags", [])}
        return tag_id in tag_values

    def _default_actor_tag(self, actor_id: str) -> str:
        actor_type = int(self.actor_detail(actor_id).get("type") or 0)
        return str(actor_type)

    def _actor_filter_value(self, actor_id: str, tag_id: str) -> str:
        return f"{tag_id}:a:{actor_id}"

    def _actor_sort_by(self, sort_type: int) -> str:
        return ACTOR_SORT_BY_MAP.get(sort_type, "release")

    def movie_source_url(self, movie_id: str) -> str:
        return urljoin(f"{self._site_base_url}/", f"v/{movie_id}")
