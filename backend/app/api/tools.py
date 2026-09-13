from __future__ import annotations

from sqlite3 import Connection

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.dependencies import get_connection, require_user
from app.errors import ValidationAppError
from app.repositories.settings import SettingsRepository
from app.services.cloud import CloudServiceFactory

router = APIRouter(prefix="/api/tools", tags=["tools"], dependencies=[Depends(require_user)])


class OfflineDownloadRequest(BaseModel):
    url: str = Field(min_length=1, max_length=4096)


class OfflineDownloadResponse(BaseModel):
    ok: bool
    task_id: str


@router.post("/offline", response_model=OfflineDownloadResponse)
def submit_offline_download(
    payload: OfflineDownloadRequest,
    connection: Connection = Depends(get_connection),
) -> dict[str, object]:
    url = payload.url.strip()
    if not url:
        raise ValidationAppError("请输入磁力链接或离线地址")

    settings = SettingsRepository(connection)
    try:
        target_dir_id = settings.require("p115_download_dir_id")
    except ValueError as exc:
        raise ValidationAppError("请先在设置中选择 115 下载临时目录") from exc

    task_id = CloudServiceFactory(settings).create().add_offline_url(url, target_dir_id)
    return {"ok": True, "task_id": task_id}
