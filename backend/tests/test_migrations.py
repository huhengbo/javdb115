from __future__ import annotations

import sqlite3
from pathlib import Path

from app.database import Database
from app.migrations import current_schema_version


def test_legacy_database_is_upgraded_and_versioned(tmp_path: Path) -> None:
    database_path = tmp_path / "legacy.sqlite3"
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              is_secret INTEGER NOT NULL DEFAULT 0,
              updated_at TEXT NOT NULL
            );
            INSERT INTO settings (key, value, is_secret, updated_at)
            VALUES ('p115_cookie', 'UID=legacy;', 0, '2026-01-01T00:00:00+00:00');

            CREATE TABLE tasks (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              status TEXT NOT NULL,
              stage TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE follows (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              filter_by TEXT UNIQUE,
              label TEXT NOT NULL DEFAULT '',
              type TEXT NOT NULL DEFAULT 'actor',
              cover_url TEXT,
              latest_count INTEGER DEFAULT 0,
              enabled INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            """
        )

    database = Database(database_path)
    database.initialize()

    with database.connect() as connection:
        task_columns = {str(row["name"]) for row in connection.execute("PRAGMA table_info(tasks)")}
        follow_columns = {str(row["name"]) for row in connection.execute("PRAGMA table_info(follows)")}
        secret = connection.execute(
            "SELECT is_secret FROM settings WHERE key = 'p115_cookie'"
        ).fetchone()
        versions = [
            int(row["version"])
            for row in connection.execute(
                "SELECT version FROM schema_migrations ORDER BY version"
            ).fetchall()
        ]

        assert "cloud_file_name" in task_columns
        assert "last_checked_at" in follow_columns
        assert secret is not None and int(secret["is_secret"]) == 1
        assert versions == [1, 2]
        assert current_schema_version(connection) == 2


def test_migrations_are_idempotent(tmp_path: Path) -> None:
    database = Database(tmp_path / "fresh.sqlite3")
    database.initialize()
    database.initialize()

    with database.connect() as connection:
        count = connection.execute("SELECT COUNT(*) AS count FROM schema_migrations").fetchone()
        assert count is not None and int(count["count"]) == 2
