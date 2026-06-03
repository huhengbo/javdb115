from __future__ import annotations

from typing import cast

from app.adapters.cloud115 import Cloud115Client
from app.adapters.cloud115_types import CloudDirectory, CloudItem
from app.services.organizer import CloudOrganizer, OrganizeRequest


class GuardedCloud:
    def __init__(self) -> None:
        self.queried_directories: list[str] = []
        self.deleted: list[str] = []

    def list_directories(self, parent_id: str) -> list[CloudDirectory]:
        self.queried_directories.append(parent_id)
        return []

    def list_items(self, parent_id: str) -> list[CloudItem]:
        raise AssertionError(f"unexpected item listing for {parent_id}")

    def delete(self, file_ids: list[str]) -> None:
        self.deleted.extend(file_ids)


def test_organizer_refuses_root_source_before_remote_calls() -> None:
    cloud = GuardedCloud()

    assert_refuses_protected_source(cloud, source_dir_id="0")


def test_organizer_refuses_download_root_source_before_remote_calls() -> None:
    cloud = GuardedCloud()

    assert_refuses_protected_source(cloud, source_dir_id="download-root")


def test_organizer_refuses_completed_root_source_before_remote_calls() -> None:
    cloud = GuardedCloud()

    assert_refuses_protected_source(cloud, source_dir_id="completed-root")


def assert_refuses_protected_source(cloud: GuardedCloud, source_dir_id: str) -> None:
    try:
        CloudOrganizer(cast(Cloud115Client, cloud)).organize(
            OrganizeRequest(
                source_dir_id=source_dir_id,
                download_root_id="download-root",
                completed_root_id="completed-root",
                code="ABC-123",
            )
        )
    except ValueError as exc:
        assert "protected" in str(exc)
    else:
        raise AssertionError("Expected organizer to reject protected source folder")
    assert cloud.queried_directories == []
    assert cloud.deleted == []
