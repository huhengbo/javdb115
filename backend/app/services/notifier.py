from __future__ import annotations

from app.adapters.telegram import TelegramBotVerifier, TelegramNotifier
from app.errors import ValidationAppError
from app.javdb_models import JavdbWork
from app.repositories.settings import SettingsRepository


class NotificationService:
    def __init__(self, settings: SettingsRepository) -> None:
        self.settings = settings

    def send_submitted(self, work: JavdbWork, size_label: str) -> None:
        notifier = self._notifier_or_none()
        if notifier is None:
            return
        caption = self._caption("已提交 115", work, size_label)
        notifier.send_card(work.title or work.code, caption, work.cover_url)

    def send_failed(self, title: str, stage: str, message: str) -> None:
        notifier = self._notifier_or_none()
        if notifier is None:
            return
        notifier.send_card(title, f"状态: 失败\n阶段: {stage}\n原因: {message}")

    def send_completed(self, work: JavdbWork, cloud_file_id: str) -> None:
        notifier = self._notifier_or_none()
        if notifier is None:
            return
        caption = self._caption("整理完成", work, "已完成")
        notifier.send_card(
            work.title or work.code,
            f"{caption}\n目录 ID: {cloud_file_id}",
            work.cover_url,
        )

    def send_test(self, message: str | None = None) -> str:
        token = self.settings.get("telegram_bot_token")
        if not token:
            raise ValidationAppError("Telegram Bot Token 不能为空")
        verifier = TelegramBotVerifier(token)
        bot = verifier.get_me()
        verifier.set_commands()
        name = f"@{bot.username}" if bot.username else bot.first_name
        return message or f"Telegram Bot 连接正常：{name}"

    def _notifier_or_none(self) -> TelegramNotifier | None:
        token = self.settings.get("telegram_bot_token")
        chat_id = self.settings.get("telegram_chat_id")
        if not token or not chat_id:
            return None
        return TelegramNotifier(token, chat_id)

    def _caption(self, status: str, work: JavdbWork, size_label: str) -> str:
        actors = ", ".join(work.actors) if work.actors else "未知"
        lines = [
            f"状态: {status}",
            f"番号: {work.code}",
            f"名称: {work.title or '未知'}",
            f"演员: {actors}",
            f"大小: {size_label}",
        ]
        return "\n".join(lines)
