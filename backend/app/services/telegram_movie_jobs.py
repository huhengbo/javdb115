from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from sqlite3 import Connection
from typing import Protocol, TypeVar

from app.adapters.javdb_api import JavdbApiClient
from app.adapters.telegram import TelegramBotVerifier
from app.database import Database
from app.repositories.actors import ActorsRepository
from app.repositories.catalog import CatalogRepository
from app.repositories.follows import FollowsRepository
from app.repositories.logs import LogsRepository
from app.repositories.settings import SettingsRepository
from app.repositories.tasks import TasksRepository
from app.services.telegram_commands import MOVIE_SUBSCRIBE_PREFIX
from app.services.telegram_movies import (
    TelegramMovieCard,
    TelegramMovieDependencies,
    TelegramMovieJavdbClient,
    TelegramMovieService,
)

LOGGER = logging.getLogger(__name__)
JobResult = TypeVar("JobResult")


class TelegramMovieBot(Protocol):
    def send_message(
        self,
        chat_id: str,
        text: str,
        reply_markup: dict[str, object] | None = None,
    ) -> None: ...

    def send_photo(
        self,
        chat_id: str,
        photo: str,
        caption: str,
        reply_markup: dict[str, object] | None = None,
    ) -> None: ...


@dataclass(frozen=True)
class TelegramMovieJobDependencies:
    database_path: Path
    javdb_factory: Callable[[], TelegramMovieJavdbClient] = JavdbApiClient
    bot_factory: Callable[[str], TelegramMovieBot] = TelegramBotVerifier


class TelegramMovieJobRunner:
    def __init__(self, dependencies: TelegramMovieJobDependencies) -> None:
        self.database_path = dependencies.database_path
        self.javdb_factory = dependencies.javdb_factory
        self.bot_factory = dependencies.bot_factory

    def enqueue_lookup(self, bot_token: str, chat_id: str, query: str) -> None:
        self._start_thread(
            "telegram-movie-lookup",
            self._lookup_and_notify,
            bot_token,
            chat_id,
            query,
        )

    def enqueue_subscribe(self, bot_token: str, chat_id: str, movie_id: str) -> None:
        self._start_thread(
            "telegram-movie-subscribe",
            self._subscribe_and_notify,
            bot_token,
            chat_id,
            movie_id,
        )

    def _start_thread(self, name: str, target: Callable[..., None], *args: object) -> None:
        thread = threading.Thread(
            target=self._run_job,
            name=name,
            args=(target, *args),
            daemon=True,
        )
        thread.start()

    def _run_job(self, target: Callable[..., None], *args: object) -> None:
        try:
            target(*args)
        except Exception:
            LOGGER.exception("Telegram movie background job failed")

    def _lookup_and_notify(self, bot_token: str, chat_id: str, query: str) -> None:
        bot = self.bot_factory(bot_token)
        try:
            card = self._with_service(lambda service: service.lookup(query))
        except Exception as exc:
            bot.send_message(chat_id, f"搜索失败：{exc}")
            raise
        if card is None:
            bot.send_message(chat_id, f"没有找到作品：{query}")
            return
        self._send_card(bot, chat_id, card)

    def _subscribe_and_notify(self, bot_token: str, chat_id: str, movie_id: str) -> None:
        bot = self.bot_factory(bot_token)
        bot.send_message(chat_id, "正在查询作品详情、选择磁力并提交 115。")
        try:
            message = self._with_service(lambda service: service.subscribe(movie_id))
        except Exception as exc:
            bot.send_message(chat_id, f"订阅下载整理失败：{exc}")
            raise
        bot.send_message(chat_id, message)

    def _with_service(
        self,
        action: Callable[[TelegramMovieService], JobResult],
    ) -> JobResult:
        database = Database(self.database_path)
        with database.connect() as connection:
            result = action(self._service(connection))
            connection.commit()
            return result

    def _service(self, connection: Connection) -> TelegramMovieService:
        return TelegramMovieService(
            TelegramMovieDependencies(
                actors=ActorsRepository(connection),
                catalog=CatalogRepository(connection),
                follows=FollowsRepository(connection),
                logs=LogsRepository(connection),
                settings=SettingsRepository(connection),
                tasks=TasksRepository(connection),
                javdb=self.javdb_factory(),
            )
        )

    def _send_card(
        self,
        bot: TelegramMovieBot,
        chat_id: str,
        card: TelegramMovieCard,
    ) -> None:
        reply_markup = self._movie_reply_markup(card)
        if card.cover_url:
            bot.send_photo(chat_id, card.cover_url, card.caption, reply_markup)
            return
        bot.send_message(chat_id, card.caption, reply_markup)

    def _movie_reply_markup(self, card: TelegramMovieCard) -> dict[str, object]:
        return {
            "inline_keyboard": [
                [
                    {
                        "text": "订阅下载整理",
                        "callback_data": f"{MOVIE_SUBSCRIBE_PREFIX}{card.movie_id}",
                    }
                ],
                [{"text": "打开 JavDB", "url": card.source_url}],
            ]
        }
