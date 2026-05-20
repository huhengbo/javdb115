from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException
from starlette.responses import Response

from app.media_urls import ALLOWED_IMAGE_HOSTS, build_upstream_image_url

router = APIRouter(prefix="/api/img", tags=["img"])


@router.get("/{host}/{path:path}")
def proxy_image(host: str, path: str) -> Response:
    if host not in ALLOWED_IMAGE_HOSTS:
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
