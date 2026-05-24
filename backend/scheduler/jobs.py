"""Cron job entry points for premium emails.

Each `*_tick` function runs hourly (or nightly) and decides per-user whether
to actually send. Real implementations land in Task 11; for now these are
stubs that let the scheduler register without error.
"""
import logging

logger = logging.getLogger(__name__)


async def hourly_weekly_summary_tick():
    logger.debug("weekly_tick (stub)")


async def hourly_monthly_summary_tick():
    logger.debug("monthly_tick (stub)")


async def nightly_imbalance_tick():
    logger.debug("imbalance_tick (stub)")


async def nightly_reminder_tick():
    logger.debug("reminder_tick (stub)")
