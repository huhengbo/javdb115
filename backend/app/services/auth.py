from __future__ import annotations

from app.config import AppConfig
from app.errors import AuthError
from app.repositories.sessions import SessionsRepository
from app.security import (
    LoginRateLimiter,
    hash_secret,
    is_expired,
    iso_now,
    login_rate_limiter,
    new_session_token,
    session_expiry,
    verify_password,
    verify_username,
)


class AuthService:
    def __init__(
        self,
        sessions: SessionsRepository,
        config: AppConfig,
        limiter: LoginRateLimiter = login_rate_limiter,
    ) -> None:
        self.sessions = sessions
        self.config = config
        self.limiter = limiter

    def login(self, username: str, password: str, client_key: str | None = None) -> str:
        limiter_key = None if client_key is None else f"{client_key}:{username.casefold()}"
        if limiter_key is not None:
            self.limiter.check(limiter_key)

        valid_user = verify_username(username, self.config)
        if not valid_user or not verify_password(password, self.config):
            if limiter_key is not None:
                self.limiter.record_failure(limiter_key)
            raise AuthError("Invalid username or password")

        if limiter_key is not None:
            self.limiter.record_success(limiter_key)
        self.sessions.purge_expired(iso_now())
        token = new_session_token()
        token_hash = hash_secret(token, self.config.secret_key)
        self.sessions.create(token_hash, session_expiry(self.config))
        return token

    def verify(self, token: str | None) -> str:
        if not token:
            raise AuthError()
        token_hash = hash_secret(token, self.config.secret_key)
        expires_at = self.sessions.get_expiry(token_hash)
        if expires_at is None:
            raise AuthError()
        if is_expired(expires_at):
            self.sessions.delete(token_hash)
            raise AuthError()
        return self.config.admin_username

    def logout(self, token: str) -> None:
        self.sessions.delete(hash_secret(token, self.config.secret_key))
