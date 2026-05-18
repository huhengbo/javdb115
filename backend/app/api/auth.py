from __future__ import annotations

from sqlite3 import Connection

from fastapi import APIRouter, Depends

from app.config import AppConfig
from app.contracts import LoginRequest, LoginResponse
from app.dependencies import get_config, get_connection, get_token, require_user
from app.repositories.sessions import SessionsRepository
from app.services.auth import AuthService

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    connection: Connection = Depends(get_connection),
    config: AppConfig = Depends(get_config),
) -> LoginResponse:
    service = AuthService(SessionsRepository(connection), config)
    token = service.login(payload.username, payload.password)
    return LoginResponse(token=token, username=config.admin_username)


@router.get("/me")
def me(username: str = Depends(require_user)) -> dict[str, str]:
    return {"username": username}


@router.post("/logout")
def logout(
    token: str = Depends(get_token),
    connection: Connection = Depends(get_connection),
    config: AppConfig = Depends(get_config),
) -> dict[str, bool]:
    AuthService(SessionsRepository(connection), config).logout(token)
    return {"ok": True}
