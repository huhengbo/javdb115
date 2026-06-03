from __future__ import annotations

import hashlib
import json
import threading
import time
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol, cast
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
JAVDB_CACHE_MAX_ENTRIES = 512
JAVDB_SHORT_CACHE_TTL_SECONDS = 300
JAVDB_MEDIUM_CACHE_TTL_SECONDS = 1800
JAVDB_LONG_CACHE_TTL_SECONDS = 3600
MOVIE_DETAIL_PATH_PREFIX = "/api/v4/movies/"
MOVIE_API_PATH_PREFIX = "/api/v1/movies/"
MAGNETS_PATH_SUFFIX = "/magnets"
REVIEWS_PATH_SUFFIX = "/reviews"
ACTOR_DETAIL_PATH_PREFIX = "/api/v1/actors/"


def make_signature(ts: int | None = None) -> str:
    ts = ts or int(time.time())
    return f"{ts}.{DEVICE_ID}.{hashlib.md5(f'{ts}{PART1}'.encode()).hexdigest()}"


class JavdbApiTransport(Protocol):
    def javdb_api_get(self, path: str, query: str, sig: str) -> str: ...


@dataclass(frozen=True)
class JavdbCacheEntry:
    value: str
    expires_at: float


class JavdbApiResponseCache:
    def __init__(
        self,
        *,
        max_entries: int = JAVDB_CACHE_MAX_ENTRIES,
        time_provider: Callable[[], float] = time.monotonic,
    ) -> None:
        self._items: OrderedDict[tuple[str, str], JavdbCacheEntry] = OrderedDict()
        self._max_entries = max_entries
        self._time_provider = time_provider
        self._lock = threading.Lock()

    def get(self, key: tuple[str, str]) -> str | None:
        now = self._time_provider()
        with self._lock:
            entry = self._items.get(key)
            if entry is None:
                return None
            if entry.expires_at <= now:
                del self._items[key]
                return None
            self._items.move_to_end(key)
            return entry.value

    def set(self, key: tuple[str, str], value: str, ttl_seconds: int) -> None:
        now = self._time_provider()
        with self._lock:
            self._items[key] = JavdbCacheEntry(value, now + ttl_seconds)
            self._items.move_to_end(key)
            self._evict(now)

    def _evict(self, now: float) -> None:
        expired = [key for key, entry in self._items.items() if entry.expires_at <= now]
        for key in expired:
            del self._items[key]
        while len(self._items) > self._max_entries:
            self._items.popitem(last=False)


