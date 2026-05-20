from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from app.errors import IntegrationError

TELEGRAM_API_BASE = "https://api.telegram.org"
TELEGRAM_TIMEOUT_SECONDS = 20
TELEGRAM_COMMANDS = [
    {"command": "start", "description": "绑定 javdb115 通知"},
    {"command": "help", "description": "查看可用命令"},
    {"command": "status", "description": "查看系统状态"},
    {"command": "check", "description": "立即检查演员订阅"},
]


@dataclass(frozen=True)
class TelegramBotInfo:
    id: int
    first_name: str
    username: str | None


class TelegramNotifier:
    def __init__(self, bot_token: str, chat_id: str) -> None:
        if not bot_token or not chat_id:
            raise ValueError("Telegram bot token and chat id are required")
        self.bot_token = bot_token
        self.chat_id = chat_id

    def send_card(self, title: str, caption: str, cover_url: str | None = None) -> None:
        if cover_url:
            self._post(
                "sendPhoto",
                {"chat_id": self.chat_id, "photo": cover_url, "caption": caption},
            )
            return
        self._post("sendMessage", {"chat_id": self.chat_id, "text": f"{title}\n{caption}"})

    def _post(self, method: str, payload: dict[str, object]) -> None:
        url = f"{TELEGRAM_API_BASE}/bot{self.bot_token}/{method}"
        response = httpx.post(url, json=payload, timeout=TELEGRAM_TIMEOUT_SECONDS)
        if response.is_success:
            return
        raise IntegrationError(telegram_response_error(method, response))


class TelegramBotVerifier:
    def __init__(self, bot_token: str) -> None:
        if not bot_token:
            raise ValueError("Telegram bot token is required")
        self.bot_token = bot_token

    def get_me(self) -> TelegramBotInfo:
        result = self._request_result("getMe")
        if not isinstance(result, dict):
            raise IntegrationError("Telegram getMe returned invalid response")
        bot_id = result.get("id")
        first_name = result.get("first_name")
        username = result.get("username")
        if not isinstance(bot_id, int) or not isinstance(first_name, str):
            raise IntegrationError("Telegram getMe returned invalid bot info")
        return TelegramBotInfo(
            id=bot_id,
            first_name=first_name,
            username=username if isinstance(username, str) else None,
        )

    def set_commands(self) -> None:
        self._request_result("setMyCommands", {"commands": TELEGRAM_COMMANDS})

    def get_updates(self, offset: int | None = None) -> list[dict[str, Any]]:
        payload: dict[str, object] = {
            "timeout": 0,
            "allowed_updates": ["message", "callback_query"],
        }
        if offset is not None:
            payload["offset"] = offset
        result = self._request_result("getUpdates", payload)
        if not isinstance(result, list):
            raise IntegrationError("Telegram getUpdates returned invalid response")
        return [item for item in result if isinstance(item, dict)]

    def send_message(
        self,
        chat_id: str,
        text: str,
        reply_markup: dict[str, object] | None = None,
    ) -> None:
        payload: dict[str, object] = {"chat_id": chat_id, "text": text}
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        self._request_result("sendMessage", payload)

    def send_photo(
        self,
        chat_id: str,
        photo: str,
        caption: str,
        reply_markup: dict[str, object] | None = None,
    ) -> None:
        payload: dict[str, object] = {"chat_id": chat_id, "photo": photo, "caption": caption}
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        self._request_result("sendPhoto", payload)

    def answer_callback_query(self, callback_query_id: str, text: str | None = None) -> None:
        payload: dict[str, object] = {"callback_query_id": callback_query_id}
        if text:
            payload["text"] = text
        self._request_result("answerCallbackQuery", payload)

    def _request_result(
        self,
        method: str,
        payload: dict[str, object] | None = None,
    ) -> Any:
        url = f"{TELEGRAM_API_BASE}/bot{self.bot_token}/{method}"
        if payload is None:
            response = httpx.get(url, timeout=TELEGRAM_TIMEOUT_SECONDS)
        else:
            response = httpx.post(url, json=payload, timeout=TELEGRAM_TIMEOUT_SECONDS)
        if not response.is_success:
            raise IntegrationError(telegram_response_error(method, response))
        return self._result_object(method, response)

    def _result_object(
        self,
        method: str,
        response: httpx.Response,
    ) -> Any:
        try:
            payload = response.json()
        except ValueError as exc:
            raise IntegrationError(f"Telegram {method} returned invalid JSON") from exc
        if not isinstance(payload, dict):
            raise IntegrationError(f"Telegram {method} returned invalid response")
        if payload.get("ok") is not True:
            raise IntegrationError(f"Telegram {method} failed")
        return payload.get("result")


def telegram_response_error(method: str, response: httpx.Response) -> str:
    description = telegram_response_description(response)
    detail = f": {description}" if description else ""
    return f"Telegram {method} failed: HTTP {response.status_code}{detail}"


def telegram_response_description(response: httpx.Response) -> str | None:
    try:
        payload = response.json()
    except ValueError:
        return None
    if not isinstance(payload, dict):
        return None
    description = payload.get("description")
    return description if isinstance(description, str) else None
