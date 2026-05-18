from __future__ import annotations

from dataclasses import dataclass

from fastapi import Request
from fastapi.responses import JSONResponse


@dataclass(frozen=True)
class AppError(Exception):
    status_code: int
    code: str
    message: str


class NotFoundError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(404, "not_found", message)


class ValidationAppError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(400, "validation_error", message)


class IntegrationError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(502, "integration_error", message)


class JavdbAccessBlockedError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(502, "JAVDB_ACCESS_BLOCKED", message)


class AuthError(AppError):
    def __init__(self, message: str = "Authentication required") -> None:
        super().__init__(401, "auth_error", message)


async def app_error_handler(_: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, AppError):
        raise exc
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message}},
    )
