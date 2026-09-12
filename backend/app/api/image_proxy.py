from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException
from starlette.responses import Response

from app.media_urls import ALLOWED_IMAGE_HOSTS, build_upstream_image_url, decode_image_payload

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
        content = decode_image_payload(resp.content)
        if content is None:
            raise HTTPException(status_code=404)
        return Response(content=content, media_type=_image_media_type(content))
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502) from exc


def _image_media_type(content: bytes) -> str:
    if content[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if content[:6] in {b"GIF87a", b"GIF89a"}:
        return "image/gif"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"
