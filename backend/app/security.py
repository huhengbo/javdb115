from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from .config import AppConfig
from .errors import RateLimitError

LOGIN_MAX_FAILURES = 5
LOGIN_WINDOW_SECONDS = 10 * 60
LOGIN_LOCK_SECONDS = 15 * 60


def now_utc() -> datetime:
    return datetime.now(UTC)


def iso_now() -> str:
    return now_utc().isoformat()


def hash_secret(value: str, secret_key: str) -> str:
    digest = hmac.new(secret_key.encode(), value.encode(), hashlib.sha256).hexdigest()
    return digest


def verify_password(input_password: str, config: AppConfig) -> bool:
    return hmac.compare_digest(input_password, config.admin_password)


def verify_username(input_username: str, config: AppConfig) -> bool:
    return hmac.compare_digest(input_username, config.admin_username)


def new_session_token() -> str:
    return secrets.token_urlsafe(48)


def session_expiry(config: AppConfig) -> str:
    expires_at = now_utc() + timedelta(hours=config.session_ttl_hours)
    return expires_at.isoformat()


def is_expired(expires_at: str) -> bool:
    parsed = datetime.fromisoformat(expires_at)
    return parsed <= now_utc()


@dataclass
class LoginFailureState:
    failures: list[float]
    locked_until: float = 0.0


class LoginRateLimiter:
    def __init__(
        self,
        *,
        max_failures: int = LOGIN_MAX_FAILURES,
        window_seconds: int = LOGIN_WINDOW_SECONDS,
        lock_seconds: int = LOGIN_LOCK_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self.lock_seconds = lock_seconds
        self.clock = clock
        self._states: dict[str, LoginFailureState] = {}
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        now = self.clock()
        with self._lock:
            state = self._states.get(key)
            if state is None:
                return
            self._prune(state, now)
            if state.locked_until > now:
                raise RateLimitError()
            if not state.failures:
                self._states.pop(key, None)

    def record_failure(self, key: str) -> None:
        now = self.clock()
        with self._lock:
            state = self._states.setdefault(key, LoginFailureState(failures=[]))
            self._prune(state, now)
            state.failures.append(now)
            if len(state.failures) >= self.max_failures:
                state.locked_until = now + self.lock_seconds
                raise RateLimitError()

    def record_success(self, key: str) -> None:
        with self._lock:
            self._states.pop(key, None)

    def _prune(self, state: LoginFailureState, now: float) -> None:
        cutoff = now - self.window_seconds
        state.failures[:] = [timestamp for timestamp in state.failures if timestamp >= cutoff]
        if state.locked_until <= now:
            state.locked_until = 0.0


login_rate_limiter = LoginRateLimiter()
