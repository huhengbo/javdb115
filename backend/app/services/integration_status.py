from __future__ import annotations

from dataclasses import asdict
from typing import Protocol

from app.adapters.javdb_api import client_from_token
from app.errors import AppError
from app.repositories.settings import SettingsRepository
from app.security import iso_now
from app.services.cloud import CloudServiceFactory
from app.services.javdb_login import account_from_user


class JavdbHealthClient(Protocol):
    def startup(self) -> dict[str, object]: ...


class IntegrationStatusService:
    def __init__(
        self,
        settings: SettingsRepository,
        javdb: JavdbHealthClient | None = None,
    ) -> None:
        self.settings = settings
        self.javdb = javdb or client_from_token(settings.get("javdb_token"))

    def dashboard_status(self) -> dict[str, object]:
        return {"p115": self._p115_status(), "javdb": self._javdb_status()}

    def _javdb_status(self) -> dict[str, object]:
        checked_at = iso_now()
        token = self.settings.get("javdb_token")
        configured = bool(token)
        try:
            self.javdb.startup()
        except AppError as exc:
            return self._javdb_result(False, configured, exc.message, checked_at)
        except ValueError as exc:
            return self._javdb_result(False, configured, str(exc), checked_at)
        if not token:
            return self._javdb_result(True, False, "JAVDB App API 可访问", checked_at)
        current_user = getattr(self.javdb, "current_user", None)
        if current_user is None:
            return self._javdb_result(True, True, "JAVDB App API 可访问", checked_at)
        try:
            account = account_from_user(current_user())
        except AppError as exc:
            return self._javdb_result(
                True,
                True,
                f"JavDB 登录已失效：{exc.message}",
                checked_at,
            )
        username = account.get("username") or account.get("email") or ""
        message = f"JavDB 已登录 {username}".strip() if username else "JavDB 已登录"
        return self._javdb_result(True, True, message, checked_at, account)

    def _javdb_result(
        self,
        ok: bool,
        configured: bool,
        message: str,
        checked_at: str,
        account: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return {
            "ok": ok,
            "configured": configured,
            "message": message,
            "checked_at": checked_at,
            "account": account,
        }

    def _p115_status(self) -> dict[str, object]:
        if not self.settings.get("p115_cookie"):
            return self._status(False, False, "未配置 115 Cookie")
        try:
            account = CloudServiceFactory(self.settings).create().account_info()
        except AppError as exc:
            return self._status(True, False, exc.message)
        except ValueError as exc:
            return self._status(True, False, str(exc))
        return self._status(True, True, "115 Cookie 可用", asdict(account))

    def _status(
        self,
        configured: bool,
        ok: bool,
        message: str,
        account: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return {
            "configured": configured,
            "ok": ok,
            "message": message,
            "checked_at": iso_now(),
            "account": account,
        }
