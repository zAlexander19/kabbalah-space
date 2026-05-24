"""Cron job entry points for premium email sends.

Each tick runs hourly (or nightly) on UTC. Inner functions filter to users
whose local-time alignment matches the trigger window:
- Weekly summary: Sunday 09:00 local time
- Monthly summary: 1st of month 09:00 local time
- Imbalance alerts: any time after midnight local (idempotent per-sefira per-week)
- Reflection reminders: any time after midnight local (idempotent per-pregunta per-month)

This keeps APScheduler config trivial and timezone handling per-user.
"""
import logging
from datetime import datetime, timezone, timedelta

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    from dateutil.tz import gettz as _gettz
    def ZoneInfo(name: str):
        return _gettz(name) or timezone.utc

from sqlalchemy import select, func as sql_func
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings


logger = logging.getLogger(__name__)


def _get_app_url() -> str:
    """Read APP_URL from settings.frontend_url at call time (lazy — env may change)."""
    return get_settings().frontend_url or "https://kabbalahspace.app"


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _user_local(now_utc: datetime, tz_name: str) -> datetime:
    try:
        tz = ZoneInfo(tz_name or "America/Argentina/Buenos_Aires")
        return now_utc.astimezone(tz)
    except Exception:
        return now_utc


# ---------------- WEEKLY ----------------

async def hourly_weekly_summary_tick():
    settings = get_settings()
    if not settings.emails_enabled:
        return
    from database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        await _weekly_summary_for_now(db, _now_utc())


async def _weekly_summary_for_now(db: AsyncSession, now: datetime):
    """For each active premium user, if their local time is currently Sunday
    between 09:00 and 09:59, send the weekly summary."""
    from models import Usuario
    from billing.models import Subscription
    from emails.sender import send_weekly_summary

    subs = (await db.execute(
        select(Subscription).where(Subscription.status.in_(("trial", "active")))
    )).scalars().all()

    for sub in subs:
        user = (await db.execute(
            select(Usuario).where(Usuario.id == sub.usuario_id)
        )).scalars().first()
        if user is None:
            continue
        local = _user_local(now, user.timezone)
        if local.weekday() != 6:  # 6 = Sunday
            continue
        if local.hour != 9:
            continue

        week_end = now
        week_start = now - timedelta(days=7)

        # Compute weekly data for this user
        from models import Sefira, Actividad, ActividadSefira, RespuestaPregunta

        sefirot_counts = (await db.execute(
            select(Sefira.nombre, sql_func.count(Actividad.id).label("cnt"))
            .join(ActividadSefira, ActividadSefira.sefira_id == Sefira.id)
            .join(Actividad, Actividad.id == ActividadSefira.actividad_id)
            .where(
                Actividad.usuario_id == user.id,
                Actividad.inicio >= week_start,
                Actividad.inicio < week_end,
            )
            .group_by(Sefira.nombre)
            .order_by(sql_func.count(Actividad.id).desc())
            .limit(3)
        )).all()
        top_sefirot = [(row[0], int(row[1])) for row in sefirot_counts]

        reflexiones_count = (await db.execute(
            select(sql_func.count(RespuestaPregunta.id))
            .where(
                RespuestaPregunta.usuario_id == user.id,
                RespuestaPregunta.fecha_registro >= week_start,
                RespuestaPregunta.fecha_registro < week_end,
            )
        )).scalar() or 0

        try:
            await send_weekly_summary(
                db, user=user, week_start=week_start, week_end=week_end,
                app_url=_get_app_url(),
                top_sefirot=top_sefirot,
                reflexiones_count=reflexiones_count,
            )
        except Exception as e:
            logger.warning("weekly_summary failed for usuario_id=%s: %s", user.id, e)


# ---------------- MONTHLY ----------------

async def hourly_monthly_summary_tick():
    settings = get_settings()
    if not settings.emails_enabled:
        return
    from database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        await _monthly_summary_for_now(db, _now_utc())


