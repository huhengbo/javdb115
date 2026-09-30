from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class CloudDirectory:
    id: str
    name: str
    path: str | None
    is_directory: bool


@dataclass(frozen=True)
class CloudItem:
    id: str
    name: str
    size_bytes: int | None
    is_directory: bool
    pick_code: str | None = None


@dataclass(frozen=True)
class CloudOfflineTask:
    id: str
    status: str
    source_dir_id: str | None
    progress_percent: int | None
    message: str | None
    source_dir_name: str | None = None
    download_root_id: str | None = None


@dataclass(frozen=True)
class CloudDownloadUrl:
    url: str
    # 115 直链校验请求头（至少 User-Agent 需与获取直链时一致），访问直链时必须原样携带
    headers: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class P115AccountInfo:
    user_id: str | None
    user_name: str | None
    vip_label: str | None
    vip_expires_at: str | None
    space_total: str | None
    space_used: str | None
    space_remaining: str | None
