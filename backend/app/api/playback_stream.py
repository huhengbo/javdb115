from __future__ import annotations

import mimetypes
import threading
import time
from collections.abc import AsyncIterator
from urllib.parse import quote

import anyio
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from starlette.responses import Response, StreamingResponse

from app.adapters.cloud115_types import CloudDownloadUrl, CloudItem
from app.api.tools import playback_service
from app.database import Database
from app.dependencies import get_database
from app.repositories.playback import PlaybackRepository
from app.security import now_utc

# 播放器（VLC、系统播放器等）无法携带登录 Cookie，这里靠会话内的随机 stream token 鉴权。
# 115 直链要求访问时的 User-Agent 与获取直链时一致，且可能绑定来源 IP，
# 因此由服务端按原请求头拉取并转发 Range，播放器只访问本服务地址。
router = APIRouter(prefix="/api/playback", tags=["playback"])

URL_CACHE_TTL_SECONDS = 10 * 60
UPSTREAM_TIMEOUT = httpx.Timeout(30.0)
REFRESH_STATUSES = {401, 403, 404, 410}
PASSTHROUGH_HEADERS = ("content-length", "content-range", "accept-ranges", "last-modified", "etag")
EXTRA_VIDEO_TYPES = {
    ".mkv": "video/x-matroska",
    ".ts": "video/mp2t",
    ".m4v": "video/mp4",
    ".webm": "video/webm",
}

_URL_CACHE: dict[tuple[str, str], tuple[float, CloudItem, CloudDownloadUrl]] = {}
_URL_CACHE_LOCK = threading.Lock()


def _new_upstream_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT, follow_redirects=True)


@router.api_route("/stream/{stream_token}/{filename}", methods=["GET", "HEAD"])
async def stream_playback(
    stream_token: str,
    filename: str,
    request: Request,
    database: Database = Depends(get_database),
) -> Response:
    del filename  # 仅用于让播放器识别扩展名，实际文件以会话中选中的为准
    item, source = await run_in_threadpool(_resolve_source, database, stream_token, False)
    client = _new_upstream_client()
    try:
        upstream = await _open_upstream(client, source, request)
        if upstream.status_code in REFRESH_STATUSES:
            # 直链过期或失效：丢弃缓存重新获取一次
            await upstream.aclose()
            item, source = await run_in_threadpool(_resolve_source, database, stream_token, True)
            upstream = await _open_upstream(client, source, request)
    except httpx.HTTPError as exc:
        await client.aclose()
        raise HTTPException(status_code=502, detail="115 视频流连接失败") from exc

    if upstream.status_code >= 400 and upstream.status_code != 416:
        await upstream.aclose()
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"115 视频流返回 {upstream.status_code}")

    headers = _response_headers(upstream, item)
    if request.method == "HEAD":
        await upstream.aclose()
        await client.aclose()
        return Response(status_code=upstream.status_code, headers=headers)

    async def body() -> AsyncIterator[bytes]:
        try:
            async for chunk in upstream.aiter_raw():
                yield chunk
        finally:
            # 播放器拖动或断开时会取消本次响应，屏蔽取消以确保上游连接随之释放
            with anyio.CancelScope(shield=True):
                await upstream.aclose()
                await client.aclose()

    return StreamingResponse(body(), status_code=upstream.status_code, headers=headers)


async def _open_upstream(
    client: httpx.AsyncClient,
    source: CloudDownloadUrl,
    request: Request,
) -> httpx.Response:
    headers = dict(source.headers)
    range_header = request.headers.get("range")
    if range_header:
        headers["range"] = range_header
    upstream_request = client.build_request("GET", source.url, headers=headers)
    return await client.send(upstream_request, stream=True)


def _resolve_source(
    database: Database,
    stream_token: str,
    refresh: bool,
) -> tuple[CloudItem, CloudDownloadUrl]:
    with database.connect() as connection:
        session = PlaybackRepository(connection).get_by_token(stream_token)
        playable = (
            session is not None
            and session.status == "ready"
            and session.selected_file_id is not None
            and session.expires_at > now_utc()
        )
        if not refresh and playable and session is not None:
            cached = _cached_source((stream_token, str(session.selected_file_id)))
            if cached is not None:
                return cached
        item, source = playback_service(connection).stream_source(stream_token)
    with _URL_CACHE_LOCK:
        _URL_CACHE[(stream_token, item.id)] = (time.monotonic(), item, source)
    return item, source


def _cached_source(cache_key: tuple[str, str]) -> tuple[CloudItem, CloudDownloadUrl] | None:
    now = time.monotonic()
    with _URL_CACHE_LOCK:
        for key, (fetched_at, _, _) in list(_URL_CACHE.items()):
            if now - fetched_at > URL_CACHE_TTL_SECONDS:
                _URL_CACHE.pop(key, None)
        cached = _URL_CACHE.get(cache_key)
    return None if cached is None else (cached[1], cached[2])


def _response_headers(upstream: httpx.Response, item: CloudItem) -> dict[str, str]:
    headers = {
        name: upstream.headers[name]
        for name in PASSTHROUGH_HEADERS
        if name in upstream.headers
    }
    headers.setdefault("accept-ranges", "bytes")
    headers["content-type"] = _media_type(item.name, upstream.headers.get("content-type"))
    headers["content-disposition"] = f"inline; filename*=UTF-8''{quote(item.name)}"
    return headers


def _media_type(filename: str, upstream_type: str | None) -> str:
    suffix = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    guessed = EXTRA_VIDEO_TYPES.get(suffix) or mimetypes.guess_type(filename)[0]
    if guessed:
        return guessed
    return upstream_type or "application/octet-stream"
