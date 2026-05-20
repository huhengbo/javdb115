from __future__ import annotations

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
from app.scheduler import SchedulerService
from app.services.download_monitor import DownloadMonitorDependencies, DownloadMonitorService
from app.services.follow_workflow import FollowWorkflowDependencies, FollowWorkflowService
from app.services.settings import DEFAULT_CHECK_CRON
from app.services.telegram_commands import TelegramCommandService
from app.services.telegram_movie_jobs import TelegramMovieJobDependencies, TelegramMovieJobRunner

DOWNLOAD_MONITOR_CRON = "* * * * *"
TELEGRAM_COMMAND_CRON = "* * * * *"


def create_schedulers(connection: Connection, database_path: Path) -> list[SchedulerService]:
    settings_repo = SettingsRepository(connection)

    def check_cron_provider() -> str | None:
        return settings_repo.get("check_cron") or DEFAULT_CHECK_CRON

    def run_follow_check() -> None:
        javdb = JavdbApiClient()
        FollowWorkflowService(
            FollowWorkflowDependencies(
                actors=ActorsRepository(connection),
                follows=FollowsRepository(connection),
                catalog=CatalogRepository(connection),
                tasks=TasksRepository(connection),
                logs=LogsRepository(connection),
                settings=settings_repo,
                javdb=javdb,
            )
        ).check_all_enabled()

    def check_job() -> None:
        run_follow_check()
        connection.commit()

    def monitor_job() -> None:
        DownloadMonitorService(
            DownloadMonitorDependencies(
                catalog=CatalogRepository(connection),
                tasks=TasksRepository(connection),
                logs=LogsRepository(connection),
                settings=settings_repo,
            )
        ).poll_unfinished()
        connection.commit()

    def telegram_status() -> str:
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

    def telegram_job() -> None:
        TelegramCommandService(
            settings_repo,
            telegram_status,
            run_follow_check,
            movie_jobs=TelegramMovieJobRunner(
                TelegramMovieJobDependencies(database_path=database_path)
            ),
        ).poll()
        connection.commit()

    check_scheduler = SchedulerService(check_cron_provider, check_job)
    monitor_scheduler = SchedulerService(lambda: DOWNLOAD_MONITOR_CRON, monitor_job)
    telegram_scheduler = SchedulerService(lambda: TELEGRAM_COMMAND_CRON, telegram_job)
    return [check_scheduler, monitor_scheduler, telegram_scheduler]


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    config = load_config()
    database = Database(config.database_path)
    database.initialize()

    with database.connect() as connection:
        schedulers = create_schedulers(connection, config.database_path)
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
