from __future__ import annotations

import sqlite3

from app.security import iso_now

SECRET_KEYS = {"telegram_bot_token"}
OBSOLETE_KEYS = {"javdb_base_url", "javdb_cookie"}


class SettingsRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def list_all(self) -> list[dict[str, object]]:
        rows = self.connection.execute(
            "SELECT key, value, is_secret, updated_at FROM settings ORDER BY key"
        ).fetchall()
        return [dict(row) for row in rows]

    def delete_obsolete(self) -> None:
        self.connection.execute(
            "DELETE FROM settings WHERE key IN (?, ?)",
            tuple(sorted(OBSOLETE_KEYS)),
        )

    def get(self, key: str) -> str | None:
        row = self.connection.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return None if row is None else str(row["value"])

    def require(self, key: str) -> str:
        value = self.get(key)
        if value:
            return value
        raise ValueError(f"Missing required setting: {key}")

    def upsert(self, key: str, value: str, is_secret: bool | None = None) -> None:
        secret_flag = int(is_secret if is_secret is not None else key in SECRET_KEYS)
        self.connection.execute(
            """
            INSERT INTO settings (key, value, is_secret, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              is_secret = excluded.is_secret,
              updated_at = excluded.updated_at
            """,
            (key, value, secret_flag, iso_now()),
        )

    def upsert_many(self, items: list[tuple[str, str, bool]]) -> None:
        for key, value, is_secret in items:
            self.upsert(key, value, is_secret)
