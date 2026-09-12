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

from app.adapters.javdb.authed import JavdbAuthedApi
from app.adapters.javdb.catalog import JavdbCatalogApi
from app.adapters.javdb.media import resolve_image_url
from app.adapters.javdb.query import query_string
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
MOVIE_DETAIL_LIST_FIELDS = (
    "actors",
    "tags",
    "preview_images",
    "relative_movies",
    "actor_movies",
    "play_sources",
    "top_rankings",
)
MOVIE_LIST_LIST_FIELDS = ("preview_images", "tags")
JAVDB_CACHE_MAX_ENTRIES = 512
JAVDB_SHORT_CACHE_TTL_SECONDS = 300
JAVDB_MEDIUM_CACHE_TTL_SECONDS = 1800
JAVDB_LONG_CACHE_TTL_SECONDS = 3600
MOVIE_DETAIL_PATH_PREFIX = "/api/v4/movies/"
MOVIE_API_PATH_PREFIX = "/api/v1/movies/"
MAGNETS_PATH_SUFFIX = "/magnets"
REVIEWS_PATH_SUFFIX = "/reviews"
ACTOR_DETAIL_PATH_PREFIX = "/api/v1/actors/"
SESSIONS_PATH = "/api/v1/sessions"
LOGIN_DEVICE_NAME = "javdb115"
LOGIN_DEVICE_MODEL = "javdb115"
LOGIN_SYSTEM_VERSION = "1.0"


def make_signature(ts: int | None = None) -> str:
    ts = ts or int(time.time())
    return f"{ts}.{DEVICE_ID}.{hashlib.md5(f'{ts}{PART1}'.encode()).hexdigest()}"


def make_request_headers(sig: str, authorization: str | None = None) -> dict[str, str]:
    headers = {**API_HEADERS, "jdsignature": sig}
    if authorization:
        headers["authorization"] = authorization
    return headers


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
        self._items: OrderedDict[tuple[str, str, str], JavdbCacheEntry] = OrderedDict()
        self._max_entries = max_entries
        self._time_provider = time_provider
        self._lock = threading.Lock()

    def get(self, key: tuple[str, str, str]) -> str | None:
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

    def set(self, key: tuple[str, str, str], value: str, ttl_seconds: int) -> None:
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
        authorization: str | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout_seconds = timeout_seconds
        self.authorization = authorization

    def javdb_api_get(self, path: str, query: str, sig: str) -> str:
        url = f"{self._base_url}{path}?{query}"
        response = httpx.get(
            url,
            headers=make_request_headers(sig, self.authorization),
            timeout=self._timeout_seconds,
        )
        response.raise_for_status()
        return response.text

    def javdb_api_post(self, path: str, query: str, sig: str, fields: dict[str, str]) -> str:
        url = f"{self._base_url}{path}?{query}"
        response = httpx.post(
            url,
            headers=make_request_headers(sig, self.authorization),
            data=fields,
            timeout=self._timeout_seconds,
        )
        response.raise_for_status()
        return response.text

    def javdb_api_post_files(
        self,
        path: str,
        query: str,
        sig: str,
        files: dict[str, tuple[str, bytes]],
    ) -> str:
        url = f"{self._base_url}{path}?{query}"
        response = httpx.post(
            url,
            headers=make_request_headers(sig, self.authorization),
            files=files,
            timeout=self._timeout_seconds,
        )
        response.raise_for_status()
        return response.text

    def javdb_api_delete(self, path: str, query: str, sig: str) -> str:
        url = f"{self._base_url}{path}?{query}"
        response = httpx.delete(
            url,
            headers=make_request_headers(sig, self.authorization),
            timeout=self._timeout_seconds,
        )
        response.raise_for_status()
        return response.text


