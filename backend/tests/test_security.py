from __future__ import annotations

from pathlib import Path

import pytest

from app.config import AppConfig
from app.database import Database
from app.errors import AuthError, RateLimitError
from app.repositories.sessions import SessionsRepository
from app.security import LoginRateLimiter
from app.services.auth import AuthService


def test_login_rate_limiter_locks_and_recovers() -> None:
    now = [100.0]
    limiter = LoginRateLimiter(
        max_failures=3,
        window_seconds=60,
        lock_seconds=120,
        clock=lambda: now[0],
    )

    limiter.record_failure("client:admin")
    limiter.record_failure("client:admin")
    with pytest.raises(RateLimitError):
        limiter.record_failure("client:admin")
    with pytest.raises(RateLimitError):
        limiter.check("client:admin")

    now[0] += 121
    limiter.check("client:admin")


def test_auth_service_creates_verifies_and_revokes_session(tmp_path: Path) -> None:
    database = Database(tmp_path / "auth.sqlite3")
    database.initialize()
    config = AppConfig(
        database_path=database.path,
        admin_username="admin",
        admin_password="correct-password",
        secret_key="test-secret-key",
        session_ttl_hours=24,
    )
    limiter = LoginRateLimiter(max_failures=5)

    with database.connect() as connection:
        service = AuthService(SessionsRepository(connection), config, limiter=limiter)
        token = service.login("admin", "correct-password", client_key="127.0.0.1")
        assert service.verify(token) == "admin"
        service.logout(token)
        with pytest.raises(AuthError):
            service.verify(token)


def test_auth_service_limits_repeated_invalid_passwords(tmp_path: Path) -> None:
    database = Database(tmp_path / "auth-rate-limit.sqlite3")
    database.initialize()
    config = AppConfig(
        database_path=database.path,
        admin_username="admin",
        admin_password="correct-password",
        secret_key="test-secret-key",
        session_ttl_hours=24,
    )
    limiter = LoginRateLimiter(max_failures=2, window_seconds=60, lock_seconds=60)

    with database.connect() as connection:
        service = AuthService(SessionsRepository(connection), config, limiter=limiter)
        with pytest.raises(AuthError):
            service.login("admin", "wrong", client_key="127.0.0.1")
        with pytest.raises(RateLimitError):
            service.login("admin", "wrong", client_key="127.0.0.1")
        with pytest.raises(RateLimitError):
            service.login("admin", "correct-password", client_key="127.0.0.1")
