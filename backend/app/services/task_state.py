from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.errors import NotFoundError, ValidationAppError
from app.repositories.task_events import TaskEventsRepository
from app.repositories.tasks import TasksRepository

ALLOWED_TRANSITIONS = {
    "pending": {"submitted", "failed"},
    "submitted": {"downloading", "organizing", "failed"},
    "downloading": {"downloading", "organizing", "failed"},
    "organizing": {"completed", "failed"},
    "completed": set(),
    "failed": {"pending", "submitted", "downloading", "organizing", "failed"},
}


@dataclass(frozen=True)
class TaskTransition:
    status: str
    stage: str
    message: str | None = None
    error_message: str | None = None
    cloud_task_id: str | None = None
    cloud_file_id: str | None = None
    cloud_file_name: str | None = None
    context: dict[str, Any] | None = None


class TaskStateService:
    def __init__(self, tasks: TasksRepository, events: TaskEventsRepository) -> None:
        self.tasks = tasks
        self.events = events

    def transition(self, task_id: int, transition: TaskTransition) -> None:
        current = self.tasks.get_raw(task_id)
        if current is None:
            raise NotFoundError(f"Task not found: {task_id}")
        from_status = str(current["status"])
        from_stage = str(current["stage"])
        self._validate(from_status, transition.status)
        self.tasks.update_transition(
            task_id,
            transition.status,
            transition.stage,
            error_message=transition.error_message,
            cloud_task_id=transition.cloud_task_id,
            cloud_file_id=transition.cloud_file_id,
            cloud_file_name=transition.cloud_file_name,
        )
        self.events.add(
            task_id,
            from_status=from_status,
            to_status=transition.status,
            from_stage=from_stage,
            to_stage=transition.stage,
            message=transition.message or transition.error_message,
            context=transition.context,
        )

    def _validate(self, current: str, next_status: str) -> None:
        if current == next_status:
            return
        allowed = ALLOWED_TRANSITIONS.get(current, set())
        if next_status not in allowed:
            raise ValidationAppError(
                f"Invalid task transition: {current} -> {next_status}"
            )
