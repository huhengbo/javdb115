from __future__ import annotations

import sqlite3
from typing import cast

from app.contracts import ActorCreate
from app.security import iso_now


class ActorsRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def get(self, actor_id: int) -> dict[str, object] | None:
        row = self.connection.execute("SELECT * FROM actors WHERE id = ?", (actor_id,)).fetchone()
        return None if row is None else dict(row)

    def create(self, payload: ActorCreate) -> dict[str, object]:
        now = iso_now()
        cursor = self.connection.execute(
            """
            INSERT INTO actors
              (
                name, profile_url, external_id, avatar_url, source,
                enabled, created_at, updated_at
              )
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                payload.name,
                payload.profile_url,
                payload.external_id,
                payload.avatar_url,
                payload.source,
                now,
                now,
            ),
        )
        actor_id = cast(int, cursor.lastrowid)
        return self.get(actor_id) or {}

    def find_by_external_id(self, external_id: str) -> dict[str, object] | None:
        row = self.connection.execute(
            "SELECT * FROM actors WHERE external_id = ?",
            (external_id,),
        ).fetchone()
        return None if row is None else dict(row)

    def update_name_and_avatar(self, actor_id: int, name: str, avatar_url: str | None) -> None:
        self.connection.execute(
            "UPDATE actors SET name = ?, avatar_url = ?, updated_at = ? WHERE id = ?",
            (name, avatar_url, iso_now(), actor_id),
        )
