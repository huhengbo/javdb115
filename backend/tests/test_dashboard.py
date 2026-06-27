from __future__ import annotations

from pathlib import Path
from sqlite3 import Connection
from typing import Any, cast

from app.database import Database
from app.errors import IntegrationError
from app.repositories.settings import SettingsRepository
from app.repositories.tasks import TasksRepository
from app.security import iso_now
from app.services.integration_status import IntegrationStatusService


def test_task_breakdown_counts_attention_tasks(tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    insert_task(connection, "submitted", "manual_115_submitted")
    insert_task(connection, "organizing", "115_organizing")
    insert_task(connection, "failed", "115_organize_failed")

    repository = TasksRepository(connection)

    assert repository.counts()["organizing"] == 1
    assert repository.stage_counts()["115_organize_failed"] == 1
    assert repository.attention_count() == 2
    assert [task["status"] for task in repository.list_attention()] == ["failed", "organizing"]


def test_dashboard_status_reports_javdb_access_health(tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()

    status = IntegrationStatusService(
        SettingsRepository(connection),
        HealthyJavdb(),
    ).dashboard_status()
    javdb_status = cast(dict[str, Any], status["javdb"])

    assert javdb_status["ok"] is True
    assert javdb_status["message"] == "JAVDB App API 可访问"


def test_dashboard_status_exposes_javdb_access_error(tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()

    status = IntegrationStatusService(
        SettingsRepository(connection),
        BlockedJavdb(),
    ).dashboard_status()
    javdb_status = cast(dict[str, Any], status["javdb"])

    assert javdb_status["ok"] is False
    assert "JAVDB_ACCESS_BLOCKED" in str(javdb_status["message"])


class HealthyJavdb:
    def startup(self) -> dict[str, object]:
        return {"ok": True}


class BlockedJavdb:
    def startup(self) -> dict[str, object]:
        raise IntegrationError("JAVDB_ACCESS_BLOCKED: https://javdb.com")


def insert_task(connection: Connection, status: str, stage: str) -> None:
    now = iso_now()
    connection.execute(
        """
        INSERT INTO tasks (status, stage, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        """,
        (status, stage, now, now),
    )


def setup_database(tmp_path: Path) -> Database:
    database = Database(tmp_path / "test.sqlite3")
    database.initialize()
    return database
