from __future__ import annotations

import sqlite3
from collections.abc import Callable

from app.security import iso_now

Migration = tuple[int, str, Callable[[sqlite3.Connection], None]]


def apply_migrations(connection: sqlite3.Connection) -> None:
    _ensure_migrations_table(connection)
    applied = {
        int(row["version"])
        for row in connection.execute("SELECT version FROM schema_migrations").fetchall()
    }
    for version, name, migration in MIGRATIONS:
        if version in applied:
            continue
        migration(connection)
        connection.execute(
            "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
            (version, name, iso_now()),
        )


def current_schema_version(connection: sqlite3.Connection) -> int:
    _ensure_migrations_table(connection)
    row = connection.execute("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").fetchone()
    return 0 if row is None else int(row["version"])


def _ensure_migrations_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        )
        """
    )


def _migration_001_legacy_schema(connection: sqlite3.Connection) -> None:
    _add_column_if_missing(connection, "tasks", "cloud_file_name", "TEXT")
    _ensure_task_events_table(connection)
    _ensure_follows_table(connection)
    _ensure_follow_seen_table(connection)


def _migration_002_secret_flags(connection: sqlite3.Connection) -> None:
    connection.execute(
        "UPDATE settings SET is_secret = 1 WHERE key IN ('p115_cookie', 'telegram_bot_token')"
    )


def _ensure_task_events_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS task_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            from_status TEXT,
            to_status TEXT NOT NULL,
            from_stage TEXT,
            to_stage TEXT NOT NULL,
            message TEXT,
            context_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        )
        """
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_task_events_task_id ON task_events(task_id)"
    )


def _ensure_follows_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS follows (
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
            last_checked_at TEXT,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    columns = (
        ("actor_external_id", "TEXT"),
        ("actor_name", "TEXT NOT NULL DEFAULT ''"),
        ("actor_profile_url", "TEXT NOT NULL DEFAULT ''"),
        ("actor_avatar_url", "TEXT"),
        ("selected_tag_ids_json", "TEXT NOT NULL DEFAULT '[]'"),
        ("selected_tag_names_json", "TEXT NOT NULL DEFAULT '[]'"),
        ("last_checked_at", "TEXT"),
    )
    for column_name, definition in columns:
        _add_column_if_missing(connection, "follows", column_name, definition)
    connection.execute(
        """
        UPDATE follows
        SET last_checked_at = updated_at
        WHERE type = 'actor'
          AND last_checked_at IS NULL
          AND updated_at > created_at
        """
    )


def _ensure_follow_seen_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS follow_seen_movies (
            follow_id INTEGER NOT NULL REFERENCES follows(id) ON DELETE CASCADE,
            movie_id TEXT NOT NULL,
            seen_at TEXT NOT NULL,
            PRIMARY KEY (follow_id, movie_id)
        )
        """
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_follow_seen_movies_follow_id ON follow_seen_movies(follow_id)"
    )


def _add_column_if_missing(
    connection: sqlite3.Connection,
    table_name: str,
    column_name: str,
    definition: str,
) -> None:
    if _column_exists(connection, table_name, column_name):
        return
    connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")


def _column_exists(connection: sqlite3.Connection, table_name: str, column_name: str) -> bool:
    rows = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    return any(str(row["name"]) == column_name for row in rows)


MIGRATIONS: tuple[Migration, ...] = (
    (1, "legacy-schema-baseline", _migration_001_legacy_schema),
    (2, "mark-known-secrets", _migration_002_secret_flags),
)
