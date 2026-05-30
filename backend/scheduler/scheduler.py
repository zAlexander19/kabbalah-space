"""APScheduler setup for premium email cron jobs.

The scheduler starts at FastAPI lifespan startup and stops at shutdown.
Job definitions live in `scheduler.jobs`.

Cron strategy: each cron triggers HOURLY on UTC (cheap), then per-user logic
inside the job filters to "is it 09:00 local time for this user now?". This
keeps the schedule simple and timezone-correct without minute-precision crons.
"""
import logging
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger


logger = logging.getLogger(__name__)


_scheduler: Optional[AsyncIOScheduler] = None


def get_scheduler() -> Optional[AsyncIOScheduler]:
    return _scheduler


def start_scheduler() -> AsyncIOScheduler:
    """Register and start the scheduler. Idempotent: calling twice returns the same instance."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return _scheduler

    # Lazy import to avoid circular at module load
    from scheduler.jobs import (
        hourly_weekly_summary_tick,
        hourly_monthly_summary_tick,
        nightly_imbalance_tick,
        nightly_reminder_tick,
        hourly_gcal_link_suggestion_tick,
        hourly_evolucion_nudge_tick,
    )

    sched = AsyncIOScheduler(timezone="UTC")
    sched.add_job(hourly_weekly_summary_tick, CronTrigger(minute=0), id="weekly_tick", replace_existing=True)
    sched.add_job(hourly_monthly_summary_tick, CronTrigger(minute=5), id="monthly_tick", replace_existing=True)
    sched.add_job(nightly_imbalance_tick, CronTrigger(hour=2, minute=15), id="imbalance_tick", replace_existing=True)
    sched.add_job(nightly_reminder_tick, CronTrigger(hour=2, minute=30), id="reminder_tick", replace_existing=True)
    sched.add_job(hourly_gcal_link_suggestion_tick, CronTrigger(minute=45), id="gcal_link_tick", replace_existing=True)
    # Evolucion nudge runs once daily — daily granularity is enough for a 30-day cycle.
    sched.add_job(hourly_evolucion_nudge_tick, CronTrigger(hour=3, minute=0), id="evolucion_nudge_tick", replace_existing=True)
    sched.start()
    logger.info("scheduler started with 6 jobs")

    _scheduler = sched
    return sched


def stop_scheduler():
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("scheduler stopped")
    _scheduler = None
