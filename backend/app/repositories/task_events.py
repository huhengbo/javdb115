from __future__ import annotations

import json
import sqlite3
from typing import Any

from app.security import iso_now


class TaskEventsRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def add(
        self,
        task_id: int,
        *,
        from_status: str | None,
        to_status: str,
        from_stage: str | None,
        to_stage: str,
        message: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> None:
        self.connection.execute(
            """
            INSERT INTO task_events
              (task_id, from_status, to_status, from_stage, to_stage,
               message, context_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task_id,
                from_status,
                to_status,
                from_stage,
                to_stage,
                message,
                json.dumps(context or {}, ensure_ascii=False),
                iso_now(),
            ),
        )

    def list_for_tasks(self, task_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
        if not task_ids:
            return {}
        placeholders = ", ".join("?" for _ in task_ids)
        rows = self.connection.execute(
            f"""
            SELECT * FROM task_events
            WHERE task_id IN ({placeholders})
            ORDER BY created_at ASC, id ASC
            """,
            tuple(task_ids),
        ).fetchall()
        events: dict[int, list[dict[str, Any]]] = {}
        for row in rows:
            event = self._compose(dict(row))
            events.setdefault(int(event["task_id"]), []).append(event)
        return events

    def _compose(self, row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row["id"],
            "task_id": row["task_id"],
            "from_status": row["from_status"],
            "to_status": row["to_status"],
            "from_stage": row["from_stage"],
            "to_stage": row["to_stage"],
            "message": row["message"],
            "context": json.loads(str(row["context_json"] or "{}")),
            "created_at": row["created_at"],
        }
