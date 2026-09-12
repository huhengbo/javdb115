from __future__ import annotations

import json
from typing import Any, cast

import pytest

from app.adapters.javdb import JavdbApiClient
from app.errors import IntegrationError


class AuthedTransport:
    def __init__(self, payload: dict[str, Any] | None = None) -> None:
        self.gets: list[tuple[str, str]] = []
        self.posts: list[tuple[str, dict[str, str]]] = []
        self.payload = payload or {
            "success": 1,
            "data": {
                "user": {"id": 1, "username": "huhu1992"},
                "movies": [{"id": "movie-1"}],
                "actors": [{"id": "actor-1"}],
                "makers": [{"id": "maker-1"}],
                "series": [{"id": "series-1"}],
                "directors": [],
                "codes": [{"id": "code-1"}],
                "lists": [{"id": "list-1", "name": "default"}],
                "accounts": [{"id": "acc-1"}],
                "chain_types": ["TRC20"],
                "following_tags": [{"id": "tag-1"}],
            },
        }

    def javdb_api_get(self, path: str, query: str, sig: str) -> str:
        del sig
        self.gets.append((path, query))
        return json.dumps(self.payload)

    def javdb_api_post(self, path: str, query: str, sig: str, fields: dict[str, str]) -> str:
        del query, sig
        self.posts.append((path, fields))
        return json.dumps(self.payload)


def test_authed_library_and_collection_paths() -> None:
    transport = AuthedTransport()
    client = JavdbApiClient(cast(Any, transport), authorization="jwt-token")

    assert client.authed.recent_viewed(page=2, limit=10) == [{"id": "movie-1"}]
    assert client.authed.want_watch_movies()[0]["id"] == "movie-1"
    assert client.authed.collected_actors() == [{"id": "actor-1"}]
    assert client.authed.lists_simple() == [{"id": "list-1", "name": "default"}]
    assert client.authed.wallet_usdt_chain_types() == ["TRC20"]

    paths = [path for path, _query in transport.gets]
    assert paths[0] == "/api/v1/users/recent_viewed"
    assert "page=2&limit=10" in transport.gets[0][1]
    assert paths[1] == "/api/v2/users/review_movies"
    assert "status=want_watch" in transport.gets[1][1]
    assert paths[2] == "/api/v1/users/collected_actors"
    assert paths[3] == "/api/v1/lists/simple"
    assert paths[4] == "/api/v1/wallets/usdt_chain_types"


def test_authed_mutations_post_apk_form_fields() -> None:
    transport = AuthedTransport()
    client = JavdbApiClient(cast(Any, transport), authorization="jwt-token")

    client.authed.collect_actor("actor-1")
    client.authed.uncollect_maker("maker-1")
    client.authed.add_list_movie("list-1", "movie-1")
    client.authed.set_movie_watch_status("movie-1", "want_watch")

    assert transport.posts[0] == (
        "/api/v1/actors/actor-1/collect_actions",
        {"name": "collect"},
    )
    assert transport.posts[1] == (
        "/api/v1/makers/maker-1/collect_actions",
        {"name": "uncollect"},
    )
    assert transport.posts[2] == (
        "/api/v1/lists/list-1/movie_actions",
        {"movie_id": "movie-1", "name": "add"},
    )
    assert transport.posts[3] == (
        "/api/v1/movies/movie-1/reviews",
        {"status": "want_watch", "score": "0", "content": ""},
    )


def test_authed_movie_play_sends_source_id() -> None:
    transport = AuthedTransport()
    client = JavdbApiClient(cast(Any, transport), authorization="jwt-token")

    client.authed.movie_play("movie-1", "4", from_rankings=True)

    path, query = transport.gets[0]
    assert path == "/api/v1/movies/movie-1/play"
    assert "source_id=4" in query
    assert "from_rankings=true" in query
    assert "operation=play" in query


def test_authed_methods_raise_when_login_required() -> None:
    transport = AuthedTransport(
        {
            "success": 0,
            "action": "JWTVerificationError",
            "message": "請登錄帳號",
            "data": None,
        }
    )
    client = JavdbApiClient(cast(Any, transport))

    with pytest.raises(IntegrationError, match="請登錄帳號"):
        client.authed.recent_viewed()
