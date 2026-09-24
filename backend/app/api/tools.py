from __future__ import annotations

from sqlite3 import Connection

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.dependencies import get_connection, require_user
from app.errors import ValidationAppError
from app.repositories.settings import SettingsRepository
from app.services.cloud import CloudServiceFactory
from app.services.playback import PlaybackService

router = APIRouter(prefix="/api/tools", tags=["tools"], dependencies=[Depends(require_user)])


class OfflineDownloadRequest(BaseModel):
    url: str = Field(min_length=1, max_length=4096)


class OfflineDownloadResponse(BaseModel):
    ok: bool
    task_id: str


class PlaybackRequest(BaseModel):
    url: str = Field(min_length=1, max_length=4096)


class PlaybackSelectRequest(BaseModel):
    file_id: str = Field(min_length=1, max_length=128)


class PlaybackFileResponse(BaseModel):
    id: str
    name: str
    size: int | None


class PlaybackResponse(BaseModel):
    session_id: str
    task_id: str
    status: str
    message: str
    progress_percent: int
    expires_at: str
    files: list[PlaybackFileResponse]
    file: PlaybackFileResponse | None
    play_url: str | None


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



def _playback_service(connection: Connection) -> PlaybackService:
    settings = SettingsRepository(connection)
    try:
        download_root_id = settings.require("p115_download_dir_id")
    except ValueError as exc:
        raise ValidationAppError("请先在设置中选择 115 下载临时目录") from exc
    return PlaybackService(CloudServiceFactory(settings).create(), download_root_id)


@router.post("/playback", response_model=PlaybackResponse)
def create_playback(
    payload: PlaybackRequest,
    connection: Connection = Depends(get_connection),
) -> dict[str, object]:
    return _playback_service(connection).create(payload.url)


@router.get("/playback/{session_id}", response_model=PlaybackResponse)
def get_playback(
    session_id: str,
    connection: Connection = Depends(get_connection),
) -> dict[str, object]:
    return _playback_service(connection).get(session_id)


@router.post("/playback/{session_id}/select", response_model=PlaybackResponse)
def select_playback_file(
    session_id: str,
    payload: PlaybackSelectRequest,
    connection: Connection = Depends(get_connection),
) -> dict[str, object]:
    return _playback_service(connection).select(session_id, payload.file_id)
