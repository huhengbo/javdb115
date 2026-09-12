from __future__ import annotations

from sqlite3 import Connection

from fastapi import APIRouter, Depends, Request, Response

from app.config import AppConfig
from app.contracts import LoginRequest, LoginResponse
from app.dependencies import get_config, get_connection, get_token, require_user
from app.repositories.sessions import SessionsRepository
from app.services.auth import AuthService

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    connection: Connection = Depends(get_connection),
    config: AppConfig = Depends(get_config),
) -> LoginResponse:
    client_host = request.client.host if request.client else "unknown"
    service = AuthService(SessionsRepository(connection), config)
    token = service.login(payload.username, payload.password, client_key=client_host)
    response.set_cookie(
        key=config.session_cookie_name,
        value=token,
        max_age=config.session_ttl_hours * 60 * 60,
        httponly=True,
        secure=config.session_cookie_secure,
        samesite="lax",
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"
    return LoginResponse(username=config.admin_username)


@router.get("/me")
def me(username: str = Depends(require_user)) -> dict[str, str]:
    return {"username": username}


@router.post("/logout")
def logout(
    response: Response,
    token: str = Depends(get_token),
    connection: Connection = Depends(get_connection),
    config: AppConfig = Depends(get_config),
) -> dict[str, bool]:
    AuthService(SessionsRepository(connection), config).logout(token)
    response.delete_cookie(
        key=config.session_cookie_name,
        path="/",
        secure=config.session_cookie_secure,
        httponly=True,
        samesite="lax",
    )
    response.headers["Cache-Control"] = "no-store"
    return {"ok": True}
