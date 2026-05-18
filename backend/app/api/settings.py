from __future__ import annotations

from sqlite3 import Connection

from fastapi import APIRouter, Depends, Query

from app.contracts import (
    DirectoryItem,
    P115LoginDevice,
    P115QrStartRequest,
    P115QrStartResponse,
    P115QrStatusResponse,
    SettingItem,
    SettingsUpdate,
    TelegramTestRequest,
    TelegramTestResponse,
)
from app.dependencies import get_connection, require_user
from app.repositories.settings import SettingsRepository
from app.services.cloud import CloudServiceFactory, DirectoryService
from app.services.notifier import NotificationService
from app.services.p115_login import qr_login_manager
from app.services.settings import SettingsService

router = APIRouter(prefix="/api/settings", tags=["settings"], dependencies=[Depends(require_user)])


@router.get("", response_model=list[SettingItem])
def list_settings(connection: Connection = Depends(get_connection)) -> list[dict[str, object]]:
    return SettingsService(SettingsRepository(connection)).list_public()


@router.put("")
def update_settings(
    payload: SettingsUpdate,
    connection: Connection = Depends(get_connection),
) -> dict[str, bool]:
    items = [
        (item.key, item.value or "", item.is_secret)
        for item in payload.items
        if not (item.is_secret and not item.value)
    ]
    SettingsService(SettingsRepository(connection)).update(items)
    return {"ok": True}


@router.post("/telegram/test", response_model=TelegramTestResponse)
def test_telegram(
    payload: TelegramTestRequest,
    connection: Connection = Depends(get_connection),
) -> dict[str, object]:
    message = NotificationService(SettingsRepository(connection)).send_test(payload.message)
    return {"ok": True, "message": message}


@router.get("/115/directories", response_model=list[DirectoryItem])
def list_directories(
    parent_id: str = Query(default="0"),
    connection: Connection = Depends(get_connection),
) -> list[dict[str, object]]:
    cloud = CloudServiceFactory(SettingsRepository(connection)).create()
    return DirectoryService(cloud).list_directories(parent_id)


@router.get("/115/login/devices", response_model=list[P115LoginDevice])
def list_p115_login_devices() -> list[dict[str, object]]:
    return qr_login_manager.devices()


@router.post("/115/login/qrcode", response_model=P115QrStartResponse)
def start_p115_qrcode_login(payload: P115QrStartRequest) -> dict[str, object]:
    session = qr_login_manager.start(payload.device)
    return {
        "session_id": session.session_id,
        "device": session.device,
        "qrcode_url": session.qrcode_url,
        "expires_at": session.expires_at,
    }


@router.get("/115/login/qrcode/{session_id}", response_model=P115QrStatusResponse)
def p115_qrcode_status(
    session_id: str,
    connection: Connection = Depends(get_connection),
) -> dict[str, object]:
    return qr_login_manager.status(session_id, SettingsRepository(connection))


@router.post("/115/login/qrcode/{session_id}/cancel")
def cancel_p115_qrcode_login(session_id: str) -> dict[str, bool]:
    qr_login_manager.cancel(session_id)
    return {"ok": True}
