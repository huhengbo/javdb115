from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from .config import AppConfig


def now_utc() -> datetime:
    return datetime.now(UTC)


def iso_now() -> str:
    return now_utc().isoformat()


def hash_secret(value: str, secret_key: str) -> str:
    digest = hmac.new(secret_key.encode(), value.encode(), hashlib.sha256).hexdigest()
    return digest


def verify_password(input_password: str, config: AppConfig) -> bool:
    return hmac.compare_digest(input_password, config.admin_password)


def new_session_token() -> str:
    return secrets.token_urlsafe(48)


def session_expiry(config: AppConfig) -> str:
    expires_at = now_utc() + timedelta(hours=config.session_ttl_hours)
    return expires_at.isoformat()


def is_expired(expires_at: str) -> bool:
    parsed = datetime.fromisoformat(expires_at)
    return parsed <= now_utc()
