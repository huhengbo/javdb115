from __future__ import annotations

from typing import Any

import pytest

from app.adapters.cloud115 import P115CloudClient
from app.errors import IntegrationError


class FakeP115Client:
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


class InvalidP115Client(FakeP115Client):
    def user_info(self, payload: dict[str, Any]) -> dict[str, Any]:
        return {"state": False, "error": "cookie expired"}


class OfflineP115Client(FakeP115Client):
    def offline_list(self, payload: dict[str, Any]) -> dict[str, Any]:
        stat = payload["stat"]
        tasks = {
            12: [{"info_hash": "down-hash", "percentDone": 42, "status": 1}],
            11: [{"info_hash": "done-hash", "percentDone": 100, "file_id": "dir-1"}],
            9: [{"info_hash": "bad-hash", "err_msg": "资源失效"}],
        }[stat]
        return {
            "state": True,
            "page": payload["page"],
            "page_count": 1,
            "tasks": tasks,
        }


class FakeCloudClient(P115CloudClient):
    def _new_client(self, _: str) -> FakeP115Client:
        return FakeP115Client()


class InvalidCloudClient(P115CloudClient):
    def _new_client(self, _: str) -> InvalidP115Client:
        return InvalidP115Client()


class OfflineCloudClient(P115CloudClient):
    def _new_client(self, _: str) -> OfflineP115Client:
        return OfflineP115Client()


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
    tasks = OfflineCloudClient("cookie").get_offline_tasks(
        {"down-hash", "done-hash", "bad-hash"}
    )

    assert tasks["down-hash"].status == "downloading"
    assert tasks["down-hash"].progress_percent == 42
    assert tasks["done-hash"].status == "completed"
    assert tasks["done-hash"].source_dir_id == "dir-1"
    assert tasks["bad-hash"].status == "failed"
    assert tasks["bad-hash"].message == "资源失效"
