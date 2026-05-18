from __future__ import annotations

import json
import sqlite3
from typing import Any

from app.security import iso_now


class LogsRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def add(
        self,
        level: str,
        stage: str,
        message: str,
        task_id: int | None = None,
        context: dict[str, Any] | None = None,
    ) -> None:
        self.connection.execute(
            """
            INSERT INTO logs (task_id, level, stage, message, context_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (task_id, level, stage, message, json.dumps(context or {}), iso_now()),
        )

    def list(self, limit: int = 100) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM logs ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [self._compose(dict(row)) for row in rows]

    def commit(self) -> None:
        self.connection.commit()

    def _compose(self, row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row["id"],
            "task_id": row["task_id"],
            "level": row["level"],
            "stage": row["stage"],
            "message": row["message"],
            "context": json.loads(str(row["context_json"] or "{}")),
            "created_at": row["created_at"],
        }
