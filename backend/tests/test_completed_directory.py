from __future__ import annotations

from pathlib import Path

import pytest

from app.database import Database
from app.repositories.settings import SettingsRepository
from app.services.completed_directory import (
    COMPLETED_DIR_MODE_CATEGORY,
    COMPLETED_DIR_MODE_KEY,
    CompletedDirectoryResolver,
    CompletedDirectoryType,
    completed_directory_type,
)
from app.services.settings import SettingsService


@pytest.mark.parametrize(
    ("code", "expected"),
    [
        ("FC2-3179516", CompletedDirectoryType.FC2),
        ("FC2-PPV-1234567", CompletedDirectoryType.FC2),
        ("HEYZO-1234", CompletedDirectoryType.UNCENSORED),
        ("123456-789", CompletedDirectoryType.UNCENSORED),
        ("SONE-801", CompletedDirectoryType.CENSORED),
    ],
)
def test_completed_directory_type_from_code(code: str, expected: CompletedDirectoryType) -> None:
    assert completed_directory_type(code) == expected


def test_public_settings_include_completed_directory_mode_default(tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()

    settings = by_key(SettingsService(SettingsRepository(connection)).list_public())

    assert settings[COMPLETED_DIR_MODE_KEY]["value"] == "single"


def test_resolver_defaults_to_single_completed_directory(tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    repository = SettingsRepository(connection)
    repository.upsert("p115_completed_dir_id", "completed-root", False)

    root_id = CompletedDirectoryResolver(repository).completed_root_id("FC2-3179516")

    assert root_id == "completed-root"


def test_resolver_uses_category_completed_directory(tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    repository = SettingsRepository(connection)
    repository.upsert(COMPLETED_DIR_MODE_KEY, COMPLETED_DIR_MODE_CATEGORY, False)
    repository.upsert("p115_completed_fc2_dir_id", "fc2-root", False)

    assert CompletedDirectoryResolver(repository).completed_root_id("FC2-3179516") == "fc2-root"


def by_key(items: list[dict[str, object]]) -> dict[str, dict[str, object]]:
    return {str(item["key"]): item for item in items}


def setup_database(tmp_path: Path) -> Database:
    database = Database(tmp_path / "test.sqlite3")
    database.initialize()
    return database
