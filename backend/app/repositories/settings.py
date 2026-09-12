from __future__ import annotations

import os
import sqlite3

from app.secret_store import decrypt_secret, encrypt_secret, is_encrypted_secret
from app.security import iso_now

SECRET_KEYS = frozenset({"p115_cookie", "telegram_bot_token", "javdb_token"})
OBSOLETE_KEYS = {"javdb_base_url", "javdb_cookie"}


def is_secret_key(key: str) -> bool:
    return key in SECRET_KEYS


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

    def encrypt_plaintext_secrets(self) -> None:
        secret_key = self._secret_key()
        if not secret_key:
            return
        placeholders = ", ".join("?" for _ in SECRET_KEYS)
        rows = self.connection.execute(
            f"SELECT key, value FROM settings WHERE key IN ({placeholders})",
            tuple(sorted(SECRET_KEYS)),
        ).fetchall()
        for row in rows:
            key = str(row["key"])
            value = str(row["value"])
            if value and not is_encrypted_secret(value):
                self._write(key, encrypt_secret(value, secret_key), True)

    def get(self, key: str) -> str | None:
        row = self.connection.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        if row is None:
            return None
        value = str(row["value"])
        if not is_secret_key(key) or not is_encrypted_secret(value):
            return value
        secret_key = self._secret_key()
        if not secret_key:
            raise RuntimeError(
                "APP_SECRET_KEY is required to decrypt protected settings"
            )
        return decrypt_secret(value, secret_key)

    def require(self, key: str) -> str:
        value = self.get(key)
        if value:
            return value
        raise ValueError(f"Missing required setting: {key}")

    def upsert(self, key: str, value: str, is_secret: bool | None = None) -> None:
        del is_secret
        secret = is_secret_key(key)
        stored_value = value
        secret_key = self._secret_key()
        if secret and value and secret_key:
            stored_value = encrypt_secret(value, secret_key)
        self._write(key, stored_value, secret)

    def upsert_many(self, items: list[tuple[str, str, bool]]) -> None:
        for key, value, is_secret in items:
            self.upsert(key, value, is_secret)

    def _write(self, key: str, value: str, secret: bool) -> None:
        self.connection.execute(
            """
            INSERT INTO settings (key, value, is_secret, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              is_secret = excluded.is_secret,
              updated_at = excluded.updated_at
            """,
            (key, value, int(secret), iso_now()),
        )

    @staticmethod
    def _secret_key() -> str | None:
        return os.getenv("APP_SECRET_KEY") or None
