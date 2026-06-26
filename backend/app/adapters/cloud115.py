from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from app.adapters.cloud115_types import (
    CloudDirectory,
    CloudItem,
    CloudOfflineTask,
    P115AccountInfo,
)
from app.adapters.cloud115_utils import (
    space_label,
    space_used_label,
    to_int,
    to_optional_str,
    vip_expires_at,
    vip_label,
)
from app.errors import IntegrationError

OFFLINE_PAGE_SIZE = 100
FS_PAGE_SIZE = 1150
OFFLINE_STATUS_QUERIES = (
    (12, "downloading"),
    (9, "failed"),
    (11, "completed"),
)
OFFLINE_DUPLICATE_ERRCODE = 10008
CLOUDDOWNLOAD_ADD_URL_METHOD = "clouddownload_task_add_url"
CLOUDDOWNLOAD_LIST_METHOD = "clouddownload_task_list"


class Cloud115Client:
    def account_info(self) -> P115AccountInfo:
        raise NotImplementedError

    def list_items(self, parent_id: str) -> list[CloudItem]:
        raise NotImplementedError

    def list_directories(self, parent_id: str) -> list[CloudDirectory]:
        raise NotImplementedError

    def add_offline_url(
        self,
        url: str,
        target_dir_id: str,
        *,
        savepath: str | None = None,
    ) -> str:
        raise NotImplementedError

    def get_offline_tasks(self, task_ids: set[str]) -> dict[str, CloudOfflineTask]:
        raise NotImplementedError

    def create_directory(self, parent_id: str, name: str) -> str:
        raise NotImplementedError

    def rename(self, file_id: str, name: str) -> None:
        raise NotImplementedError

    def move(self, file_ids: list[str], target_dir_id: str) -> None:
        raise NotImplementedError

    def delete(self, file_ids: list[str]) -> None:
        raise NotImplementedError

    def upload_bytes(self, parent_id: str, filename: str, content: bytes) -> None:
        raise NotImplementedError


