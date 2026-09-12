from __future__ import annotations

import uuid
from typing import Any

from app.adapters.javdb_api import JavdbApiClient, client_from_token
from app.errors import IntegrationError, ValidationAppError
from app.repositories.settings import SettingsRepository

JAVDB_TOKEN_KEY = "javdb_token"
JAVDB_DEVICE_UUID_KEY = "javdb_device_uuid"


class JavdbLoginService:
    def __init__(
        self,
        settings: SettingsRepository,
        client: JavdbApiClient | None = None,
    ) -> None:
        self.settings = settings
        self._client = client

    def login(self, username: str, password: str) -> dict[str, object]:
        cleaned_username = username.strip()
        if not cleaned_username:
            raise ValidationAppError("JavDB 用户名不能为空")
        if not password:
            raise ValidationAppError("JavDB 密码不能为空")
        result = self._login_client().login(
            cleaned_username,
            password,
            device_uuid=self._device_uuid(),
        )
        self.settings.upsert(JAVDB_TOKEN_KEY, str(result["token"]), True)
        return {
            "ok": True,
            "account": account_from_user(result["user"]),
        }

    def status(self) -> dict[str, object]:
        token = self.settings.get(JAVDB_TOKEN_KEY)
        if not token:
            return {
                "configured": False,
                "ok": False,
                "message": "未登录 JavDB 账号",
                "account": None,
            }
        try:
            user = self._authed_client(token).current_user()
        except IntegrationError as exc:
            return {
                "configured": True,
                "ok": False,
                "message": f"JavDB 登录已失效：{exc.message}",
                "account": None,
            }
        return {
            "configured": True,
            "ok": True,
            "message": "JavDB 已登录",
            "account": account_from_user(user),
        }

    def logout(self) -> dict[str, bool]:
        self.settings.upsert(JAVDB_TOKEN_KEY, "", True)
        return {"ok": True}

    def _device_uuid(self) -> str:
        existing = self.settings.get(JAVDB_DEVICE_UUID_KEY)
        if existing:
            return existing
        value = str(uuid.uuid4())
        self.settings.upsert(JAVDB_DEVICE_UUID_KEY, value, False)
        return value

    def _login_client(self) -> JavdbApiClient:
        return self._client or JavdbApiClient()

    def _authed_client(self, token: str) -> JavdbApiClient:
        return self._client or client_from_token(token)


def account_from_user(user: dict[str, Any]) -> dict[str, object]:
    user_id = user.get("id")
    return {
        "user_id": str(user_id) if user_id is not None else None,
        "username": user.get("username"),
        "email": user.get("email"),
        "is_vip": user.get("is_vip"),
        "vip_expired_at": user.get("vip_expired_at"),
    }
