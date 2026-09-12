from __future__ import annotations

from pathlib import Path
from sqlite3 import Connection

from app.database import Database
from app.repositories.tasks import TasksRepository
from app.security import iso_now


def test_task_pages_use_stable_cursor_without_duplicates(tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    for _ in range(55):
        insert_task(connection, "completed", "115_organized")

    repository = TasksRepository(connection)
    first = repository.list_page("all", limit=24)
    second = repository.list_page("all", limit=24, before_id=int(first["next_cursor"]))
    third = repository.list_page("all", limit=24, before_id=int(second["next_cursor"]))

    first_ids = [int(task["id"]) for task in first["items"]]
    second_ids = [int(task["id"]) for task in second["items"]]
    third_ids = [int(task["id"]) for task in third["items"]]

    assert len(first_ids) == 24
    assert len(second_ids) == 24
    assert len(third_ids) == 7
    assert first["has_more"] is True
    assert second["has_more"] is True
    assert third["has_more"] is False
    assert third["next_cursor"] is None
    assert len(set(first_ids + second_ids + third_ids)) == 55
    assert first["total"] == 55
    assert first["counts"]["all"] == 55


def test_task_filter_counts_match_task_issue_categories(tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    insert_task(connection, "submitted", "manual_115_submitted")
    insert_task(connection, "organizing", "115_organizing")
    insert_task(connection, "completed", "115_organized")
    insert_task(connection, "failed", "115_submit_failed")
    insert_task(connection, "failed", "115_download_failed")
    insert_task(connection, "failed", "115_organize_failed")
    insert_task(connection, "failed", "115_organize_failed", "directory unavailable")
    insert_task(connection, "failed", "115_organize_failed", "no video found")
    insert_task(connection, "pending", "115_submit_incomplete")

    repository = TasksRepository(connection)
    counts = repository.filter_counts()

    assert counts == {
        "all": 9,
        "attention": 6,
        "submitted": 1,
        "downloading": 0,
        "organizing": 1,
        "completed": 1,
        "submit_failed": 1,
        "download_failed": 1,
        "organize_failed": 3,
        "incomplete_submit": 1,
    }

    organize_page = repository.list_page("organize_failed", limit=24)
    assert organize_page["total"] == 3
    assert len(organize_page["items"]) == 3


def insert_task(
    connection: Connection,
    status: str,
    stage: str,
    error_message: str | None = None,
) -> None:
    now = iso_now()
    connection.execute(
        """
        INSERT INTO tasks (status, stage, error_message, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (status, stage, error_message, now, now),
    )


def setup_database(tmp_path: Path) -> Database:
    database = Database(tmp_path / "test.sqlite3")
    database.initialize()
    return database
