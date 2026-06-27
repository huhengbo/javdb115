from __future__ import annotations

from dataclasses import asdict
from typing import Protocol

from app.adapters.javdb_api import JavdbApiClient
from app.errors import AppError
from app.repositories.settings import SettingsRepository
from app.security import iso_now
from app.services.cloud import CloudServiceFactory


class JavdbHealthClient(Protocol):
    def startup(self) -> dict[str, object]: ...


class IntegrationStatusService:
    def __init__(
        self,
        settings: SettingsRepository,
        javdb: JavdbHealthClient | None = None,
    ) -> None:
        self.settings = settings
        self.javdb = javdb or JavdbApiClient()

    def dashboard_status(self) -> dict[str, object]:
        return {"p115": self._p115_status(), "javdb": self._javdb_status()}

    def _javdb_status(self) -> dict[str, object]:
        checked_at = iso_now()
        try:
            self.javdb.startup()
        except AppError as exc:
            return {"ok": False, "message": exc.message, "checked_at": checked_at}
        except ValueError as exc:
            return {"ok": False, "message": str(exc), "checked_at": checked_at}
        return {"ok": True, "message": "JAVDB App API 可访问", "checked_at": checked_at}

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
