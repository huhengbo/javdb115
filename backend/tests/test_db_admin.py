from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from app.db_admin import backup_database, restore_database


def test_backup_and_restore_round_trip(tmp_path: Path) -> None:
    database = tmp_path / "app.sqlite3"
    backup = tmp_path / "backups" / "app.sqlite3"
    restored = tmp_path / "restored.sqlite3"

    with sqlite3.connect(database) as connection:
        connection.execute("CREATE TABLE sample (value TEXT NOT NULL)")
        connection.execute("INSERT INTO sample (value) VALUES ('before-backup')")

    backup_database(database, backup)
    restore_database(restored, backup, confirm=True)

    with sqlite3.connect(restored) as connection:
        row = connection.execute("SELECT value FROM sample").fetchone()
        assert row is not None and row[0] == "before-backup"


def test_backup_refuses_to_overwrite_without_force(tmp_path: Path) -> None:
    database = tmp_path / "app.sqlite3"
    backup = tmp_path / "backup.sqlite3"
    with sqlite3.connect(database) as connection:
        connection.execute("CREATE TABLE sample (value TEXT)")
    backup_database(database, backup)

    with pytest.raises(FileExistsError):
        backup_database(database, backup)


def test_restore_requires_explicit_confirmation(tmp_path: Path) -> None:
    source = tmp_path / "backup.sqlite3"
    destination = tmp_path / "app.sqlite3"
    with sqlite3.connect(source) as connection:
        connection.execute("CREATE TABLE sample (value TEXT)")

    with pytest.raises(ValueError, match="--yes"):
        restore_database(destination, source)
