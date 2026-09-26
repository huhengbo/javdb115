from __future__ import annotations

import json
import sqlite3
from typing import Any, cast

from app.security import iso_now

UNFINISHED_STATUSES = ("submitted", "downloading")
ACTIVE_DUPLICATE_STATUSES = ("pending", "submitted", "downloading", "organizing", "completed")
INCOMPLETE_SUBMISSION_STATUS = "pending"
INCOMPLETE_SUBMISSION_STAGE = "created"
ORGANIZING_STATUS = "organizing"
ORGANIZING_STAGE = "115_organizing"
TASK_FILTER_VALUES = (
    "all",
    "attention",
    "submitted",
    "downloading",
    "organizing",
    "completed",
    "submit_failed",
    "download_failed",
    "organize_failed",
    "incomplete_submit",
)
_ERROR_TEXT_SQL = "LOWER(COALESCE(t.error_message, ''))"
_MISSING_VIDEO_SQL = (
    f"({_ERROR_TEXT_SQL} LIKE '%no video%' OR {_ERROR_TEXT_SQL} LIKE '%视频%')"
)
_DIRECTORY_ERROR_SQL = (
    f"({_ERROR_TEXT_SQL} LIKE '%folder%' OR {_ERROR_TEXT_SQL} LIKE '%directory%' "
    f"OR {_ERROR_TEXT_SQL} LIKE '%目录%')"
)
_CLASSIFIED_FAILED_SQL = (
    "(t.status = 'failed' AND t.stage NOT IN "
    "('115_submit_incomplete', 'follow_check_failed', 'javdb_movie_failed'))"
)


def task_filter_sql(task_filter: str) -> str:
    if task_filter == "all":
        return "1 = 1"
    if task_filter == "attention":
        return "t.status IN ('failed', 'organizing')"
    if task_filter in {"submitted", "downloading", "organizing", "completed"}:
        return f"t.status = '{task_filter}'"
    if task_filter == "submit_failed":
        return (
            f"{_CLASSIFIED_FAILED_SQL} AND NOT {_MISSING_VIDEO_SQL} "
            f"AND NOT {_DIRECTORY_ERROR_SQL} AND t.stage = '115_submit_failed'"
        )
    if task_filter == "download_failed":
        return (
            f"{_CLASSIFIED_FAILED_SQL} AND NOT {_MISSING_VIDEO_SQL} "
            f"AND NOT {_DIRECTORY_ERROR_SQL} "
            "AND t.stage IN ('115_download_failed', '115_task_missing')"
        )
    if task_filter == "organize_failed":
        return (
            f"{_CLASSIFIED_FAILED_SQL} AND "
            f"({_MISSING_VIDEO_SQL} OR {_DIRECTORY_ERROR_SQL} "
            "OR t.stage = '115_organize_failed')"
        )
    if task_filter == "incomplete_submit":
        return "t.stage = '115_submit_incomplete'"
    raise ValueError(f"Unknown task filter: {task_filter}")


class TasksRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def list_all(self, limit: int = 50) -> list[dict[str, Any]]:
        return self._list_tasks("", (), limit)

    def list_page(
        self,
        task_filter: str,
        limit: int = 24,
        before_id: int | None = None,
    ) -> dict[str, Any]:
        where_parts = [task_filter_sql(task_filter)]
        params: list[object] = []
        if before_id is not None:
            where_parts.append("t.id < ?")
            params.append(before_id)

        page = self._list_tasks(
            "WHERE " + " AND ".join(where_parts),
            tuple(params),
            limit + 1,
        )
        has_more = len(page) > limit
        items = page[:limit]
        counts = self.filter_counts()
        return {
            "items": items,
            "has_more": has_more,
            "next_cursor": int(items[-1]["id"]) if has_more and items else None,
            "total": counts[task_filter],
            "counts": counts,
        }

    def list_by_work_code(self, code: str) -> list[dict[str, Any]]:
        return self._list_tasks("WHERE w.code = ?", (code,), None)

    def get(self, task_id: int) -> dict[str, Any] | None:
        tasks = self._list_tasks("WHERE t.id = ?", (task_id,), 1)
        return tasks[0] if tasks else None

    def list_unfinished(self) -> list[dict[str, Any]]:
        placeholders = ", ".join("?" for _ in UNFINISHED_STATUSES)
        where_sql = f"WHERE t.status IN ({placeholders}) AND t.cloud_task_id IS NOT NULL"
        return self._list_tasks(where_sql, UNFINISHED_STATUSES, None)

    def list_queued_submissions(self, limit: int = 1) -> list[dict[str, Any]]:
        return self._list_tasks(
            """
            WHERE t.status = 'pending'
              AND t.stage = 'manual_115_queued'
              AND t.cloud_task_id IS NULL
            """,
            (),
            limit,
        )

    def list_incomplete_submissions(self, cutoff_iso: str) -> list[dict[str, Any]]:
        return self._list_tasks(
            """
            WHERE t.status = ?
              AND t.stage IN (?, 'manual_115_queued', 'manual_115_submitting')
              AND t.cloud_task_id IS NULL
              AND t.updated_at <= ?
            """,
            (INCOMPLETE_SUBMISSION_STATUS, INCOMPLETE_SUBMISSION_STAGE, cutoff_iso),
            None,
        )

    def list_stale_organizing(self, cutoff_iso: str) -> list[dict[str, Any]]:
        return self._list_tasks(
            """
            WHERE t.status = ?
              AND t.stage = ?
              AND t.cloud_task_id IS NOT NULL
              AND t.updated_at <= ?
            """,
            (ORGANIZING_STATUS, ORGANIZING_STAGE, cutoff_iso),
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
            ORDER BY t.id DESC {limit_sql}
            """,
            query_params,
        ).fetchall()
        return [self._compose_task(dict(row)) for row in rows]

    def counts(self) -> dict[str, int]:
        rows = self.connection.execute(
            "SELECT status, COUNT(*) AS count FROM tasks GROUP BY status"
        ).fetchall()
        return {str(row["status"]): int(row["count"]) for row in rows}

    def filter_counts(self) -> dict[str, int]:
        select_sql = ", ".join(
            f'SUM(CASE WHEN {task_filter_sql(value)} THEN 1 ELSE 0 END) AS "{value}"'
            for value in TASK_FILTER_VALUES
        )
        row = self.connection.execute(f"SELECT {select_sql} FROM tasks t").fetchone()
        return {value: int(row[value] or 0) for value in TASK_FILTER_VALUES}

    def stage_counts(self) -> dict[str, int]:
        rows = self.connection.execute(
            "SELECT stage, COUNT(*) AS count FROM tasks GROUP BY stage"
        ).fetchall()
        return {str(row["stage"]): int(row["count"]) for row in rows}

    def attention_count(self) -> int:
        row = self.connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM tasks
            WHERE status IN ('failed', 'organizing')
            """
        ).fetchone()
        return int(row["count"])

    def list_attention(self, limit: int = 6) -> list[dict[str, Any]]:
        return self._list_tasks(
            "WHERE t.status IN ('failed', 'organizing')",
            (),
            limit,
        )

    def get_raw(self, task_id: int) -> dict[str, Any] | None:
        row = self.connection.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return None if row is None else dict(row)

    def delete(self, task_id: int) -> bool:
        cursor = self.connection.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        return cursor.rowcount > 0

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
