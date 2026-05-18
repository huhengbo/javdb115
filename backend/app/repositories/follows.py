from __future__ import annotations

import json
import sqlite3
from typing import Any, cast

from app.security import iso_now


class FollowsRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def list_all(self) -> list[dict[str, object]]:
        rows = self.connection.execute("SELECT * FROM follows ORDER BY created_at DESC").fetchall()
        return [self._compose(dict(row)) for row in rows]

    def list_enabled(self) -> list[dict[str, object]]:
        rows = self.connection.execute(
            "SELECT * FROM follows WHERE enabled = 1 ORDER BY created_at DESC"
        ).fetchall()
        return [self._compose(dict(row)) for row in rows]

    def get(self, follow_id: int) -> dict[str, object] | None:
        row = self.connection.execute("SELECT * FROM follows WHERE id = ?", (follow_id,)).fetchone()
        return None if row is None else self._compose(dict(row))

    def find_by_actor_external_id(self, actor_external_id: str) -> dict[str, object] | None:
        row = self.connection.execute(
            "SELECT * FROM follows WHERE actor_external_id = ?",
            (actor_external_id,),
        ).fetchone()
        return None if row is None else self._compose(dict(row))

    def save(
        self,
        actor_external_id: str,
        actor_name: str,
        actor_profile_url: str,
        actor_avatar_url: str | None,
        selected_tag_ids: list[str],
        selected_tag_names: list[str],
        ftype: str = "actor",
    ) -> dict[str, object]:
        existing = self.find_by_actor_external_id(actor_external_id)
        if existing is None:
            return self._create(
                actor_external_id,
                actor_name,
                actor_profile_url,
                actor_avatar_url,
                selected_tag_ids,
                selected_tag_names,
                ftype,
            )
        return self._update_existing(
            int(cast(int, existing["id"])),
            actor_name,
            actor_profile_url,
            actor_avatar_url,
            selected_tag_ids,
            selected_tag_names,
        )

    def update(
        self,
        follow_id: int,
        enabled: bool | None,
        selected_tag_ids: list[str] | None,
        selected_tag_names: list[str] | None,
    ) -> dict[str, object] | None:
        current = self.get(follow_id)
        if current is None:
            return None
        next_enabled = int(enabled) if enabled is not None else int(bool(current["enabled"]))
        current_tag_ids = cast(list[str], current["selected_tag_ids"])
        current_tag_names = cast(list[str], current["selected_tag_names"])
        next_tag_ids = selected_tag_ids if selected_tag_ids is not None else current_tag_ids
        next_tag_names = (
            selected_tag_names
            if selected_tag_names is not None
            else current_tag_names
        )
        self.connection.execute(
            """
            UPDATE follows
            SET enabled = ?, selected_tag_ids_json = ?, selected_tag_names_json = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (
                next_enabled,
                json.dumps(next_tag_ids, ensure_ascii=False),
                json.dumps(next_tag_names, ensure_ascii=False),
                iso_now(),
                follow_id,
            ),
        )
        return self.get(follow_id)

    def update_latest(self, follow_id: int, count: int) -> None:
        self.connection.execute(
            "UPDATE follows SET latest_count = ?, updated_at = ? WHERE id = ?",
            (count, iso_now(), follow_id),
        )

    def list_seen_movie_ids(self, follow_id: int) -> set[str]:
        rows = self.connection.execute(
            "SELECT movie_id FROM follow_seen_movies WHERE follow_id = ?",
            (follow_id,),
        ).fetchall()
        return {str(row["movie_id"]) for row in rows}

    def add_seen_movies(self, follow_id: int, movie_ids: list[str]) -> None:
        now = iso_now()
        self.connection.executemany(
            """
            INSERT OR IGNORE INTO follow_seen_movies (follow_id, movie_id, seen_at)
            VALUES (?, ?, ?)
            """,
            [(follow_id, movie_id, now) for movie_id in movie_ids],
        )

    def reset_seen_movies(self, follow_id: int) -> None:
        self.connection.execute("DELETE FROM follow_seen_movies WHERE follow_id = ?", (follow_id,))

    def delete(self, follow_id: int) -> None:
        self.connection.execute("DELETE FROM follows WHERE id = ?", (follow_id,))

    def _create(
        self,
        actor_external_id: str,
        actor_name: str,
        actor_profile_url: str,
        actor_avatar_url: str | None,
        selected_tag_ids: list[str],
        selected_tag_names: list[str],
        ftype: str,
    ) -> dict[str, object]:
        now = iso_now()
        cursor = self.connection.execute(
            """
            INSERT INTO follows (
              filter_by, label, type, cover_url, actor_external_id, actor_name,
              actor_profile_url, actor_avatar_url, selected_tag_ids_json,
              selected_tag_names_json, enabled, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                self._legacy_filter_value(actor_external_id),
                actor_name,
                ftype,
                actor_avatar_url,
                actor_external_id,
                actor_name,
                actor_profile_url,
                actor_avatar_url,
                json.dumps(selected_tag_ids, ensure_ascii=False),
                json.dumps(selected_tag_names, ensure_ascii=False),
                now,
                now,
            ),
        )
        return self.get(cast(int, cursor.lastrowid)) or {}

    def _update_existing(
        self,
        follow_id: int,
        actor_name: str,
        actor_profile_url: str,
        actor_avatar_url: str | None,
        selected_tag_ids: list[str],
        selected_tag_names: list[str],
    ) -> dict[str, object]:
        self.connection.execute(
            """
            UPDATE follows
            SET label = ?, cover_url = ?, actor_name = ?, actor_profile_url = ?,
                actor_avatar_url = ?, selected_tag_ids_json = ?, selected_tag_names_json = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (
                actor_name,
                actor_avatar_url,
                actor_name,
                actor_profile_url,
                actor_avatar_url,
                json.dumps(selected_tag_ids, ensure_ascii=False),
                json.dumps(selected_tag_names, ensure_ascii=False),
                iso_now(),
                follow_id,
            ),
        )
        return self.get(follow_id) or {}

    def _compose(self, row: dict[str, Any]) -> dict[str, object]:
        return {
            "id": row["id"],
            "actor_external_id": row.get("actor_external_id") or "",
            "actor_name": row.get("actor_name") or row.get("label") or "",
            "actor_profile_url": row.get("actor_profile_url") or "",
            "actor_avatar_url": row.get("actor_avatar_url") or row.get("cover_url"),
            "selected_tag_ids": self._parse_json_list(row.get("selected_tag_ids_json")),
            "selected_tag_names": self._parse_json_list(row.get("selected_tag_names_json")),
            "type": row["type"],
            "latest_count": int(row.get("latest_count") or 0),
            "enabled": bool(row["enabled"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def _parse_json_list(self, raw: Any) -> list[str]:
        if raw in (None, ""):
            return []
        try:
            value = json.loads(str(raw))
        except json.JSONDecodeError:
            return []
        return [self._normalize_tag_id(str(item)) for item in value if str(item)]

    def _legacy_filter_value(self, actor_external_id: str) -> str:
        return f"actor:{actor_external_id}"

    def _normalize_tag_id(self, tag_id: str) -> str:
        legacy_map = {
            "type:0": "0",
            "type:1": "1",
            "28": "s",
            "d": "m",
        }
        return legacy_map.get(tag_id, tag_id)
