from __future__ import annotations

import sqlite3

from app.security import iso_now


class SessionsRepository:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def create(self, token_hash: str, expires_at: str) -> None:
        self.connection.execute(
            "INSERT INTO sessions (token_hash, expires_at, created_at) VALUES (?, ?, ?)",
            (token_hash, expires_at, iso_now()),
        )

    def get_expiry(self, token_hash: str) -> str | None:
        row = self.connection.execute(
            "SELECT expires_at FROM sessions WHERE token_hash = ?",
            (token_hash,),
        ).fetchone()
        return None if row is None else str(row["expires_at"])

    def delete(self, token_hash: str) -> None:
        self.connection.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))

    def purge_expired(self, now_iso: str) -> None:
        self.connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (now_iso,))