class JavdbApiClient(JavdbCatalogApi):
    def __init__(
        self,
        transport: JavdbApiTransport | None = None,
        site_base_url: str = "https://javdb.com",
        cache: JavdbApiResponseCache | None = None,
        authorization: str | None = None,
    ) -> None:
        token = authorization.strip() if authorization else ""
        self._authorization = token or None
        self._transport = transport or HttpJavdbApiTransport(authorization=self._authorization)
        self._site_base_url = site_base_url.rstrip("/")
        self._cache = cache if cache is not None else self._default_cache(transport)
        self.authed = JavdbAuthedApi(self)

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
        key = self._cache_key(path, query)
        cached = self._cache.get(key) if self._cache else None
        if cached is not None:
            return cached
        raw = self._transport.javdb_api_get(path, query, make_signature())
        if self._cache:
            self._cache.set(key, raw, self._cache_ttl_seconds(path))
        return raw

    def _cache_key(self, path: str, query: str) -> tuple[str, str, str]:
        token = self._authorization or ""
        token_fp = hashlib.sha256(token.encode()).hexdigest()[:16] if token else ""
        return (path, query, token_fp)

    def _post(self, path: str, fields: dict[str, str], extra_params: str = "") -> dict[str, Any]:
        query = f"{COMMON_PARAMS}&{extra_params}" if extra_params else COMMON_PARAMS
        post = getattr(self._transport, "javdb_api_post", None)
        if post is None:
            raise IntegrationError("JavDB login is not supported by this transport")
        try:
            raw = post(path, query, make_signature(), fields)
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

    def _post_files(
        self,
        path: str,
        files: dict[str, tuple[str, bytes]],
        extra_params: str = "",
    ) -> dict[str, Any]:
        query = f"{COMMON_PARAMS}&{extra_params}" if extra_params else COMMON_PARAMS
        post = getattr(self._transport, "javdb_api_post_files", None)
        if post is None:
            raise IntegrationError("JavDB file upload is not supported by this transport")
        try:
            raw = post(path, query, make_signature(), files)
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

    def _delete(self, path: str, extra_params: str = "") -> dict[str, Any]:
        query = f"{COMMON_PARAMS}&{extra_params}" if extra_params else COMMON_PARAMS
        delete = getattr(self._transport, "javdb_api_delete", None)
        if delete is None:
            raise IntegrationError("JavDB delete is not supported by this transport")
        try:
            raw = delete(path, query, make_signature())
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

    def _require_success(self, payload: dict[str, Any], fallback: str) -> dict[str, Any]:
        if payload.get("success") != 0:
            return payload
        message = payload.get("message") or payload.get("action") or fallback
        raise IntegrationError(str(message))

    def _set_authorization(self, token: str) -> None:
        self._authorization = token
        if isinstance(self._transport, HttpJavdbApiTransport):
            self._transport.authorization = token

    def login(
        self,
        username: str,
        password: str,
        *,
        device_uuid: str,
        device_name: str = LOGIN_DEVICE_NAME,
        device_model: str = LOGIN_DEVICE_MODEL,
        system_version: str = LOGIN_SYSTEM_VERSION,
    ) -> dict[str, Any]:
        payload = self._require_success(
            self._post(
                SESSIONS_PATH,
                {
                    "username": username,
                    "password": password,
                    "device_uuid": device_uuid,
                    "device_name": device_name,
                    "device_model": device_model,
                    "system_version": system_version,
                    "platform": "android",
                    "app_channel": "official",
                    "app_version": "official",
                    "app_version_number": "1.9.35",
                },
            ),
            "JavDB 登录失败",
        )
        data = self._dict_value(payload, "data")
        token = data.get("token")
        if not isinstance(token, str) or not token.strip():
            raise IntegrationError("JavDB login did not return a token")
        self._set_authorization(token.strip())
        return {
            "token": token.strip(),
            "user": self._dict_value(data, "user"),
            "following_tags": self._list_value(data, "following_tags"),
        }

    def current_user(self) -> dict[str, Any]:
        user = self.authed.current_user()
        if not user:
            raise IntegrationError("JavDB user profile is empty")
        return user

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

    def _data(self, path: str, extra_params: str = "") -> dict[str, Any]:
        return self._dict_value(self._get(path, extra_params), "data")

    def _movies(self, path: str, extra_params: str = "") -> list[dict[str, Any]]:
        return [
            self._normalize_movie_list_item(movie)
            for movie in self._list_value(self._data(path, extra_params), "movies")
        ]

    def resolve_image_url(self, url: str | None) -> str | None:
        return resolve_image_url(url)

    def about(self) -> list[dict[str, Any]]:
        return self._list_value(self._get("/api/v1/about"), "data")

    def startup(self) -> dict[str, Any]:
        return self._data("/api/v1/startup")

    def movies_recommend(self, period: str = "daily") -> list[dict[str, Any]]:
        return self._movies("/api/v1/movies/recommend", f"period={period}")

    def movies_latest(
        self,
        filter_by: str = "can_play",
        sort_by: str = "update",
        page: int = 1,
        limit: int = 24,
    ) -> list[dict[str, Any]]:
        return self._movies(
            "/api/v1/movies/latest",
            f"type=all&filter_by={filter_by}&sort_by={sort_by}&page={page}&limit={limit}",
        )

    def movies_by_tag(
        self,
        filter_by: str,
        sort_by: str = "update",
        page: int = 1,
        limit: int = 24,
    ) -> list[dict[str, Any]]:
        return self._movies(
            "/api/v1/movies/tags",
            f"filter_by={filter_by}&sort_by={sort_by}&page={page}&limit={limit}",
        )

    def movie_detail(self, movie_id: str) -> dict[str, Any]:
        movie = self._dict_value(self._data(f"/api/v4/movies/{movie_id}"), "movie")
        return self._normalize_movie_detail(movie)

    def movie_magnets(self, movie_id: str) -> list[dict[str, Any]]:
        return self._list_value(self._data(f"/api/v1/movies/{movie_id}/magnets"), "magnets")

    def movie_reviews(self, movie_id: str, page: int = 1, limit: int = 5) -> list[dict[str, Any]]:
        return self._list_value(
            self._data(
                f"/api/v1/movies/{movie_id}/reviews",
                f"page={page}&sort_by=hotly&limit={limit}",
            ),
            "reviews",
        )

    def rankings(self, rtype: str = "0", period: str = "daily") -> list[dict[str, Any]]:
        return self._movies("/api/v1/rankings", f"type={rtype}&period={period}")

    def rankings_playback(
        self, period: str = "daily", filter_by: str = "high_score"
    ) -> list[dict[str, Any]]:
        return self._movies(
            "/api/v1/rankings/playback",
            f"period={period}&filter_by={filter_by}",
        )

    def movies_top(
        self,
        page: int = 1,
        limit: int = 50,
        rtype: str = "all",
        type_value: str = "",
        start_rank: int = 1,
    ) -> list[dict[str, Any]]:
        payload = self._get(
            "/api/v1/movies/top",
            (
                f"start_rank={start_rank}&type={rtype}&type_value={type_value}"
                f"&ignore_watched=false&page={page}&limit={limit}"
            ),
        )
        if payload.get("success") == 0 or payload.get("action") == "JWTVerificationError":
            raise IntegrationError("TOP250 需要 JavDB 登录，请先在设置中登录 JavDB 账号")
        return [
            self._normalize_movie_list_item(movie)
            for movie in self._list_value(self._dict_value(payload, "data"), "movies")
        ]

    def search(
        self,
        query: str,
        *,
        result_type: str = "movie",
        page: int = 1,
        movie_type: str = "",
        movie_sort_by: str = "",
        movie_filter_by: str = "",
    ) -> list[dict[str, Any]]:
        """搜索。

        入参:
            query: 关键字，必填。
            result_type: `movie` / `actor` / `series` / `maker` / `director` / `code`。
            page: 作品搜索分页。
            movie_type / movie_sort_by / movie_filter_by: 仅作品搜索。
        出参:
            movie 返回作品列表；其它类型分别返回 actors/series/makers/directors/codes。
        """
        extra = query_string(
            q=query,
            page=page if page != 1 else "",
            type="" if result_type == "movie" else result_type,
            movie_type=movie_type,
            movie_sort_by=movie_sort_by,
            movie_filter_by=movie_filter_by,
        )
        if result_type == "movie":
            return self._movies("/api/v2/search", extra)
        key = {
            "actor": "actors",
            "series": "series",
            "maker": "makers",
            "director": "directors",
            "code": "codes",
        }.get(result_type, "movies")
        return self._list_value(self._data("/api/v2/search", extra), key)

    def rankings_actors(self, rtype: str = "0", filter_by: str = "") -> list[dict[str, Any]]:
        """演员排行。

        入参:
            rtype: `0` 有码等分类。
            filter_by: 有码排行必填的子筛选；空则不传。
        出参:
            list[dict]，字段: id, name, name_zht, other_name, avatar_url。
        """
        return self._list_value(
            self._data(
                "/api/v1/rankings/actors",
                query_string(type=rtype, filter_by=filter_by),
            ),
            "actors",
        )

    def actor_detail(self, actor_id: str) -> dict[str, Any]:
        actor = self._dict_value(self._data(f"/api/v1/actors/{actor_id}"), "actor")
        return self._normalize_actor(actor)

    def actor_filter_tags(self, actor_id: str) -> list[dict[str, Any]]:
        return self._list_value(self._data(f"/api/v1/actors/{actor_id}"), "filter_tags")

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

    def _normalize_movie_detail(self, detail: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(detail)
        for field in MOVIE_DETAIL_LIST_FIELDS:
            if not isinstance(normalized.get(field), list):
                normalized[field] = []
        normalized["relative_movies"] = [
            self._normalize_movie_list_item(movie) for movie in normalized["relative_movies"]
        ]
        normalized["actor_movies"] = [
            self._normalize_movie_list_item(movie) for movie in normalized["actor_movies"]
        ]
        if "has_preview_video" in normalized:
            normalized["has_preview_video"] = bool(normalized.get("has_preview_video"))
        if "has_preview_images" in normalized:
            normalized["has_preview_images"] = bool(normalized.get("has_preview_images"))
        return normalized

    def _normalize_movie_list_item(self, movie: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(movie)
        for field in MOVIE_LIST_LIST_FIELDS:
            if field in normalized and not isinstance(normalized.get(field), list):
                normalized[field] = []
        return normalized

    def _normalize_actor(self, actor: dict[str, Any]) -> dict[str, Any]:
        return dict(actor)


def client_from_token(token: str | None) -> JavdbApiClient:
    cleaned = token.strip() if token else ""
    return JavdbApiClient(authorization=cleaned or None)
