from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException
from starlette.responses import Response

router = APIRouter(prefix="/api/img", tags=["img"])

ALLOWED_HOSTS = {"tp.cmastd.com", "c0.jdbstatic.com", "javdb.com"}
TP_MEDIA_HOST = "tp.cmastd.com"
JDBSTATIC_HOST = "c0.jdbstatic.com"
TP_TOKENIZED_DIRECTORIES = frozenset({"avatars", "covers", "samples", "small_covers"})
SMALL_COVER_DIRECTORY = "small_covers"
COVER_DIRECTORY = "covers"


def build_upstream_image_url(host: str, path: str) -> str:
    normalized_host = host
    path_parts = path.lstrip("/").split("/")
    if host == TP_MEDIA_HOST:
        if len(path_parts) >= 2 and path_parts[1] in TP_TOKENIZED_DIRECTORIES:
            path_parts = path_parts[1:]
        if path_parts and path_parts[0] == SMALL_COVER_DIRECTORY:
            path_parts[0] = COVER_DIRECTORY
        normalized_host = JDBSTATIC_HOST
    normalized_path = "/".join(path_parts)
    return f"https://{normalized_host}/{normalized_path}"


@router.get("/{host}/{path:path}")
def proxy_image(host: str, path: str):
    if host not in ALLOWED_HOSTS:
        raise HTTPException(status_code=403, detail="Host not allowed")
    url = build_upstream_image_url(host, path)
    try:
        resp = httpx.get(
            url,
            headers={"Referer": "https://javdb.com"},
            timeout=15,
            follow_redirects=True,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=404)
        return Response(
            content=resp.content,
            media_type=resp.headers.get("content-type", "image/jpeg"),
        )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502) from exc
