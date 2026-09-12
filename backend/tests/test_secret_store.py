from __future__ import annotations

from pathlib import Path

import pytest

from app.database import Database
from app.repositories.settings import SettingsRepository
from app.secret_store import SECRET_VALUE_PREFIX, SecretDecryptionError


def test_secret_setting_is_encrypted_at_rest(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("APP_SECRET_KEY", "test-secret-key-one")
    database = Database(tmp_path / "app.sqlite3")
    database.initialize()

    with database.connect() as connection:
        repository = SettingsRepository(connection)
        repository.upsert("p115_cookie", "UID=abc;CID=def;", True)
        raw = connection.execute(
            "SELECT value FROM settings WHERE key = 'p115_cookie'"
        ).fetchone()
        assert raw is not None
        stored = str(raw["value"])
        assert stored.startswith(SECRET_VALUE_PREFIX)
        assert "UID=abc" not in stored
        assert repository.get("p115_cookie") == "UID=abc;CID=def;"


def test_initialize_encrypts_legacy_plaintext_secret(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.delenv("APP_SECRET_KEY", raising=False)
    database = Database(tmp_path / "app.sqlite3")
    database.initialize()

    with database.connect() as connection:
        SettingsRepository(connection).upsert("telegram_bot_token", "legacy-token", True)
        raw = connection.execute(
            "SELECT value FROM settings WHERE key = 'telegram_bot_token'"
        ).fetchone()
        assert raw is not None
        assert str(raw["value"]) == "legacy-token"

    monkeypatch.setenv("APP_SECRET_KEY", "migration-secret-key")
    database.initialize()

    with database.connect() as connection:
        raw = connection.execute(
            "SELECT value FROM settings WHERE key = 'telegram_bot_token'"
        ).fetchone()
        assert raw is not None
        assert str(raw["value"]).startswith(SECRET_VALUE_PREFIX)
        assert SettingsRepository(connection).get("telegram_bot_token") == "legacy-token"


def test_encrypted_secret_rejects_wrong_app_secret_key(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    database = Database(tmp_path / "app.sqlite3")
    monkeypatch.setenv("APP_SECRET_KEY", "original-secret-key")
    database.initialize()

    with database.connect() as connection:
        SettingsRepository(connection).upsert("p115_cookie", "UID=abc;", True)

    monkeypatch.setenv("APP_SECRET_KEY", "different-secret-key")
    with database.connect() as connection:
        with pytest.raises(SecretDecryptionError):
            SettingsRepository(connection).get("p115_cookie")
