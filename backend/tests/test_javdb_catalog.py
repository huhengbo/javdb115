from __future__ import annotations

import json
from typing import Any, cast

from app.adapters.javdb import JavdbApiClient


class CatalogTransport:
    def __init__(self) -> None:
        self.gets: list[tuple[str, str]] = []
        self.posts: list[tuple[str, dict[str, str]]] = []
        self.files: list[tuple[str, dict[str, tuple[str, bytes]]]] = []

    def javdb_api_get(self, path: str, query: str, sig: str) -> str:
        del sig
        self.gets.append((path, query))
        if path == "/api/v1/actors":
            return json.dumps({"data": {"actors": [{"id": "Av2e", "name": "Actor"}]}})
        if path == "/api/v1/makers":
            return json.dumps({"data": {"makers": [{"id": "8ZJ9", "name": "Maker"}]}})
        if path == "/api/v1/series":
            return json.dumps({"data": {"series": [{"id": "P899", "name": "Series"}]}})
        if path == "/api/v1/search_magnet":
            return json.dumps({"data": {"magnets": [{"hash": "abc", "title": "HEZ-916"}]}})
        if path == "/api/v1/lists/related":
            return json.dumps({"data": {"lists": [{"id": "list-1", "name": "related"}]}})
        if path == "/api/v2/tags":
            return json.dumps({"data": {"tags": [{"category_id": "main", "tags": [{"id": "p"}]}]}})
        if path == "/api/v2/search":
            return json.dumps({"data": {"actors": [{"id": "Av2e", "name": "Yua"}]}})
        if path == "/api/v1/movies/may_also_like":
            return json.dumps({"success": 1, "data": {"movies": [{"id": "rel-1"}]}})
        return json.dumps({"success": 1, "data": {}})

    def javdb_api_post(self, path: str, query: str, sig: str, fields: dict[str, str]) -> str:
        del query, sig
        self.posts.append((path, fields))
        return json.dumps({"success": 1, "data": {}})

    def javdb_api_post_files(
        self,
        path: str,
        query: str,
        sig: str,
        files: dict[str, tuple[str, bytes]],
    ) -> str:
        del query, sig
        self.files.append((path, files))
        return json.dumps({"success": 1, "data": {"type": "actor", "actors": [{"id": "Av2e"}]}})


def test_catalog_methods_use_documented_paths() -> None:
    transport = CatalogTransport()
    client = JavdbApiClient(cast(Any, transport))

    assert client.actors("0", page=2) == [{"id": "Av2e", "name": "Actor"}]
    assert client.makers("1")[0]["id"] == "8ZJ9"
    assert client.series_list("0")[0]["id"] == "P899"
    assert client.search_magnet("HEZ-916") == [{"hash": "abc", "title": "HEZ-916"}]
    assert client.lists_related("movie-1") == [{"id": "list-1", "name": "related"}]
    assert client.catalog_tags("0")[0]["category_id"] == "main"
    assert client.search("yua", result_type="actor") == [{"id": "Av2e", "name": "Yua"}]
    image = client.search_image(b"\xff\xd8\xff")
    assert image["type"] == "actor"

    paths = [path for path, _query in transport.gets]
    assert paths[0] == "/api/v1/actors"
    assert "type=0" in transport.gets[0][1]
    assert "page=2" in transport.gets[0][1]
    assert transport.gets[3][0] == "/api/v1/search_magnet"
    assert "q=HEZ-916" in transport.gets[3][1]
    assert transport.gets[4][0] == "/api/v1/lists/related"
    assert "movie_id=movie-1" in transport.gets[4][1]
    assert transport.files[0][0] == "/api/v2/search_image"
    assert "image" in transport.files[0][1]


def test_authed_may_also_like_and_review_actions() -> None:
    transport = CatalogTransport()
    client = JavdbApiClient(cast(Any, transport), authorization="jwt")

    assert client.authed.may_also_like("movie-1") == [{"id": "rel-1"}]
    client.authed.like_review("movie-1", "9")
    client.authed.log_movie_played("movie-1")

    assert transport.gets[-1][0] == "/api/v1/movies/may_also_like"
    assert "movie_id=movie-1" in transport.gets[-1][1]
    assert transport.posts[0][0] == "/api/v1/movies/movie-1/reviews/9/like"
    assert transport.posts[1] == ("/api/v1/logs/movie_played", {"movie_id": "movie-1"})