async def _monthly_summary_for_now(db: AsyncSession, now: datetime):
    from models import Usuario
    from billing.models import Subscription
    from emails.sender import send_monthly_summary

    subs = (await db.execute(
        select(Subscription).where(Subscription.status.in_(("trial", "active")))
    )).scalars().all()

    spanish_months = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                      "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

    for sub in subs:
        user = (await db.execute(
            select(Usuario).where(Usuario.id == sub.usuario_id)
        )).scalars().first()
        if user is None:
            continue
        local = _user_local(now, user.timezone)
        if local.day != 1 or local.hour != 9:
            continue

        # Month being summarized = previous month
        if local.month == 1:
            month_start_local = local.replace(year=local.year - 1, month=12, day=1, hour=0, minute=0, second=0, microsecond=0)
            month_label = f"diciembre de {local.year - 1}"
        else:
            month_start_local = local.replace(month=local.month - 1, day=1, hour=0, minute=0, second=0, microsecond=0)
            month_label = f"{spanish_months[month_start_local.month - 1]} de {month_start_local.year}"

        month_start_utc = month_start_local.astimezone(timezone.utc)

        # Compute monthly data for this user
        from models import Sefira, Actividad, ActividadSefira, RespuestaPregunta

        # Compute month_end_utc (first second of next month, exclusive)
        if month_start_local.month == 12:
            month_end_local = month_start_local.replace(year=month_start_local.year + 1, month=1)
        else:
            month_end_local = month_start_local.replace(month=month_start_local.month + 1)
        month_end_utc = month_end_local.astimezone(timezone.utc)

        # sefirot_breakdown: all sefirot with their activity count, ordered desc
        sefirot_counts = (await db.execute(
            select(Sefira.nombre, sql_func.count(Actividad.id).label("cnt"))
            .join(ActividadSefira, ActividadSefira.sefira_id == Sefira.id)
            .join(Actividad, Actividad.id == ActividadSefira.actividad_id)
            .where(
                Actividad.usuario_id == user.id,
                Actividad.inicio >= month_start_utc,
                Actividad.inicio < month_end_utc,
            )
            .group_by(Sefira.nombre)
            .order_by(sql_func.count(Actividad.id).desc())
        )).all()
        sefirot_breakdown = [(row[0], int(row[1])) for row in sefirot_counts]

        reflexiones_count = (await db.execute(
            select(sql_func.count(RespuestaPregunta.id))
            .where(
                RespuestaPregunta.usuario_id == user.id,
                RespuestaPregunta.fecha_registro >= month_start_utc,
                RespuestaPregunta.fecha_registro < month_end_utc,
            )
        )).scalar() or 0

        # delta vs prev month — total activities in the previous month vs the month before that
        if month_start_local.month == 1:
            prev_month_start_local = month_start_local.replace(year=month_start_local.year - 1, month=12)
        else:
            prev_month_start_local = month_start_local.replace(month=month_start_local.month - 1)
        prev_month_start_utc = prev_month_start_local.astimezone(timezone.utc)
        prev_month_end_utc = month_start_utc

        current_total = sum(c for _, c in sefirot_breakdown)
        prev_total = (await db.execute(
            select(sql_func.count(Actividad.id))
            .where(
                Actividad.usuario_id == user.id,
                Actividad.inicio >= prev_month_start_utc,
                Actividad.inicio < prev_month_end_utc,
            )
        )).scalar() or 0
        delta_vs_prev_month = current_total - prev_total

        try:
            await send_monthly_summary(
                db, user=user, month_start=month_start_utc, month_label=month_label,
                app_url=_get_app_url(),
                sefirot_breakdown=sefirot_breakdown,
                reflexiones_count=reflexiones_count,
                delta_vs_prev_month=delta_vs_prev_month,
            )
        except Exception as e:
            logger.warning("monthly_summary failed for usuario_id=%s: %s", user.id, e)


# ---------------- IMBALANCE ALERTS ----------------

async def nightly_imbalance_tick():
    settings = get_settings()
    if not settings.emails_enabled:
        return
    from database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        await _imbalance_for_now(db, _now_utc())