JAVDB_API_RESPONSE_CACHE = JavdbApiResponseCache()


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
        cache: JavdbApiResponseCache | None = None,
    ) -> None:
        self._transport = transport or HttpJavdbApiTransport()
        self._site_base_url = site_base_url.rstrip("/")
        self._cache = cache if cache is not None else self._default_cache(transport)

    def _get(self, path: str, extra_params: str = "") -> dict[str, Any]:
        query = f"{COMMON_PARAMS}&{extra_params}" if extra_params else COMMON_PARAMS
        try:
            raw = self._cached_api_get(path, query)
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                raise IntegrationError(f"JavDB API returned invalid JSON object: {path}")
            return cast(dict[str, Any], payload)
        except json.JSONDecodeError as exc:
            raise IntegrationError(f"JavDB API returned invalid JSON: {path}") from exc
        except IntegrationError:
            raise
        except Exception as exc:
            raise IntegrationError(f"JavDB API request failed: {path}") from exc

    def _default_cache(
        self,
        transport: JavdbApiTransport | None,
    ) -> JavdbApiResponseCache | None:
        return JAVDB_API_RESPONSE_CACHE if transport is None else None

    def _cached_api_get(self, path: str, query: str) -> str:
        key = (path, query)
        cached = self._cache.get(key) if self._cache else None
        if cached is not None:
            return cached
        raw = self._transport.javdb_api_get(path, query, make_signature())
        if self._cache:
            self._cache.set(key, raw, self._cache_ttl_seconds(path))
        return raw

    def _cache_ttl_seconds(self, path: str) -> int:
        if path.startswith(MOVIE_DETAIL_PATH_PREFIX) or path.endswith(MAGNETS_PATH_SUFFIX):
            return JAVDB_MEDIUM_CACHE_TTL_SECONDS
        if path.startswith(ACTOR_DETAIL_PATH_PREFIX):
            return JAVDB_LONG_CACHE_TTL_SECONDS
        return JAVDB_SHORT_CACHE_TTL_SECONDS

    def _dict_value(self, data: dict[str, Any], key: str) -> dict[str, Any]:
        value = data.get(key)
        return cast(dict[str, Any], value) if isinstance(value, dict) else {}

    def _list_value(self, data: dict[str, Any], key: str) -> list[dict[str, Any]]:
        value = data.get(key)
        if not isinstance(value, list):
            return []
        return [cast(dict[str, Any], item) for item in value if isinstance(item, dict)]

    def about(self) -> list[dict[str, Any]]:
        return self._list_value(self._get("/api/v1/about"), "data")

    def startup(self) -> dict[str, Any]:
        return self._dict_value(self._get("/api/v1/startup"), "data")

    def movies_recommend(self, period: str = "daily") -> list[dict[str, Any]]:
        data = self._dict_value(
            self._get("/api/v1/movies/recommend", f"period={period}"),
            "data",
        )
        return self._list_value(data, "movies")

    def movies_latest(
        self,
        filter_by: str = "can_play",
        sort_by: str = "update",
        page: int = 1,
        limit: int = 24,
    ) -> list[dict[str, Any]]:
        data = self._dict_value(
            self._get(
                "/api/v1/movies/latest",
                f"type=all&filter_by={filter_by}&sort_by={sort_by}&page={page}&limit={limit}",
            ),
            "data",
        )
        return self._list_value(data, "movies")

    def movies_by_tag(
        self,
        filter_by: str,
        sort_by: str = "update",
        page: int = 1,
        limit: int = 24,
    ) -> list[dict[str, Any]]:
        data = self._dict_value(
            self._get(
                "/api/v1/movies/tags",
                f"filter_by={filter_by}&sort_by={sort_by}&page={page}&limit={limit}",
            ),
            "data",
        )
        return self._list_value(data, "movies")

    def movie_detail(self, movie_id: str) -> dict[str, Any]:
        data = self._dict_value(self._get(f"/api/v4/movies/{movie_id}"), "data")
        return self._dict_value(data, "movie")

    def movie_magnets(self, movie_id: str) -> list[dict[str, Any]]:
        data = self._dict_value(self._get(f"/api/v1/movies/{movie_id}/magnets"), "data")
        return self._list_value(data, "magnets")

    def movie_reviews(self, movie_id: str, page: int = 1, limit: int = 5) -> list[dict[str, Any]]:
        data = self._dict_value(
            self._get(
                f"/api/v1/movies/{movie_id}/reviews",
                f"page={page}&sort_by=hotly&limit={limit}",
            ),
            "data",
        )
        return self._list_value(data, "reviews")

    def rankings(self, rtype: str = "0", period: str = "today") -> list[dict[str, Any]]:
        data = self._dict_value(
            self._get("/api/v1/rankings", f"type={rtype}&period={period}"),
            "data",
        )
        return self._list_value(data, "movies")

    def rankings_playback(
        self, period: str = "daily", filter_by: str = "high_score"
    ) -> list[dict[str, Any]]:
        data = self._dict_value(
            self._get(
                "/api/v1/rankings/playback",
                f"period={period}&filter_by={filter_by}",
            ),
            "data",
        )
        return self._list_value(data, "movies")

    def rankings_actors(self, rtype: str = "monthly") -> list[dict[str, Any]]:
        data = self._dict_value(
            self._get("/api/v1/rankings/actors", f"type={rtype}"),
            "data",
        )
        return self._list_value(data, "actors")

    def search(self, query: str) -> list[dict[str, Any]]:
        data = self._dict_value(self._get("/api/v2/search", f"q={query}"), "data")
        return self._list_value(data, "movies")

    def actor_detail(self, actor_id: str) -> dict[str, Any]:
        data = self._dict_value(self._get(f"/api/v1/actors/{actor_id}"), "data")
        return self._dict_value(data, "actor")

    def actor_filter_tags(self, actor_id: str) -> list[dict[str, Any]]:
        data = self._dict_value(self._get(f"/api/v1/actors/{actor_id}"), "data")
        return self._list_value(data, "filter_tags")

    def actor_movies(
        self,
        actor_id: str,
        tag_ids: list[str] | None = None,
        sort_type: int = 0,
        page: int = 1,
        limit: int = 24,
    ) -> list[dict[str, Any]]:
        normalized_tag_ids = [tag_id for tag_id in tag_ids or [] if tag_id]
        actor_type_tag = self._default_actor_tag(actor_id)
        primary_tag_id = self._primary_actor_tag(normalized_tag_ids, actor_type_tag)
        movies = self.movies_by_tag(
            self._actor_filter_value(actor_id, primary_tag_id),
            sort_by=self._actor_sort_by(sort_type),
            page=page,
            limit=limit,
        )
        remaining_tag_ids = [tag_id for tag_id in normalized_tag_ids if tag_id != primary_tag_id]
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
        movie: dict[str, Any],
        tag_ids: list[str],
        actor_type_tag: str,
    ) -> bool:
        detail: dict[str, Any] | None = None
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
        movie: dict[str, Any],
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

    def _matches_detail_tag(self, detail: dict[str, Any], tag_id: str) -> bool:
        if tag_id == "s":
            tag_values = {str(tag.get("id")) for tag in detail.get("tags", [])}
            return "28" in tag_values
        return self._matches_tag(detail, tag_id)

    def _matches_tag(self, detail: dict[str, Any], tag_id: str) -> bool:
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
