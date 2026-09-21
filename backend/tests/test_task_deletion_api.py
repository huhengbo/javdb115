from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.tasks import router
from app.config import AppConfig
from app.database import Database
from app.dependencies import get_config
from app.errors import AppError, NotFoundError, app_error_handler
from app.repositories.sessions import SessionsRepository
from app.repositories.task_events import TaskEventsRepository
from app.repositories.tasks import TasksRepository
from app.security import iso_now
from app.services.auth import AuthService
from app.services.task_state import TaskStateService, TaskTransition


@pytest.mark.parametrize(
    "status", ["pending", "submitted", "downloading", "organizing", "completed", "failed"]
)
def test_delete_api_preserves_catalog_and_refreshes_counts(tmp_path: Path, status: str) -> None:
    database = Database(tmp_path / "deletion.sqlite3")
    database.initialize()
    config = AppConfig(database.path, "admin", "test-password", "test-secret", 24)
    with database.connect() as connection:
        now = iso_now()
        connection.execute(
            "INSERT INTO works (id, code, title, source_url, status, created_at, updated_at) "
            "VALUES (1, 'TEST-42', 'Test work', '', 'completed', ?, ?)",
            (now, now),
        )
        connection.execute(
            "INSERT INTO magnets (id, work_id, name, url, decision, reason, created_at) "
            "VALUES (1, 1, 'Test magnet', 'test-link', 'accept', 'test', ?)",
            (now,),
        )
        tasks = TasksRepository(connection)
        task_id = tasks.create(1, None, 1)
        tasks.update_status(task_id, status, "test_stage", cloud_task_id="cloud-test")
        TaskEventsRepository(connection).add(
            task_id, from_status=None, to_status=status, from_stage=None, to_stage="test_stage"
        )
        connection.execute(
            "INSERT INTO logs (task_id, level, stage, message, created_at) "
            "VALUES (?, 'info', 'test_stage', 'Test log', ?)",
            (task_id, now),
        )
        token = AuthService(SessionsRepository(connection), config).login(
            "admin", "test-password", client_key="deletion-test"
        )

    app = FastAPI()
    app.include_router(router)
    app.add_exception_handler(AppError, app_error_handler)
    app.dependency_overrides[get_config] = lambda: config
    with TestClient(app) as client:
        assert client.delete(f"/api/tasks/{task_id}").status_code == 401
        with database.connect() as connection:
            assert TasksRepository(connection).get(task_id) is not None
        client.cookies.set(config.session_cookie_name, token)
        response = client.delete(f"/api/tasks/{task_id}")
        assert response.status_code == 200
        assert response.json() == {"ok": True}
        page = client.get("/api/tasks").json()
        assert page["items"] == []
        assert page["total"] == 0
        assert all(count == 0 for count in page["counts"].values())
        assert client.get("/api/tasks/by-work/TEST-42").json() == []
        assert client.delete(f"/api/tasks/{task_id}").status_code == 404

    with database.connect() as connection:
        tasks = TasksRepository(connection)
        assert tasks.get(task_id) is None
        assert TaskEventsRepository(connection).list_for_tasks([task_id]) == {}
        assert connection.execute("SELECT COUNT(*) FROM works").fetchone()[0] == 1
        assert connection.execute("SELECT COUNT(*) FROM magnets").fetchone()[0] == 1
        assert connection.execute("SELECT task_id FROM logs").fetchone()[0] is None
        # Late worker updates must not recreate a deleted local record.
        tasks.update_status(task_id, "completed", "115_organized")
        with pytest.raises(NotFoundError):
            TaskStateService(tasks, TaskEventsRepository(connection)).transition(
                task_id, TaskTransition("completed", "115_organized")
            )
        assert tasks.get(task_id) is None
