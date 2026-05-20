from __future__ import annotations

import hashlib
from collections.abc import Callable
from typing import Any, Protocol

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
        "直接发送番号 - 查询作品并订阅下载整理",
        "/help - 查看命令说明",
    ]
)
MOVIE_SUBSCRIBE_PREFIX = "movie_sub:"


class TelegramMovieJobRunner(Protocol):
    def enqueue_lookup(self, bot_token: str, chat_id: str, query: str) -> None: ...
    def enqueue_subscribe(self, bot_token: str, chat_id: str, movie_id: str) -> None: ...


class TelegramCommandService:
    def __init__(
        self,
        settings: SettingsRepository,
        status_provider: Callable[[], str],
        check_runner: Callable[[], None],
        movie_jobs: TelegramMovieJobRunner | None = None,
    ) -> None:
        self.settings = settings
        self.status_provider = status_provider
        self.check_runner = check_runner
        self.movie_jobs = movie_jobs

    def poll(self) -> None:
        token = self.settings.get(TELEGRAM_TOKEN_KEY)
        if not token:
            return
        bot = TelegramBotVerifier(token)
        self._ensure_commands(bot, token)
        updates = bot.get_updates(self._next_offset())
        for update in updates:
            self._handle_update(bot, token, update)
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

    def _handle_update(
        self,
        bot: TelegramBotVerifier,
        bot_token: str,
        update: dict[str, Any],
    ) -> None:
        callback_query = update.get("callback_query")
        if isinstance(callback_query, dict):
            self._handle_callback_query(bot, bot_token, callback_query)
            return
        message = update.get("message")
        if not isinstance(message, dict):
            return
        chat_id = self._chat_id(message)
        command = self._command(message)
        text = self._message_text(message)
        if not chat_id or not text:
            return
        if command:
            self._run_command(bot, chat_id, command)
            return
        self._run_movie_lookup(bot, bot_token, chat_id, text)

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

    def _run_movie_lookup(
        self,
        bot: TelegramBotVerifier,
        bot_token: str,
        chat_id: str,
        text: str,
    ) -> None:
        if self.movie_jobs is None:
            bot.send_message(chat_id, "作品查询功能未启用。")
            return
        bot.send_message(chat_id, f"正在搜索：{text}")
        self.movie_jobs.enqueue_lookup(bot_token, chat_id, text)

    def _handle_callback_query(
        self,
        bot: TelegramBotVerifier,
        bot_token: str,
        callback_query: dict[str, Any],
    ) -> None:
        callback_id = self._callback_id(callback_query)
        chat_id = self._callback_chat_id(callback_query)
        data = callback_query.get("data")
        if not isinstance(data, str) or not callback_id:
            return
        if data.startswith(MOVIE_SUBSCRIBE_PREFIX):
            self._subscribe_movie_callback(bot, bot_token, callback_id, chat_id, data)
            return
        bot.answer_callback_query(callback_id, "未知操作")

    def _subscribe_movie_callback(
        self,
        bot: TelegramBotVerifier,
        bot_token: str,
        callback_id: str,
        chat_id: str | None,
        data: str,
    ) -> None:
        bot.answer_callback_query(callback_id, "开始处理")
        if self.movie_jobs is None or not chat_id:
            return
        movie_id = data.removeprefix(MOVIE_SUBSCRIBE_PREFIX)
        bot.send_message(chat_id, "已收到订阅下载整理请求，正在后台处理。")
        self.movie_jobs.enqueue_subscribe(bot_token, chat_id, movie_id)

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

    def _message_text(self, message: dict[str, Any]) -> str | None:
        text = message.get("text")
        if not isinstance(text, str):
            return None
        stripped = text.strip()
        return stripped or None

    def _callback_id(self, callback_query: dict[str, Any]) -> str | None:
        callback_id = callback_query.get("id")
        return str(callback_id) if isinstance(callback_id, int | str) else None

    def _callback_chat_id(self, callback_query: dict[str, Any]) -> str | None:
        message = callback_query.get("message")
        return self._chat_id(message) if isinstance(message, dict) else None
