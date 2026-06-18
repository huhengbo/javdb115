from __future__ import annotations

import asyncio
import logging

from pytest import LogCaptureFixture

from app.scheduler import SchedulerService


def test_scheduler_survives_invalid_cron(caplog: LogCaptureFixture) -> None:
    async def run_scheduler() -> None:
        scheduler = SchedulerService(lambda: "not a cron", lambda: None)
        scheduler.start()
        await asyncio.sleep(0.01)
        assert scheduler._task is not None
        assert not scheduler._task.done()
        await scheduler.stop()

    with caplog.at_level(logging.ERROR):
        asyncio.run(run_scheduler())
    assert "Scheduled cron evaluation failed" in caplog.text
