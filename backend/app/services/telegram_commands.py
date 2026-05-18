from __future__ import annotations

import hashlib
from collections.abc import Callable
from typing import Any

from app.adapters.telegram import TelegramBotVerifier
from app.repositories.settings import SettingsRepository

COMMANDS_TOKEN_HASH_KEY = "telegram_commands_token_hash"
LAST_UPDATE_ID_KEY = "telegram_last_update_id"
TELEGRAM_CHAT_ID_KEY = "telegram_chat_id"
TELEGRAM_TOKEN_KEY = "telegram_bot_token"
HELP_TEXT = "\n".join(
    [
        "javdb115 可用命令：",
        "/start - 绑定当前会话为通知接收人",
        "/status - 查看系统状态",
        "/check - 立即检查演员订阅",
        "/help - 查看命令说明",
    ]
)


class TelegramCommandService:
    def __init__(
        self,
        settings: SettingsRepository,
        status_provider: Callable[[], str],
        check_runner: Callable[[], None],
    ) -> None:
        self.settings = settings
        self.status_provider = status_provider
        self.check_runner = check_runner

    def poll(self) -> None:
        token = self.settings.get(TELEGRAM_TOKEN_KEY)
        if not token:
            return
        bot = TelegramBotVerifier(token)
        self._ensure_commands(bot, token)
        updates = bot.get_updates(self._next_offset())
        for update in updates:
            self._handle_update(bot, update)
        self._save_next_offset(updates)

    def _ensure_commands(self, bot: TelegramBotVerifier, token: str) -> None:
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        if self.settings.get(COMMANDS_TOKEN_HASH_KEY) == token_hash:
            return
        bot.set_commands()
        self.settings.upsert(COMMANDS_TOKEN_HASH_KEY, token_hash, True)

    def _next_offset(self) -> int | None:
        raw = self.settings.get(LAST_UPDATE_ID_KEY)
        return int(raw) + 1 if raw else None

    def _save_next_offset(self, updates: list[dict[str, Any]]) -> None:
        update_ids = [item.get("update_id") for item in updates]
        numeric_ids = [item for item in update_ids if isinstance(item, int)]
        if numeric_ids:
            self.settings.upsert(LAST_UPDATE_ID_KEY, str(max(numeric_ids)), False)

    def _handle_update(self, bot: TelegramBotVerifier, update: dict[str, Any]) -> None:
        message = update.get("message")
        if not isinstance(message, dict):
            return
        chat_id = self._chat_id(message)
        command = self._command(message)
        if not chat_id or not command:
            return
        self._run_command(bot, chat_id, command)

    def _run_command(self, bot: TelegramBotVerifier, chat_id: str, command: str) -> None:
        if command == "start":
            self.settings.upsert(TELEGRAM_CHAT_ID_KEY, chat_id, False)
            bot.send_message(chat_id, "已绑定当前会话为 javdb115 通知接收人。\n\n" + HELP_TEXT)
            return
        if command == "help":
            bot.send_message(chat_id, HELP_TEXT)
            return
        if command == "status":
            bot.send_message(chat_id, self.status_provider())
            return
        if command == "check":
            self._run_check_command(bot, chat_id)
            return
        bot.send_message(chat_id, HELP_TEXT)

    def _run_check_command(self, bot: TelegramBotVerifier, chat_id: str) -> None:
        bot.send_message(chat_id, "已开始检查演员订阅。")
        self.check_runner()
        bot.send_message(chat_id, "演员订阅检查完成。")

    def _chat_id(self, message: dict[str, Any]) -> str | None:
        chat = message.get("chat")
        if not isinstance(chat, dict):
            return None
        chat_id = chat.get("id")
        return str(chat_id) if isinstance(chat_id, int | str) else None

    def _command(self, message: dict[str, Any]) -> str | None:
        text = message.get("text")
        if not isinstance(text, str) or not text.startswith("/"):
            return None
        first_word = text.split(maxsplit=1)[0]
        return first_word.removeprefix("/").split("@", maxsplit=1)[0].lower()
