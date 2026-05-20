from __future__ import annotations

from pathlib import Path

from app.adapters.telegram import TelegramBotInfo
from app.database import Database
from app.errors import IntegrationError, ValidationAppError
from app.javdb_models import JavdbWork
from app.repositories.settings import SettingsRepository
from app.services.notifier import NotificationService
from app.services.settings import (
    DEFAULT_CHECK_CRON,
    DEFAULT_FILTER_RULES_JSON,
    SettingsService,
)
from app.services.telegram_commands import TelegramCommandService


def test_public_settings_include_defaults_and_hide_obsolete_keys(tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    repository = SettingsRepository(connection)
    repository.upsert("javdb_base_url", "https://javdb.com", False)
    repository.upsert("javdb_cookie", "old-cookie", True)

    settings = by_key(SettingsService(repository).list_public())

    assert settings["check_cron"]["value"] == DEFAULT_CHECK_CRON
    assert settings["filter_rules"]["value"] == DEFAULT_FILTER_RULES_JSON
    assert "javdb_base_url" not in settings
    assert "javdb_cookie" not in settings


def test_public_settings_reveal_p115_cookie(tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    repository = SettingsRepository(connection)
    repository.upsert("p115_cookie", "UID=abc;", True)

    settings = by_key(SettingsService(repository).list_public())

    assert settings["p115_cookie"]["value"] == "UID=abc;"


def test_update_ignores_obsolete_javdb_settings(tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    repository = SettingsRepository(connection)

    SettingsService(repository).update(
        [
            ("javdb_base_url", "https://javdb.com", False),
            ("check_cron", "0 */6 * * *", False),
        ]
    )

    assert repository.get("javdb_base_url") is None
    assert repository.get("check_cron") == "0 */6 * * *"


def test_telegram_test_requires_saved_settings(tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()

    try:
        NotificationService(SettingsRepository(connection)).send_test()
    except ValidationAppError as exc:
        assert exc.message == "Telegram Bot Token 不能为空"
    else:
        raise AssertionError("missing Telegram settings should fail")


def test_telegram_test_verifies_saved_token_and_configures_commands(
    monkeypatch,
    tmp_path: Path,
) -> None:
    connection = setup_database(tmp_path).connect()
    repository = SettingsRepository(connection)
    repository.upsert("telegram_bot_token", "bot-token", True)
    calls: list[str] = []

    class FakeTelegramBotVerifier:
        def __init__(self, bot_token: str) -> None:
            assert bot_token == "bot-token"

        def get_me(self) -> TelegramBotInfo:
            calls.append("get_me")
            return TelegramBotInfo(id=1, first_name="JavDB115", username="javdb115_bot")

        def set_commands(self) -> None:
            calls.append("set_commands")

    monkeypatch.setattr("app.services.notifier.TelegramBotVerifier", FakeTelegramBotVerifier)

    message = NotificationService(repository).send_test()

    assert message == "Telegram Bot 连接正常：@javdb115_bot"
    assert calls == ["get_me", "set_commands"]


def test_telegram_test_can_use_custom_success_message(monkeypatch, tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    repository = SettingsRepository(connection)
    repository.upsert("telegram_bot_token", "bot-token", True)

    class FakeTelegramBotVerifier:
        def __init__(self, bot_token: str) -> None:
            assert bot_token == "bot-token"

        def get_me(self) -> TelegramBotInfo:
            return TelegramBotInfo(id=1, first_name="JavDB115", username=None)

        def set_commands(self) -> None:
            return None

    monkeypatch.setattr("app.services.notifier.TelegramBotVerifier", FakeTelegramBotVerifier)

    assert NotificationService(repository).send_test("连接正常") == "连接正常"


def test_notification_maps_tp_cover_to_external_image_url(monkeypatch, tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    repository = SettingsRepository(connection)
    repository.upsert("telegram_bot_token", "bot-token", True)
    repository.upsert("telegram_chat_id", "chat-id", False)
    sent: list[tuple[str, str, str | None]] = []

    class FakeTelegramNotifier:
        def __init__(self, bot_token: str, chat_id: str) -> None:
            assert bot_token == "bot-token"
            assert chat_id == "chat-id"

        def send_card(self, title: str, caption: str, cover_url: str | None = None) -> None:
            sent.append((title, caption, cover_url))

    monkeypatch.setattr("app.services.notifier.TelegramNotifier", FakeTelegramNotifier)

    NotificationService(repository).send_submitted(
        JavdbWork(
            code="SAME-234",
            title="Sample",
            cover_url="https://tp.cmastd.com/rhe951l4q/covers/yx/yx5O9r.jpg",
            release_date="2026-05-20",
            source_url="https://javdb.com/v/yx5O9r",
            actors=[],
            magnets=[],
        ),
        "1.00 GB",
    )

    assert sent[0][2] == "https://c0.jdbstatic.com/covers/yx/yx5O9r.jpg"


def test_telegram_commands_bind_start_and_save_offset(monkeypatch, tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    repository = SettingsRepository(connection)
    repository.upsert("telegram_bot_token", "bot-token", True)
    sent: list[tuple[str, str]] = []
    commands_configured: list[bool] = []

    class FakeTelegramBotVerifier:
        def __init__(self, bot_token: str) -> None:
            assert bot_token == "bot-token"

        def set_commands(self) -> None:
            commands_configured.append(True)

        def get_updates(self, offset: int | None = None) -> list[dict]:
            assert offset is None
            return [
                {
                    "update_id": 9,
                    "message": {"chat": {"id": 123}, "text": "/start"},
                }
            ]

        def send_message(self, chat_id: str, text: str) -> None:
            sent.append((chat_id, text))

    monkeypatch.setattr(
        "app.services.telegram_commands.TelegramBotVerifier",
        FakeTelegramBotVerifier,
    )

    TelegramCommandService(repository, lambda: "状态", lambda: None).poll()

    assert commands_configured == [True]
    assert repository.get("telegram_chat_id") == "123"
    assert repository.get("telegram_last_update_id") == "9"
    assert sent[0][0] == "123"
    assert "已绑定当前会话" in sent[0][1]


def test_telegram_commands_status_and_check(monkeypatch, tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    repository = SettingsRepository(connection)
    repository.upsert("telegram_bot_token", "bot-token", True)
    repository.upsert("telegram_last_update_id", "9", False)
    sent: list[tuple[str, str]] = []
    checked: list[bool] = []

    class FakeTelegramBotVerifier:
        def __init__(self, bot_token: str) -> None:
            assert bot_token == "bot-token"

        def set_commands(self) -> None:
            return None

        def get_updates(self, offset: int | None = None) -> list[dict]:
            assert offset == 10
            return [
                {"update_id": 10, "message": {"chat": {"id": "abc"}, "text": "/status"}},
                {"update_id": 11, "message": {"chat": {"id": "abc"}, "text": "/check"}},
            ]

        def send_message(self, chat_id: str, text: str) -> None:
            sent.append((chat_id, text))

    monkeypatch.setattr(
        "app.services.telegram_commands.TelegramBotVerifier",
        FakeTelegramBotVerifier,
    )

    TelegramCommandService(repository, lambda: "系统正常", lambda: checked.append(True)).poll()

    assert checked == [True]
    assert repository.get("telegram_last_update_id") == "11"
    assert sent == [
        ("abc", "系统正常"),
        ("abc", "已开始检查演员订阅。"),
        ("abc", "演员订阅检查完成。"),
    ]


def test_telegram_plain_text_enqueues_movie_lookup(monkeypatch, tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    repository = SettingsRepository(connection)
    repository.upsert("telegram_bot_token", "bot-token", True)
    sent: list[tuple[str, str]] = []
    jobs = FakeMovieJobs()

    class FakeTelegramBotVerifier:
        def __init__(self, bot_token: str) -> None:
            assert bot_token == "bot-token"

        def set_commands(self) -> None:
            return None

        def get_updates(self, offset: int | None = None) -> list[dict]:
            return [{"update_id": 12, "message": {"chat": {"id": "abc"}, "text": "ABC-123"}}]

        def send_message(self, chat_id: str, text: str) -> None:
            sent.append((chat_id, text))

    monkeypatch.setattr(
        "app.services.telegram_commands.TelegramBotVerifier",
        FakeTelegramBotVerifier,
    )

    TelegramCommandService(
        repository,
        lambda: "状态",
        lambda: None,
        movie_jobs=jobs,
    ).poll()

    assert sent == [("abc", "正在搜索：ABC-123")]
    assert jobs.lookups == [("bot-token", "abc", "ABC-123")]


def test_telegram_movie_subscribe_callback(monkeypatch, tmp_path: Path) -> None:
    connection = setup_database(tmp_path).connect()
    repository = SettingsRepository(connection)
    repository.upsert("telegram_bot_token", "bot-token", True)
    sent: list[tuple[str, str]] = []
    answered: list[tuple[str, str | None]] = []
    jobs = FakeMovieJobs()

    class FakeTelegramBotVerifier:
        def __init__(self, bot_token: str) -> None:
            assert bot_token == "bot-token"

        def set_commands(self) -> None:
            return None

        def get_updates(self, offset: int | None = None) -> list[dict]:
            return [
                {
                    "update_id": 13,
                    "callback_query": {
                        "id": "callback-1",
                        "data": "movie_sub:movie-1",
                        "message": {"chat": {"id": "abc"}},
                    },
                }
            ]

        def answer_callback_query(self, callback_query_id: str, text: str | None = None) -> None:
            answered.append((callback_query_id, text))

        def send_message(self, chat_id: str, text: str) -> None:
            sent.append((chat_id, text))

    monkeypatch.setattr(
        "app.services.telegram_commands.TelegramBotVerifier",
        FakeTelegramBotVerifier,
    )

    TelegramCommandService(repository, lambda: "状态", lambda: None, movie_jobs=jobs).poll()

    assert jobs.subscribes == [("bot-token", "abc", "movie-1")]
    assert answered == [("callback-1", "开始处理")]
    assert sent == [("abc", "已收到订阅下载整理请求，正在后台处理。")]


def test_telegram_expired_callback_does_not_block_update_offset(
    monkeypatch,
    tmp_path: Path,
) -> None:
    connection = setup_database(tmp_path).connect()
    repository = SettingsRepository(connection)
    repository.upsert("telegram_bot_token", "bot-token", True)
    sent: list[tuple[str, str]] = []
    jobs = FakeMovieJobs()

    class FakeTelegramBotVerifier:
        def __init__(self, bot_token: str) -> None:
            assert bot_token == "bot-token"

        def set_commands(self) -> None:
            return None

        def get_updates(self, offset: int | None = None) -> list[dict]:
            return [
                {
                    "update_id": 14,
                    "callback_query": {
                        "id": "old-callback",
                        "data": "movie_sub:movie-1",
                        "message": {"chat": {"id": "abc"}},
                    },
                }
            ]

        def answer_callback_query(self, callback_query_id: str, text: str | None = None) -> None:
            raise IntegrationError("Telegram answerCallbackQuery failed: query is too old")

        def send_message(self, chat_id: str, text: str) -> None:
            sent.append((chat_id, text))

    monkeypatch.setattr(
        "app.services.telegram_commands.TelegramBotVerifier",
        FakeTelegramBotVerifier,
    )

    TelegramCommandService(repository, lambda: "状态", lambda: None, movie_jobs=jobs).poll()

    assert repository.get("telegram_last_update_id") == "14"
    assert jobs.subscribes == [("bot-token", "abc", "movie-1")]
    assert sent == [("abc", "已收到订阅下载整理请求，正在后台处理。")]


class FakeMovieJobs:
    def __init__(self) -> None:
        self.lookups: list[tuple[str, str, str]] = []
        self.subscribes: list[tuple[str, str, str]] = []

    def enqueue_lookup(self, bot_token: str, chat_id: str, query: str) -> None:
        self.lookups.append((bot_token, chat_id, query))

    def enqueue_subscribe(self, bot_token: str, chat_id: str, movie_id: str) -> None:
        self.subscribes.append((bot_token, chat_id, movie_id))


def by_key(items: list[dict[str, object]]) -> dict[str, dict[str, object]]:
    return {str(item["key"]): item for item in items}


def setup_database(tmp_path: Path) -> Database:
    database = Database(tmp_path / "test.sqlite3")
    database.initialize()
    return database
