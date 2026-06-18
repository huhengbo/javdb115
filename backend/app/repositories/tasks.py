from __future__ import annotations

import json
import sqlite3
from typing import Any, cast

from app.security import iso_now

UNFINISHED_STATUSES = ("submitted", "downloading")
ACTIVE_DUPLICATE_STATUSES = ("submitted", "downloading", "organizing", "completed")
INCOMPLETE_SUBMISSION_STATUS = "pending"
INCOMPLETE_SUBMISSION_STAGE = "created"


class TasksRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def list_all(self, limit: int = 50) -> list[dict[str, Any]]:
        return self._list_tasks("", (), limit)

    def list_by_work_code(self, code: str) -> list[dict[str, Any]]:
        return self._list_tasks("WHERE w.code = ?", (code,), None)

    def get(self, task_id: int) -> dict[str, Any] | None:
        tasks = self._list_tasks("WHERE t.id = ?", (task_id,), 1)
        return tasks[0] if tasks else None

    def list_unfinished(self) -> list[dict[str, Any]]:
        placeholders = ", ".join("?" for _ in UNFINISHED_STATUSES)
        where_sql = f"WHERE t.status IN ({placeholders}) AND t.cloud_task_id IS NOT NULL"
        return self._list_tasks(where_sql, UNFINISHED_STATUSES, None)

    def list_incomplete_submissions(self, cutoff_iso: str) -> list[dict[str, Any]]:
        return self._list_tasks(
            """
            WHERE t.status = ?
              AND t.stage = ?
              AND t.cloud_task_id IS NULL
              AND t.updated_at <= ?
            """,
            (INCOMPLETE_SUBMISSION_STATUS, INCOMPLETE_SUBMISSION_STAGE, cutoff_iso),
            None,
        )

    def find_blocking_duplicate_by_code(self, code: str) -> dict[str, Any] | None:
        placeholders = ", ".join("?" for _ in ACTIVE_DUPLICATE_STATUSES)
        tasks = self._list_tasks(
            f"WHERE w.code = ? AND t.status IN ({placeholders})",
            (code, *ACTIVE_DUPLICATE_STATUSES),
            1,
        )
        return tasks[0] if tasks else None

    def _list_tasks(
        self,
        where_sql: str,
        params: tuple[object, ...],
        limit: int | None,
    ) -> list[dict[str, Any]]:
        limit_sql = "" if limit is None else "LIMIT ?"
        query_params: tuple[object, ...] = params if limit is None else (*params, limit)
        rows = self.connection.execute(
            """
            SELECT t.*, w.code, w.title, w.cover_url, w.release_date, w.source_url,
                   w.actors_json, w.status AS work_status, a.name AS actor_name,
                   a.profile_url AS actor_profile_url, a.external_id AS actor_external_id,
                   a.avatar_url AS actor_avatar_url, a.source AS actor_source,
                   a.enabled AS actor_enabled, a.created_at AS actor_created_at,
                   a.updated_at AS actor_updated_at, m.name AS magnet_name,
                   m.url AS magnet_url, m.size_bytes, m.decision, m.reason, m.score
            FROM tasks t
            LEFT JOIN works w ON w.id = t.work_id
            LEFT JOIN actors a ON a.id = t.actor_id
            LEFT JOIN magnets m ON m.id = t.magnet_id
            """
            + where_sql
            + f"""
            ORDER BY t.created_at DESC {limit_sql}
            """,
            query_params,
        ).fetchall()
        return [self._compose_task(dict(row)) for row in rows]

    def counts(self) -> dict[str, int]:
        rows = self.connection.execute(
            "SELECT status, COUNT(*) AS count FROM tasks GROUP BY status"
        ).fetchall()
        return {str(row["status"]): int(row["count"]) for row in rows}

    def get_raw(self, task_id: int) -> dict[str, Any] | None:
        row = self.connection.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return None if row is None else dict(row)

    def create(self, work_id: int | None, actor_id: int | None, magnet_id: int | None) -> int:
        now = iso_now()
        cursor = self.connection.execute(
            """
            INSERT INTO tasks
              (work_id, actor_id, magnet_id, status, stage, created_at, updated_at)
            VALUES (?, ?, ?, 'pending', 'created', ?, ?)
            """,
            (work_id, actor_id, magnet_id, now, now),
        )
        return cast(int, cursor.lastrowid)

    def update_status(
        self,
        task_id: int,
        status: str,
        stage: str,
        error_message: str | None = None,
        cloud_task_id: str | None = None,
        cloud_file_id: str | None = None,
    ) -> None:
        self.connection.execute(
            """
            UPDATE tasks
            SET status = ?, stage = ?, error_message = ?,
                cloud_task_id = COALESCE(?, cloud_task_id),
                cloud_file_id = COALESCE(?, cloud_file_id),
                updated_at = ?
            WHERE id = ?
            """,
            (status, stage, error_message, cloud_task_id, cloud_file_id, iso_now(), task_id),
        )

    def update_transition(
        self,
        task_id: int,
        status: str,
        stage: str,
        *,
        error_message: str | None = None,
        cloud_task_id: str | None = None,
        cloud_file_id: str | None = None,
        cloud_file_name: str | None = None,
    ) -> None:
        self.connection.execute(
            """
            UPDATE tasks
            SET status = ?, stage = ?, error_message = ?,
                cloud_task_id = COALESCE(?, cloud_task_id),
                cloud_file_id = COALESCE(?, cloud_file_id),
                cloud_file_name = COALESCE(?, cloud_file_name),
                updated_at = ?
            WHERE id = ?
            """,
            (
                status,
                stage,
                error_message,
                cloud_task_id,
                cloud_file_id,
                cloud_file_name,
                iso_now(),
                task_id,
            ),
        )

    def _compose_task(self, row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row["id"],
            "status": row["status"],
            "stage": row["stage"],
            "error_message": row["error_message"],
            "cloud_task_id": row["cloud_task_id"],
            "cloud_file_id": row["cloud_file_id"],
            "cloud_file_name": row.get("cloud_file_name"),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "work": self._compose_work(row),
            "actor": self._compose_actor(row),
            "magnet": self._compose_magnet(row),
        }

    def _compose_work(self, row: dict[str, Any]) -> dict[str, Any] | None:
        if row.get("code") is None:
            return None
        return {
            "id": row["work_id"],
            "code": row["code"],
            "title": row["title"],
            "cover_url": row["cover_url"],
            "release_date": row["release_date"],
            "source_url": row["source_url"],
            "actors": json.loads(str(row["actors_json"] or "[]")),
            "status": row["work_status"],
        }

    def _compose_actor(self, row: dict[str, Any]) -> dict[str, Any] | None:
        if row.get("actor_name") is None:
            return None
        return {
            "id": row["actor_id"],
            "name": row["actor_name"],
            "profile_url": row["actor_profile_url"],
            "external_id": row["actor_external_id"],
            "avatar_url": row["actor_avatar_url"],
            "source": row["actor_source"],
            "enabled": bool(row["actor_enabled"]),
            "created_at": row["actor_created_at"],
            "updated_at": row["actor_updated_at"],
        }

    def _compose_magnet(self, row: dict[str, Any]) -> dict[str, Any] | None:
        if row.get("magnet_name") is None:
            return None
        return {
            "id": row["magnet_id"],
            "name": row["magnet_name"],
            "url": row["magnet_url"],
            "size_bytes": row["size_bytes"],
            "decision": row["decision"],
            "reason": row["reason"],
            "score": row["score"],
        }
