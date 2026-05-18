from __future__ import annotations

import json
import sqlite3
from typing import cast

from app.javdb_models import JavdbMagnet, JavdbWork
from app.security import iso_now


class CatalogRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def get_work_by_code(self, code: str) -> dict[str, object] | None:
        row = self.connection.execute("SELECT * FROM works WHERE code = ?", (code,)).fetchone()
        return None if row is None else dict(row)

    def upsert_work(self, work: JavdbWork, status: str) -> int:
        now = iso_now()
        self.connection.execute(
            """
            INSERT INTO works
              (code, title, cover_url, release_date, source_url,
               actors_json, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(code) DO UPDATE SET
              title = excluded.title,
              cover_url = excluded.cover_url,
              release_date = excluded.release_date,
              source_url = excluded.source_url,
              actors_json = excluded.actors_json,
              status = excluded.status,
              updated_at = excluded.updated_at
            """,
            (
                work.code,
                work.title,
                work.cover_url,
                work.release_date,
                work.source_url,
                json.dumps(work.actors, ensure_ascii=False),
                status,
                now,
                now,
            ),
        )
        saved = self.get_work_by_code(work.code)
        return int(cast(int, saved["id"])) if saved else 0

    def add_magnet(
        self,
        work_id: int,
        magnet: JavdbMagnet,
        decision: str,
        reason: str,
        score: int,
    ) -> int:
        cursor = self.connection.execute(
            """
            INSERT INTO magnets
              (work_id, name, url, size_bytes, decision, reason, score, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                work_id,
                magnet.name,
                magnet.url,
                magnet.size_bytes,
                decision,
                reason,
                score,
                iso_now(),
            ),
        )
        return cast(int, cursor.lastrowid)

    def mark_work_status(self, work_id: int, status: str) -> None:
        self.connection.execute(
            "UPDATE works SET status = ?, updated_at = ? WHERE id = ?",
            (status, iso_now(), work_id),
        )
