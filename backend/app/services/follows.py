from __future__ import annotations

from typing import Any

from app.adapters.javdb_api import JavdbApiClient
from app.errors import ValidationAppError
from app.repositories.follows import FollowsRepository
from app.services.actor_movie_scan import collect_actor_movies


class FollowsService:
    def __init__(self, repository: FollowsRepository, api: JavdbApiClient) -> None:
        self.repository = repository
        self.api = api

    def check_all(self) -> list[dict[str, Any]]:
        return [self.check_one(follow) for follow in self.repository.list_enabled_actors()]

    def check_one(self, follow: dict[str, Any]) -> dict[str, Any]:
        if follow["type"] != "actor":
            raise ValidationAppError("Only actor follows can be checked")
        follow_id = int(follow["id"])
        actor_external_id = str(follow["actor_external_id"])
        selected_tag_ids = [str(tag_id) for tag_id in follow["selected_tag_ids"]]
        movies = collect_actor_movies(
            self.api,
            actor_external_id,
            selected_tag_ids,
        )
        new_movies = self._new_movies(follow, movies)
        self.repository.add_seen_movies(follow_id, self._movie_ids(movies))
        self.repository.mark_checked(follow_id, len(new_movies))
        return {
            "follow_id": follow_id,
            "actor_external_id": actor_external_id,
            "actor_name": follow["actor_name"],
            "selected_tag_ids": selected_tag_ids,
            "selected_tag_names": follow["selected_tag_names"],
            "new_count": len(new_movies),
            "movies": new_movies,
        }

    def baseline(self, follow: dict[str, Any]) -> None:
        follow_id = int(follow["id"])
        movies = collect_actor_movies(
            self.api,
            str(follow["actor_external_id"]),
            [str(tag_id) for tag_id in follow["selected_tag_ids"]],
        )
        self.repository.reset_seen_movies(follow_id)
        self.repository.add_seen_movies(follow_id, self._movie_ids(movies))
        self.repository.mark_checked(follow_id, 0)

    def _new_movies(
        self,
        follow: dict[str, Any],
        movies: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        follow_id = int(follow["id"])
        seen = self.repository.list_seen_movie_ids(follow_id)
        if not seen and not follow.get("last_checked_at"):
            return []
        return [movie for movie in movies if str(movie["id"]) not in seen]

    def _movie_ids(self, movies: list[dict[str, Any]]) -> list[str]:
        return [str(movie["id"]) for movie in movies]
