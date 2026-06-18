from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable

from croniter import croniter

from app.security import now_utc

SCHEDULER_IDLE_WAIT_SECONDS = 60
MIN_JOB_DELAY_SECONDS = 1
LOGGER = logging.getLogger(__name__)


class SchedulerService:
    def __init__(self, cron_provider: Callable[[], str | None], job: Callable[[], None]) -> None:
        self.cron_provider = cron_provider
        self.job = job
        self._stop = asyncio.Event()
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            await self._task

    async def _run(self) -> None:
        while not self._stop.is_set():
            delay = self._next_delay_seconds()
            if delay is None:
                await self._wait_seconds(SCHEDULER_IDLE_WAIT_SECONDS)
                continue
            if await self._wait_seconds(delay):
                return
            await self._run_job()

    def _next_delay_seconds(self) -> float | None:
        try:
            cron = self.cron_provider()
            if not cron:
                return None
            next_time = croniter(cron, now_utc()).get_next(float)
            return max(MIN_JOB_DELAY_SECONDS, next_time - now_utc().timestamp())
        except Exception:
            LOGGER.exception("Scheduled cron evaluation failed")
            return None

    async def _run_job(self) -> None:
        try:
            await asyncio.to_thread(self.job)
        except Exception:
            LOGGER.exception("Scheduled check failed")

    async def _wait_seconds(self, seconds: float) -> bool:
        try:
            await asyncio.wait_for(self._stop.wait(), timeout=seconds)
            return True
        except TimeoutError:
            return False


class IntervalSchedulerService:
    def __init__(self, interval_seconds: int, job: Callable[[], None]) -> None:
        self.interval_seconds = max(MIN_JOB_DELAY_SECONDS, interval_seconds)
        self.job = job
        self._stop = asyncio.Event()
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            await self._task

    async def _run(self) -> None:
        while not self._stop.is_set():
            await self._run_job()
            if await self._wait_seconds(self.interval_seconds):
                return

    async def _run_job(self) -> None:
        try:
            await asyncio.to_thread(self.job)
        except Exception:
            LOGGER.exception("Interval job failed")

    async def _wait_seconds(self, seconds: float) -> bool:
        try:
            await asyncio.wait_for(self._stop.wait(), timeout=seconds)
            return True
        except TimeoutError:
            return False
