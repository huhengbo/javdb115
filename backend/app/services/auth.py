from __future__ import annotations

from app.config import AppConfig
from app.errors import AuthError
from app.repositories.sessions import SessionsRepository
from app.security import hash_secret, is_expired, new_session_token, session_expiry, verify_password


class AuthService:
    def __init__(self, sessions: SessionsRepository, config: AppConfig) -> None:
        self.sessions = sessions
        self.config = config

    def login(self, username: str, password: str) -> str:
        valid_user = username == self.config.admin_username
        if not valid_user or not verify_password(password, self.config):
            raise AuthError("Invalid username or password")
        token = new_session_token()
        token_hash = hash_secret(token, self.config.secret_key)
        self.sessions.create(token_hash, session_expiry(self.config))
        return token

    def verify(self, token: str | None) -> str:
        if not token:
            raise AuthError()
        token_hash = hash_secret(token, self.config.secret_key)
        expires_at = self.sessions.get_expiry(token_hash)
        if expires_at is None or is_expired(expires_at):
            raise AuthError()
        return self.config.admin_username

    def logout(self, token: str) -> None:
        self.sessions.delete(hash_secret(token, self.config.secret_key))
