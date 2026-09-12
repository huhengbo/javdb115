from app.adapters.javdb.media import (
    ALLOWED_IMAGE_HOSTS,
    build_upstream_image_url,
    decode_image_payload,
    resolve_image_url,
)

external_image_url = resolve_image_url

__all__ = [
    "ALLOWED_IMAGE_HOSTS",
    "build_upstream_image_url",
    "decode_image_payload",
    "external_image_url",
    "resolve_image_url",
]
