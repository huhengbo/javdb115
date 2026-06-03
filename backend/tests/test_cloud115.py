from __future__ import annotations

from typing import Any

import pytest

from app.adapters.cloud115 import P115CloudClient
from app.errors import IntegrationError


class FakeP115Client:
    def __init__(self) -> None:
        self.uploaded: tuple[bytes, str, str] | None = None

    def user_info(self, payload: dict[str, Any]) -> dict[str, Any]:
        assert payload == {"uid": "123"}
        return {
            "state": True,
            "data": {
                "user_id": "123",
                "user_name": "tester",
                "is_vip": 2,
            },
        }

    def user_my_info(self) -> dict[str, Any]:
        return {
            "state": True,
            "data": {"uid": "123", "vip": {"expire_str": "2027-09-03"}},
        }

    def fs_space_summury(self) -> dict[str, Any]:
        return {
            "state": True,
            "space_summury": {
                "all_total": {"size": 2 * 1024**4, "size_format": "2.00TB"},
                "all_remain": {"size": 512 * 1024**3, "size_format": "512.00GB"},
            },
        }

    def upload_file(self, content: bytes, parent_id: str, *, filename: str) -> dict[str, Any]:
        self.uploaded = (content, parent_id, filename)
        return {"state": True, "file_id": "uploaded"}


class InvalidP115Client(FakeP115Client):
    def user_info(self, payload: dict[str, Any]) -> dict[str, Any]:
        return {"state": False, "error": "cookie expired"}


class OfflineP115Client(FakeP115Client):
    def offline_list(self, payload: dict[str, Any]) -> dict[str, Any]:
        stat = payload["stat"]
        tasks = {
            12: [{"info_hash": "down-hash", "percentDone": 42, "status": 1}],
            11: [
                {
                    "info_hash": "done-hash",
                    "percentDone": 100,
                    "file_id": "dir-1",
                    "del_path": "ABC-123/",
                    "wp_path_id": "download-root",
                }
            ],
            9: [{"info_hash": "bad-hash", "err_msg": "资源失效"}],
        }[stat]
        return {
            "state": True,
            "page": payload["page"],
            "page_count": 1,
            "tasks": tasks,
        }


class DuplicateOfflineP115Client(FakeP115Client):
    def offline_add_url(self, payload: dict[str, Any]) -> dict[str, Any]:
        assert payload == {
            "url": "magnet:?xt=urn:btih:dup-hash",
            "wp_path_id": "target-dir",
            "savepath": "ABC-123",
        }
        return {
            "state": False,
            "errcode": 10008,
            "error_msg": "任务已存在，请勿输入重复的链接地址",
            "data": {"info_hash": "dup-hash"},
        }


class PagedFilesP115Client(FakeP115Client):
    def __init__(self) -> None:
        super().__init__()
        self.payloads: list[dict[str, Any]] = []
        self.items = [
            {"cid": f"dir-{index}", "n": f"DIR-{index}", "fc": 0} for index in range(1151)
        ]

    def fs_files(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.payloads.append(payload.copy())
        offset = int(payload["offset"])
        limit = int(payload["limit"])
        return {
            "state": True,
            "count": len(self.items),
            "data": self.items[offset : offset + limit],
        }


class FakeCloudClient(P115CloudClient):
    def _new_client(self, _: str) -> FakeP115Client:
        self.fake_client = FakeP115Client()
        return self.fake_client


class InvalidCloudClient(P115CloudClient):
    def _new_client(self, _: str) -> InvalidP115Client:
        return InvalidP115Client()


class OfflineCloudClient(P115CloudClient):
    def _new_client(self, _: str) -> OfflineP115Client:
        return OfflineP115Client()


class DuplicateOfflineCloudClient(P115CloudClient):
    def _new_client(self, _: str) -> DuplicateOfflineP115Client:
        return DuplicateOfflineP115Client()


class PagedFilesCloudClient(P115CloudClient):
    def _new_client(self, _: str) -> PagedFilesP115Client:
        self.fake_client = PagedFilesP115Client()
        return self.fake_client


def test_account_info_maps_user_and_space_fields() -> None:
    account = FakeCloudClient("cookie").account_info()

    assert account.user_id == "123"
    assert account.user_name == "tester"
    assert account.vip_label == "VIP"
    assert account.vip_expires_at == "2027-09-03"
    assert account.space_total == "2.00TB"
    assert account.space_remaining == "512.00GB"
    assert account.space_used == "1.50TB"


def test_account_info_rejects_expired_cookie_response() -> None:
    with pytest.raises(IntegrationError, match="cookie expired"):
        InvalidCloudClient("cookie").account_info()


def test_get_offline_tasks_maps_remote_statuses() -> None:
    tasks = OfflineCloudClient("cookie").get_offline_tasks({"down-hash", "done-hash", "bad-hash"})

    assert tasks["down-hash"].status == "downloading"
    assert tasks["down-hash"].progress_percent == 42
    assert tasks["done-hash"].status == "completed"
    assert tasks["done-hash"].source_dir_id == "dir-1"
    assert tasks["done-hash"].source_dir_name == "ABC-123"
    assert tasks["done-hash"].download_root_id == "download-root"
    assert tasks["bad-hash"].status == "failed"
    assert tasks["bad-hash"].message == "资源失效"


def test_add_offline_url_reuses_existing_task_hash() -> None:
    task_id = DuplicateOfflineCloudClient("cookie").add_offline_url(
        "magnet:?xt=urn:btih:dup-hash",
        "target-dir",
        savepath="ABC-123",
    )

    assert task_id == "dup-hash"


def test_upload_bytes_uses_115_upload_file() -> None:
    client = FakeCloudClient("cookie")

    client.upload_bytes("parent-dir", "movie.nfo", b"metadata")

    assert client.fake_client.uploaded is not None
    content, parent_id, filename = client.fake_client.uploaded
    assert content == b"metadata"
    assert parent_id == "parent-dir"
    assert filename == "movie.nfo"


def test_list_directories_reads_all_pages() -> None:
    client = PagedFilesCloudClient("cookie")

    directories = client.list_directories("download-root")

    assert len(directories) == 1151
    assert directories[-1].id == "dir-1150"
    assert [payload["offset"] for payload in client.fake_client.payloads] == [0, 1150]
