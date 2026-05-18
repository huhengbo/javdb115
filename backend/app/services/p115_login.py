from __future__ import annotations

import secrets
from dataclasses import asdict, dataclass
from datetime import timedelta
from threading import Lock
from typing import Any

from app.adapters.cloud115 import P115CloudClient
from app.errors import IntegrationError, NotFoundError, ValidationAppError
from app.repositories.settings import SettingsRepository
from app.security import now_utc

QR_BASE_URL = "https://qrcodeapi.115.com"
QR_TTL_SECONDS = 180

LOGIN_DEVICES = (
    {"value": "alipaymini", "label": "支付宝小程序", "recommended": True},
    {"value": "web", "label": "网页端", "recommended": False},
    {"value": "desktop", "label": "115 浏览器", "recommended": False},
    {"value": "android", "label": "安卓端", "recommended": False},
    {"value": "ios", "label": "苹果端", "recommended": False},
)


@dataclass(frozen=True)
class QrLoginSession:
    session_id: str
    device: str
    token: dict[str, Any]
    uid: str
    qrcode_url: str
    expires_at: str


class P115QrLoginManager:
    def __init__(self) -> None:
        self._sessions: dict[str, QrLoginSession] = {}
        self._lock = Lock()

    def devices(self) -> list[dict[str, object]]:
        return [dict(device) for device in LOGIN_DEVICES]

    def start(self, device: str) -> QrLoginSession:
        self._validate_device(device)
        token = self._qrcode_token()
        data = self._response_data(token)
        uid = str(data.get("uid") or "")
        if not uid:
            raise IntegrationError("115 QR login token did not include uid")
        session = QrLoginSession(
            session_id=secrets.token_urlsafe(24),
            device=device,
            token=data,
            uid=uid,
            qrcode_url=f"{QR_BASE_URL}/api/1.0/web/1.0/qrcode?uid={uid}",
            expires_at=(now_utc() + timedelta(seconds=QR_TTL_SECONDS)).isoformat(),
        )
        with self._lock:
            self._sessions[session.session_id] = session
        return session

    def status(
        self,
        session_id: str,
        settings: SettingsRepository,
    ) -> dict[str, object]:
        session = self._session(session_id)
        if self._is_expired(session):
            self.cancel(session_id)
            return self._status(session, "expired", "二维码已过期")
        response = self._scan_status(session)
        status = self._status_code(response)
        if status == 0:
            return self._status(session, "waiting", "等待扫码")
        if status == 1:
            return self._status(session, "scanned", "已扫码，等待确认")
        if status == 2:
            return self._complete(session, settings)
        if status == -1:
            self.cancel(session_id)
            return self._status(session, "expired", "二维码已过期")
        if status == -2:
            self.cancel(session_id)
            return self._status(session, "cancelled", "扫码已取消")
        raise IntegrationError(f"115 QR login returned unknown status: {status}")

    def cancel(self, session_id: str) -> None:
        with self._lock:
            self._sessions.pop(session_id, None)

    def _complete(
        self,
        session: QrLoginSession,
        settings: SettingsRepository,
    ) -> dict[str, object]:
        result = self._scan_result(session)
        cookie = self._cookie_from_result(result)
        settings.upsert("p115_cookie", cookie, False)
        account = P115CloudClient(cookie).account_info()
        self.cancel(session.session_id)
        return {
            **self._status(session, "succeeded", "115 登录成功"),
            "account": asdict(account),
        }

    def _session(self, session_id: str) -> QrLoginSession:
        with self._lock:
            session = self._sessions.get(session_id)
        if session is None:
            raise NotFoundError(f"115 QR login session not found: {session_id}")
        return session

    def _validate_device(self, device: str) -> None:
        if device not in {str(item["value"]) for item in LOGIN_DEVICES}:
            raise ValidationAppError(f"Unsupported 115 login device: {device}")

    def _qrcode_token(self) -> dict[str, Any]:
        try:
            from p115client import P115Client

            return P115Client.login_qrcode_token()
        except Exception as exc:
            raise IntegrationError(f"115 QR login token failed: {exc}") from exc

    def _scan_status(self, session: QrLoginSession) -> dict[str, Any]:
        try:
            from p115client import P115Client

            return P115Client.login_qrcode_scan_status(session.token)
        except Exception as exc:
            raise IntegrationError(f"115 QR login status failed: {exc}") from exc

    def _scan_result(self, session: QrLoginSession) -> dict[str, Any]:
        try:
            from p115client import P115Client

            return P115Client.login_qrcode_scan_result(session.uid, app=session.device)
        except Exception as exc:
            raise IntegrationError(f"115 QR login result failed: {exc}") from exc

    def _cookie_from_result(self, result: dict[str, Any]) -> str:
        data = self._response_data(result)
        cookie = data.get("cookie")
        if not isinstance(cookie, str) or not cookie.strip():
            raise IntegrationError("115 QR login result did not include cookie")
        return cookie

    def _response_data(self, response: dict[str, Any]) -> dict[str, Any]:
        if response.get("state") is False:
            message = response.get("error") or response.get("message") or response
            raise IntegrationError(f"115 QR login failed: {message}")
        data = response.get("data")
        if not isinstance(data, dict):
            raise IntegrationError("115 QR login response did not include data")
        return data

    def _status_code(self, response: dict[str, Any]) -> int:
        data = self._response_data(response)
        status = data.get("status")
        if status is None:
            raise IntegrationError("115 QR login response did not include status")
        return int(status)

    def _is_expired(self, session: QrLoginSession) -> bool:
        return session.expires_at <= now_utc().isoformat()

    def _status(
        self,
        session: QrLoginSession,
        status: str,
        message: str,
    ) -> dict[str, object]:
        return {
            "session_id": session.session_id,
            "status": status,
            "message": message,
            "account": None,
        }


qr_login_manager = P115QrLoginManager()
