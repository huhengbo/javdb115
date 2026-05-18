from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class JavdbMagnet:
    name: str
    url: str
    size_bytes: int | None


@dataclass(frozen=True)
class JavdbWork:
    code: str
    title: str | None
    cover_url: str | None
    release_date: str | None
    source_url: str
    actors: list[str]
    magnets: list[JavdbMagnet]