class P115CloudClient(Cloud115Client):
    def __init__(self, cookie: str) -> None:
        if not cookie.strip():
            raise ValueError("115 cookie is required")
        self.client = self._new_client(cookie)

    def account_info(self) -> P115AccountInfo:
        identity = self._call_without_payload("user_my_info")
        identity_data = self._response_data(identity)
        user_id = to_optional_str(identity_data.get("uid") or identity_data.get("user_id"))
        if user_id is None:
            raise IntegrationError("115 account response did not include user id")
        user_info = self._call("user_info", {"uid": user_id})
        space_info = self._call_without_payload("fs_space_summury")
        user_data = self._response_data(user_info)
        user_name = to_optional_str(user_data.get("user_name") or user_data.get("nickname"))
        return P115AccountInfo(
            user_id=user_id,
            user_name=user_name,
            vip_label=vip_label(user_data.get("is_vip")),
            vip_expires_at=vip_expires_at(identity_data.get("vip")),
            space_total=space_label(space_info, "all_total"),
            space_used=space_used_label(space_info),
            space_remaining=space_label(space_info, "all_remain"),
        )

    def list_items(self, parent_id: str) -> list[CloudItem]:
        return [self._to_item(item) for item in self._iter_fs_items(parent_id)]

    def list_directories(self, parent_id: str) -> list[CloudDirectory]:
        return [
            self._to_directory(item)
            for item in self._iter_fs_items(parent_id)
            if self._is_directory(item)
        ]

    def add_offline_url(
        self,
        url: str,
        target_dir_id: str,
        *,
        savepath: str | None = None,
    ) -> str:
        payload = {"url": url, "wp_path_id": target_dir_id}
        if savepath:
            payload["savepath"] = savepath
        result = self._call(CLOUDDOWNLOAD_ADD_URL_METHOD, payload)
        task_id = self._first_present(result, ["info_hash", "task_id", "id"])
        if task_id:
            return str(task_id)
        raise IntegrationError("115 offline task response did not include a task id")

    def get_offline_tasks(self, task_ids: set[str]) -> dict[str, CloudOfflineTask]:
        remaining = {task_id.casefold() for task_id in task_ids if task_id}
        found: dict[str, CloudOfflineTask] = {}
        for remote_stat, status in OFFLINE_STATUS_QUERIES:
            for item in self._iter_offline_items(remote_stat):
                task = self._to_offline_task(item, status)
                if task.id.casefold() not in remaining:
                    continue
                found[task.id.casefold()] = task
                remaining.remove(task.id.casefold())
                if not remaining:
                    return found
        return found

    def create_directory(self, parent_id: str, name: str) -> str:
        result = self._call("fs_mkdir", {"pid": parent_id, "cname": name})
        directory_id = self._first_present(result, ["cid", "file_id", "id"])
        if directory_id:
            return str(directory_id)
        raise IntegrationError("115 mkdir response did not include a directory id")

    def rename(self, file_id: str, name: str) -> None:
        self._call("fs_rename", {f"files_new_name[{file_id}]": name})

    def move(self, file_ids: list[str], target_dir_id: str) -> None:
        payload = {f"fid[{index}]": file_id for index, file_id in enumerate(file_ids)}
        payload["pid"] = target_dir_id
        self._call("fs_move", payload)

    def delete(self, file_ids: list[str]) -> None:
        payload = {f"fid[{index}]": file_id for index, file_id in enumerate(file_ids)}
        self._call("fs_delete", payload)

    def upload_bytes(self, parent_id: str, filename: str, content: bytes) -> None:
        result = self.client.upload_file(content, parent_id, filename=filename)
        self._raise_if_response_failed("upload_file", result)

    def _iter_offline_items(self, remote_stat: int) -> Iterator[dict[str, Any]]:
        page = 1
        while True:
            payload = {"page": page, "page_size": OFFLINE_PAGE_SIZE, "stat": remote_stat}
            result = self._call(CLOUDDOWNLOAD_LIST_METHOD, payload)
            yield from self._extract_offline_items(result)
            page_count = self._page_count(result, page)
            if page >= page_count:
                return
            page += 1

    def _iter_fs_items(self, parent_id: str) -> Iterator[dict[str, Any]]:
        offset = 0
        while True:
            payload = {"cid": parent_id, "limit": FS_PAGE_SIZE, "offset": offset}
            result = self._call("fs_files", payload)
            items = self._extract_items(result)
            yield from items
            if not self._has_more_fs_items(result, offset, len(items)):
                return
            offset += len(items)

    def _has_more_fs_items(self, result: Any, offset: int, item_count: int) -> bool:
        if item_count == 0:
            return False
        if not isinstance(result, dict):
            return False
        total = to_int(result.get("count") or result.get("total"))
        if total is None:
            return item_count >= FS_PAGE_SIZE
        return offset + item_count < total

    def _new_client(self, cookie: str) -> Any:
        try:
            from p115client import P115Client
        except ImportError as exc:
            raise IntegrationError("p115client is not installed") from exc
        return P115Client(cookie)

    def _call(self, method_name: str, payload: dict[str, Any]) -> Any:
        method = getattr(self.client, method_name, None)
        if method is None:
            raise IntegrationError(f"p115client does not expose {method_name}")
        try:
            result = method(payload)
        except Exception as exc:
            raise IntegrationError(f"115 API call failed at {method_name}: {exc}") from exc
        self._raise_if_response_failed(method_name, result)
        return result

    def _call_without_payload(self, method_name: str) -> Any:
        method = getattr(self.client, method_name, None)
        if method is None:
            raise IntegrationError(f"p115client does not expose {method_name}")
        try:
            result = method()
        except Exception as exc:
            raise IntegrationError(f"115 API call failed at {method_name}: {exc}") from exc
        self._raise_if_response_failed(method_name, result)
        return result

    def _raise_if_response_failed(self, method_name: str, result: Any) -> None:
        if isinstance(result, dict) and result.get("state") is False:
            if self._is_existing_offline_task(method_name, result):
                return
            message = (
                result.get("error")
                or result.get("error_msg")
                or result.get("message")
                or "115 cookie is invalid"
            )
            raise IntegrationError(f"115 API call failed at {method_name}: {message}")

    def _is_existing_offline_task(self, method_name: str, result: dict[str, Any]) -> bool:
        return (
            method_name == CLOUDDOWNLOAD_ADD_URL_METHOD
            and self._error_code(result) == OFFLINE_DUPLICATE_ERRCODE
            and self._first_present(result, ["info_hash"]) is not None
        )

    def _error_code(self, result: dict[str, Any]) -> int | None:
        raw_code = result.get("errcode")
        data = result.get("data")
        if raw_code is None and isinstance(data, dict):
            raw_code = data.get("errcode")
        return to_int(raw_code)

    def _response_data(self, result: Any) -> dict[str, Any]:
        if not isinstance(result, dict):
            raise IntegrationError("115 account response is not a JSON object")
        data = result.get("data")
        if not isinstance(data, dict):
            raise IntegrationError("115 account response did not include user data")
        return data

    def _extract_items(self, result: Any) -> list[dict[str, Any]]:
        if isinstance(result, dict):
            items = result.get("data") or result.get("list") or []
            return [item for item in items if isinstance(item, dict)]
        return []

    def _extract_offline_items(self, result: Any) -> list[dict[str, Any]]:
        if isinstance(result, dict):
            items = result.get("tasks") or result.get("data") or result.get("list") or []
            return [item for item in items if isinstance(item, dict)]
        return []

    def _to_directory(self, item: dict[str, Any]) -> CloudDirectory:
        return CloudDirectory(
            id=str(item.get("cid") or item.get("fid") or item.get("id")),
            name=str(item.get("n") or item.get("name") or item.get("file_name")),
            path=item.get("path"),
            is_directory=True,
        )

    def _to_item(self, item: dict[str, Any]) -> CloudItem:
        return CloudItem(
            id=str(item.get("fid") or item.get("cid") or item.get("id")),
            name=str(item.get("n") or item.get("name") or item.get("file_name")),
            size_bytes=to_int(item.get("s") or item.get("size")),
            is_directory=self._is_directory(item),
        )

    def _to_offline_task(self, item: dict[str, Any], status: str) -> CloudOfflineTask:
        task_id = str(item.get("info_hash") or item.get("hash") or item.get("id"))
        return CloudOfflineTask(
            id=task_id,
            status=status,
            source_dir_id=self._offline_source_dir_id(item),
            progress_percent=to_int(item.get("percentDone") or item.get("percent")),
            message=self._offline_message(item, status),
            source_dir_name=self._offline_source_dir_name(item),
            download_root_id=to_optional_str(item.get("wp_path_id")),
        )

    def _offline_source_dir_id(self, item: dict[str, Any]) -> str | None:
        value = item.get("file_id") or item.get("delete_file_id") or item.get("fid")
        return to_optional_str(value)

    def _offline_source_dir_name(self, item: dict[str, Any]) -> str | None:
        raw_path = to_optional_str(item.get("del_path"))
        if raw_path is None:
            return None
        parts = [part for part in raw_path.replace("\\", "/").split("/") if part]
        return parts[-1] if parts else None

    def _offline_message(self, item: dict[str, Any], status: str) -> str | None:
        message = item.get("err_msg") or item.get("status_text") or item.get("error")
        if message:
            return str(message)
        if status == "failed":
            return "115 离线任务失败"
        return None

    def _is_directory(self, item: dict[str, Any]) -> bool:
        if item.get("is_dir") or item.get("is_directory"):
            return True
        return item.get("fc") in (0, "0")

    def _first_present(self, result: Any, keys: list[str]) -> Any:
        if not isinstance(result, dict):
            return None
        for key in keys:
            if result.get(key):
                return result[key]
        data = result.get("data")
        return self._first_present(data, keys) if isinstance(data, dict) else None

    def _page_count(self, result: Any, current_page: int) -> int:
        if not isinstance(result, dict):
            return current_page
        value = result.get("page_count")
        return int(value) if value else current_page