async def _imbalance_for_now(db: AsyncSession, now: datetime):
    """For each premium user, find sefirot with no activity in last 14 days;
    fire an alert (one per sefira per week via send_imbalance_alert idempotency).
    """
    from models import Usuario, Sefira, Actividad, ActividadSefira, RegistroDiario
    from billing.models import Subscription
    from emails.sender import send_imbalance_alert

    subs = (await db.execute(
        select(Subscription).where(Subscription.status.in_(("trial", "active")))
    )).scalars().all()
    sefirot = (await db.execute(select(Sefira))).scalars().all()
    cutoff = now - timedelta(days=14)

    for sub in subs:
        user = (await db.execute(
            select(Usuario).where(Usuario.id == sub.usuario_id)
        )).scalars().first()
        if user is None:
            continue
        for sefira in sefirot:
            # Has any activity for this sefira in the last 14 days?
            acts = (await db.execute(
                select(Actividad.id)
                .join(ActividadSefira, ActividadSefira.actividad_id == Actividad.id)
                .where(
                    ActividadSefira.sefira_id == sefira.id,
                    Actividad.usuario_id == user.id,
                    Actividad.inicio >= cutoff,
                )
                .limit(1)
            )).scalars().first()
            if acts:
                continue
            regs = (await db.execute(
                select(RegistroDiario.id).where(
                    RegistroDiario.sefira_id == sefira.id,
                    RegistroDiario.usuario_id == user.id,
                    RegistroDiario.fecha_registro >= cutoff,
                ).limit(1)
            )).scalars().first()
            if regs:
                continue
            try:
                await send_imbalance_alert(
                    db, user=user, sefira_id=sefira.id, sefira_nombre=sefira.nombre,
                    days_since=14, app_url=_get_app_url(),
                )
            except Exception as e:
                logger.warning("imbalance alert failed for usuario_id=%s sefira=%s: %s", user.id, sefira.id, e)


# ---------------- REFLECTION REMINDERS ----------------

async def nightly_reminder_tick():
    settings = get_settings()
    if not settings.emails_enabled:
        return
    from database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        await _reminder_for_now(db, _now_utc())


async def _reminder_for_now(db: AsyncSession, now: datetime):
    """For premium users absent >=7 days with available guide questions,
    send a reminder (idempotent per pregunta per month via sender)."""
    from models import Usuario, PreguntaSefira, RespuestaPregunta, RegistroDiario, Sefira
    from billing.models import Subscription
    from emails.sender import send_reflection_reminder

    subs = (await db.execute(
        select(Subscription).where(Subscription.status.in_(("trial", "active")))
    )).scalars().all()
    cutoff_absent = now - timedelta(days=7)

    for sub in subs:
        user = (await db.execute(
            select(Usuario).where(Usuario.id == sub.usuario_id)
        )).scalars().first()
        if user is None:
            continue

        recent_reg = (await db.execute(
            select(RegistroDiario.id).where(
                RegistroDiario.usuario_id == user.id,
                RegistroDiario.fecha_registro >= cutoff_absent,
            ).limit(1)
        )).scalars().first()
        if recent_reg:
            continue

        sub_q = select(
            RespuestaPregunta.pregunta_id,
            sql_func.max(RespuestaPregunta.fecha_registro).label("last_at"),
        ).where(
            RespuestaPregunta.usuario_id == user.id
        ).group_by(RespuestaPregunta.pregunta_id).subquery()

        pregunta_row = (await db.execute(
            select(PreguntaSefira, Sefira.nombre)
            .join(Sefira, Sefira.id == PreguntaSefira.sefira_id)
            .outerjoin(sub_q, sub_q.c.pregunta_id == PreguntaSefira.id)
            .where(
                (sub_q.c.last_at.is_(None)) | (sub_q.c.last_at < (now - timedelta(days=30)))
            )
            .limit(1)
        )).first()
        if pregunta_row is None:
            continue

        pregunta, sefira_nombre = pregunta_row
        try:
            await send_reflection_reminder(
                db, user=user, pregunta_id=pregunta.id, pregunta_texto=pregunta.texto_pregunta,
                sefira_nombre=sefira_nombre, app_url=_get_app_url(),
            )
        except Exception as e:
            logger.warning("reminder failed for usuario_id=%s: %s", user.id, e)
