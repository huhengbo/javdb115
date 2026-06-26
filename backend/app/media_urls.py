from __future__ import annotations

from urllib.parse import urlparse

TP_MEDIA_HOSTS = frozenset({"tp.cmastd.com", "tp.spfcas.com"})
JDBSTATIC_HOST = "c0.jdbstatic.com"
ALLOWED_IMAGE_HOSTS = {*TP_MEDIA_HOSTS, JDBSTATIC_HOST, "javdb.com"}
TP_TOKENIZED_DIRECTORIES = frozenset({"avatars", "covers", "samples", "small_covers"})
SMALL_COVER_DIRECTORY = "small_covers"
COVER_DIRECTORY = "covers"


def build_upstream_image_url(host: str, path: str) -> str:
    normalized_host = host
    path_parts = path.lstrip("/").split("/")
    if host in TP_MEDIA_HOSTS:
        if len(path_parts) >= 2 and path_parts[1] in TP_TOKENIZED_DIRECTORIES:
            path_parts = path_parts[1:]
        if path_parts and path_parts[0] == SMALL_COVER_DIRECTORY:
            path_parts[0] = COVER_DIRECTORY
        normalized_host = JDBSTATIC_HOST
    normalized_path = "/".join(path_parts)
    return f"https://{normalized_host}/{normalized_path}"


def external_image_url(url: str | None) -> str | None:
    if not url:
        return url
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    if parsed.scheme not in {"http", "https"} or host not in ALLOWED_IMAGE_HOSTS:
        return url
    return build_upstream_image_url(host, parsed.path)
