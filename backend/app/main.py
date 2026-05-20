from __future__ import annotations

from collections.abc import Callable
from contextlib import asynccontextmanager
from pathlib import Path
from sqlite3 import Connection
from typing import Any

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse

from app.adapters.javdb_api import JavdbApiClient
from app.api import auth, checks, follows, health, image_proxy, javdb_proxy, settings, tasks
from app.config import load_config
from app.database import Database
from app.errors import AppError, app_error_handler
from app.repositories.actors import ActorsRepository
from app.repositories.catalog import CatalogRepository
from app.repositories.follows import FollowsRepository
from app.repositories.logs import LogsRepository
from app.repositories.settings import SettingsRepository
from app.repositories.tasks import TasksRepository
from app.scheduler import IntervalSchedulerService, SchedulerService
from app.services.download_monitor import DownloadMonitorDependencies, DownloadMonitorService
from app.services.follow_workflow import FollowWorkflowDependencies, FollowWorkflowService
from app.services.settings import DEFAULT_CHECK_CRON
from app.services.telegram_commands import TelegramCommandService
from app.services.telegram_movie_jobs import TelegramMovieJobDependencies, TelegramMovieJobRunner

DOWNLOAD_MONITOR_CRON = "* * * * *"
TELEGRAM_POLL_INTERVAL_SECONDS = 3
AppScheduler = SchedulerService | IntervalSchedulerService


def create_schedulers(database_path: Path) -> list[AppScheduler]:
    def check_cron_provider() -> str | None:
        cron = _read_setting(database_path, "check_cron")
        return cron or DEFAULT_CHECK_CRON

    def check_job() -> None:
        _run_db_job(database_path, _run_follow_check)

    def monitor_job() -> None:
        _run_db_job(database_path, _run_download_monitor)

    def telegram_job() -> None:
        _run_db_job(
            database_path,
            lambda connection: _run_telegram_poll(connection, database_path),
        )

    check_scheduler = SchedulerService(check_cron_provider, check_job)
    monitor_scheduler = SchedulerService(lambda: DOWNLOAD_MONITOR_CRON, monitor_job)
    telegram_scheduler = IntervalSchedulerService(TELEGRAM_POLL_INTERVAL_SECONDS, telegram_job)
    return [check_scheduler, monitor_scheduler, telegram_scheduler]


def _read_setting(database_path: Path, key: str) -> str | None:
    def read(connection: Connection) -> str | None:
        return SettingsRepository(connection).get(key)

    return _with_connection(database_path, read)


def _run_db_job(database_path: Path, job: Callable[[Connection], None]) -> None:
    _with_connection(database_path, job)


def _with_connection[DbResult](
    database_path: Path,
    work: Callable[[Connection], DbResult],
) -> DbResult:
    with Database(database_path).connect() as connection:
        try:
            result = work(connection)
            connection.commit()
            return result
        except Exception:
            connection.rollback()
            raise


def _run_download_monitor(connection: Connection) -> None:
    settings_repo = SettingsRepository(connection)
    DownloadMonitorService(
        DownloadMonitorDependencies(
            catalog=CatalogRepository(connection),
            tasks=TasksRepository(connection),
            logs=LogsRepository(connection),
            settings=settings_repo,
        )
    ).poll_unfinished()


def _run_follow_check(connection: Connection) -> None:
    settings_repo = SettingsRepository(connection)
    FollowWorkflowService(
        FollowWorkflowDependencies(
            actors=ActorsRepository(connection),
            follows=FollowsRepository(connection),
            catalog=CatalogRepository(connection),
            tasks=TasksRepository(connection),
            logs=LogsRepository(connection),
            settings=settings_repo,
            javdb=JavdbApiClient(),
        )
    ).check_all_enabled()


def _run_telegram_poll(connection: Connection, database_path: Path) -> None:
    settings_repo = SettingsRepository(connection)

    def run_follow_check() -> None:
        _run_follow_check(connection)

    def telegram_status() -> str:
        return _telegram_status(connection, settings_repo)

    TelegramCommandService(
        settings_repo,
        telegram_status,
        run_follow_check,
        movie_jobs=TelegramMovieJobRunner(
            TelegramMovieJobDependencies(database_path=database_path)
        ),
    ).poll()


def _telegram_status(connection: Connection, settings_repo: SettingsRepository) -> str:
    counts = TasksRepository(connection).counts()
    p115_status = "已配置" if settings_repo.get("p115_cookie") else "未配置"
    return "\n".join(
        [
            "javdb115 状态",
            f"115 Cookie：{p115_status}",
            f"已提交：{counts.get('submitted', 0)}",
            f"下载中：{counts.get('downloading', 0)}",
            f"已完成：{counts.get('completed', 0)}",
            f"失败：{counts.get('failed', 0)}",
        ]
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    config = load_config()
    database = Database(config.database_path)
    database.initialize()

    schedulers = create_schedulers(config.database_path)
    for scheduler in schedulers:
        scheduler.start()
    app.state.schedulers = schedulers
    yield
    for scheduler in schedulers:
        await scheduler.stop()


app = FastAPI(title="JAVDB 115 Tool", lifespan=lifespan)
app.add_exception_handler(AppError, app_error_handler)
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(follows.router)
app.include_router(javdb_proxy.router)
app.include_router(image_proxy.router)
app.include_router(settings.router)
app.include_router(tasks.router)
app.include_router(checks.router)

STATIC_DIR = Path(__file__).with_name("static")

if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def frontend(path: str) -> FileResponse:
    index = STATIC_DIR / "index.html"
    if not index.exists():
        raise RuntimeError("Frontend build is missing. Run npm run build in frontend.")
    return FileResponse(index)
