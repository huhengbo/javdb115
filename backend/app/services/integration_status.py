from __future__ import annotations

from dataclasses import asdict

from app.errors import AppError
from app.repositories.settings import SettingsRepository
from app.services.cloud import CloudServiceFactory


class IntegrationStatusService:
    def __init__(self, settings: SettingsRepository) -> None:
        self.settings = settings

    def dashboard_status(self) -> dict[str, object]:
        return {"p115": self._p115_status()}

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
            "account": account,
        }
