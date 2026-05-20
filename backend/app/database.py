from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from app.repositories.settings import SettingsRepository

SQLITE_BUSY_TIMEOUT_MS = 30000


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path

    def connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute(f"PRAGMA busy_timeout = {SQLITE_BUSY_TIMEOUT_MS}")
        connection.execute("PRAGMA journal_mode = WAL")
        return connection

    def initialize(self) -> None:
        schema_path = Path(__file__).with_name("schema.sql")
        with self.connect() as connection:
            connection.executescript(schema_path.read_text(encoding="utf-8"))
            self._ensure_column(connection, "tasks", "cloud_file_name TEXT")
            self._ensure_task_events_table(connection)
            self._ensure_follows_table(connection)
            self._ensure_follow_seen_table(connection)
            SettingsRepository(connection).delete_obsolete()

    def _ensure_task_events_table(self, connection: sqlite3.Connection) -> None:
        connection.execute(
            """CREATE TABLE IF NOT EXISTS task_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                from_status TEXT,
                to_status TEXT NOT NULL,
                from_stage TEXT,
                to_stage TEXT NOT NULL,
                message TEXT,
                context_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            )"""
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_task_events_task_id ON task_events(task_id)"
        )

    def _ensure_follows_table(self, connection: sqlite3.Connection) -> None:
        connection.execute(
            """CREATE TABLE IF NOT EXISTS follows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filter_by TEXT UNIQUE,
                label TEXT NOT NULL DEFAULT '',
                type TEXT NOT NULL DEFAULT 'actor',
                cover_url TEXT,
                actor_external_id TEXT UNIQUE,
                actor_name TEXT NOT NULL DEFAULT '',
                actor_profile_url TEXT NOT NULL DEFAULT '',
                actor_avatar_url TEXT,
                selected_tag_ids_json TEXT NOT NULL DEFAULT '[]',
                selected_tag_names_json TEXT NOT NULL DEFAULT '[]',
                latest_count INTEGER DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"""
        )
        follow_columns = (
            "actor_external_id TEXT",
            "actor_name TEXT NOT NULL DEFAULT ''",
            "actor_profile_url TEXT NOT NULL DEFAULT ''",
            "actor_avatar_url TEXT",
            "selected_tag_ids_json TEXT NOT NULL DEFAULT '[]'",
            "selected_tag_names_json TEXT NOT NULL DEFAULT '[]'",
        )
        for column in follow_columns:
            self._ensure_column(connection, "follows", column)

    def _ensure_follow_seen_table(self, connection: sqlite3.Connection) -> None:
        connection.execute(
            """CREATE TABLE IF NOT EXISTS follow_seen_movies (
                follow_id INTEGER NOT NULL REFERENCES follows(id) ON DELETE CASCADE,
                movie_id TEXT NOT NULL,
                seen_at TEXT NOT NULL,
                PRIMARY KEY (follow_id, movie_id)
            )"""
        )

    def _ensure_column(
        self,
        connection: sqlite3.Connection,
        table_name: str,
        column_definition: str,
    ) -> None:
        try:
            connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_definition}")
        except sqlite3.OperationalError:
            pass


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


def rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    return [dict(row) for row in rows]
