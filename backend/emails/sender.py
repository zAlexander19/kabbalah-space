"""High-level orquestrator for sending premium emails.

Each `send_*` function:
1. Loads the user's EmailPreferences. If the type is opted-out → skip.
2. Computes the idempotency_key for the (user, type, period).
3. INSERTs an EmailLog row with status='queued'. If UNIQUE fails (already
   sent), skip and return None.
4. Renders the template (with optional AI insight from emails.insight).
5. Calls Resend. On success → update row to status='sent' +
   provider_message_id. On failure → status='failed' + error_message, then re-raise.

Importing this module gives the cron jobs a clean API:
    await send_weekly_summary(db, user=..., week_start=..., week_end=..., app_url=...)
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy import func as sql_func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from models import Usuario
from billing.models import EmailPreferences
from billing.preferences import get_or_create_email_preferences
from emails.client import send_email, ResendError
from emails.insight import generate_insight
from emails.models import EmailLog
from emails.templates.weekly_summary import render_weekly_summary
from emails.templates.monthly_summary import render_monthly_summary
from emails.templates.imbalance_alert import render_imbalance_alert
from emails.templates.reflection_reminder import render_reflection_reminder
from emails.templates.gcal_link_suggestion import render_gcal_link_suggestion
from emails.templates.evolucion_nudge import render_evolucion_nudge
from emails.templates.activation_no_start import render_activation_no_start
from emails.templates.activation_tree_incomplete import render_activation_tree_incomplete
from emails.templates.activation_no_activity import render_activation_no_activity


logger = logging.getLogger(__name__)


async def _check_preference(db: AsyncSession, usuario_id: str, attr: str) -> bool:
    prefs = (await db.execute(
        select(EmailPreferences).where(EmailPreferences.usuario_id == usuario_id)
    )).scalars().first()
    if prefs is None:
        # No prefs row = not premium / not yet provisioned → no email.
        return False
    return bool(getattr(prefs, attr))


async def _start_log(db: AsyncSession, *, usuario_id: str, email_type: str, idempotency_key: str) -> Optional[EmailLog]:
    """Insert email_log row with status='queued'. Returns the row if inserted,
    or None if UNIQUE constraint blocked it (already sent)."""
    log = EmailLog(
        usuario_id=usuario_id,
        email_type=email_type,
        idempotency_key=idempotency_key,
        status="queued",
    )
    db.add(log)
    try:
        await db.commit()
        await db.refresh(log)
        return log
    except IntegrityError:
        await db.rollback()
        logger.info("email_log duplicate key=%s; skipping", idempotency_key)
        return None


async def _finish_log_success(db: AsyncSession, log: EmailLog, message_id: Optional[str]):
    log.status = "sent"
    log.provider_message_id = message_id
    await db.commit()


async def _finish_log_failure(db: AsyncSession, log: EmailLog, error: str):
    log.status = "failed"
    log.error_message = error[:1000]
    await db.commit()


# ---------------- WEEKLY ----------------

async def send_weekly_summary(
    db: AsyncSession,
    *,
    user: Usuario,
    week_start: datetime,
    week_end: datetime,
    app_url: str,
    top_sefirot: Optional[list[tuple[str, int]]] = None,
    reflexiones_count: int = 0,
) -> Optional[str]:
    if not await _check_preference(db, user.id, "weekly_summary"):
        return None

    iso_year, iso_week, _ = week_start.isocalendar()
    idem = f"{user.id}-weekly-{iso_year}-W{iso_week:02d}"

    log = await _start_log(db, usuario_id=user.id, email_type="weekly", idempotency_key=idem)
    if log is None:
        return None

    settings = get_settings()
    preferences_url = f"{app_url}/cuenta"
    insight = await generate_insight(user.id, "weekly", week_start, week_end)

    html = render_weekly_summary(
        nombre=user.nombre,
        week_start=week_start,
        week_end=week_end,
        top_sefirot=top_sefirot or [],
        reflexiones_count=reflexiones_count,
        insight=insight,
        app_url=app_url,
        preferences_url=preferences_url,
    )

    try:
        msg_id = await send_email(
            settings,
            to=user.email,
            subject="Tu semana en el árbol",
            html=html,
        )
        await _finish_log_success(db, log, msg_id)
        return msg_id
    except ResendError as e:
        await _finish_log_failure(db, log, str(e))
        raise


# ---------------- MONTHLY ----------------

async def send_monthly_summary(
    db: AsyncSession,
    *,
    user: Usuario,
    month_start: datetime,
    month_label: str,
    app_url: str,
    sefirot_breakdown: Optional[list[tuple[str, int]]] = None,
    reflexiones_count: int = 0,
    delta_vs_prev_month: int = 0,
) -> Optional[str]:
    if not await _check_preference(db, user.id, "monthly_summary"):
        return None

    idem = f"{user.id}-monthly-{month_start.year:04d}-{month_start.month:02d}"
    log = await _start_log(db, usuario_id=user.id, email_type="monthly", idempotency_key=idem)
    if log is None:
        return None

    settings = get_settings()
    preferences_url = f"{app_url}/cuenta"
    month_end = month_start.replace(day=28)
    insight = await generate_insight(user.id, "monthly", month_start, month_end)

    html = render_monthly_summary(
        nombre=user.nombre,
        month_label=month_label,
        sefirot_breakdown=sefirot_breakdown or [],
        reflexiones_count=reflexiones_count,
        delta_vs_prev_month=delta_vs_prev_month,
        insight=insight,
        app_url=app_url,
        preferences_url=preferences_url,
    )

    try:
        msg_id = await send_email(
            settings,
            to=user.email,
            subject=f"Tu mes en el árbol — {month_label}",
            html=html,
        )
        await _finish_log_success(db, log, msg_id)
        return msg_id
    except ResendError as e:
        await _finish_log_failure(db, log, str(e))
        raise


# ---------------- IMBALANCE ALERT ----------------

async def send_imbalance_alert(
    db: AsyncSession,
    *,
    user: Usuario,
    sefira_id: str,
    sefira_nombre: str,
    days_since: int,
    app_url: str,
) -> Optional[str]:
    if not await _check_preference(db, user.id, "imbalance_alerts"):
        return None

    iso_year, iso_week, _ = datetime.now(timezone.utc).isocalendar()
    idem = f"{user.id}-imbalance-{sefira_id}-{iso_year}-W{iso_week:02d}"

    log = await _start_log(db, usuario_id=user.id, email_type="imbalance", idempotency_key=idem)
    if log is None:
        return None

    settings = get_settings()
    preferences_url = f"{app_url}/cuenta"

    html = render_imbalance_alert(
        nombre=user.nombre,
        sefira_nombre=sefira_nombre,
        days_since=days_since,
        app_url=app_url,
        preferences_url=preferences_url,
    )

    try:
        msg_id = await send_email(
            settings,
            to=user.email,
            subject=f"{sefira_nombre} te espera",
            html=html,
        )
        await _finish_log_success(db, log, msg_id)
        return msg_id
    except ResendError as e:
        await _finish_log_failure(db, log, str(e))
        raise


# ---------------- REFLECTION REMINDER ----------------

async def send_reflection_reminder(
    db: AsyncSession,
    *,
    user: Usuario,
    pregunta_id: str,
    pregunta_texto: str,
    sefira_nombre: str,
    app_url: str,
) -> Optional[str]:
    if not await _check_preference(db, user.id, "reflection_reminders"):
        return None

    now = datetime.now(timezone.utc)
    idem = f"{user.id}-reminder-{pregunta_id}-{now.year:04d}-{now.month:02d}"

    log = await _start_log(db, usuario_id=user.id, email_type="reminder", idempotency_key=idem)
    if log is None:
        return None

    settings = get_settings()
    preferences_url = f"{app_url}/cuenta"

    html = render_reflection_reminder(
        nombre=user.nombre,
        pregunta_texto=pregunta_texto,
        sefira_nombre=sefira_nombre,
        app_url=app_url,
        preferences_url=preferences_url,
    )

    try:
        msg_id = await send_email(
            settings,
            to=user.email,
            subject="Una pregunta espera por ti",
            html=html,
        )
        await _finish_log_success(db, log, msg_id)
        return msg_id
    except ResendError as e:
        await _finish_log_failure(db, log, str(e))
        raise


# ---------------- GCAL LINK SUGGESTION (transactional onboarding) ----------------

async def send_gcal_link_suggestion(
    db: AsyncSession,
    *,
    user: Usuario,
    app_url: str,
) -> Optional[str]:
    """Transactional one-shot nudge to connect Google Calendar.

    NOT gated by EmailPreferences — this is an onboarding/transactional
    email, not a recurring digest. Idempotency key is fixed per-user, so
    each user receives it at most once regardless of how many times the
    trigger conditions are re-evaluated.
    """
    idem = f"{user.id}-gcal-link-suggestion"
    log = await _start_log(db, usuario_id=user.id, email_type="gcal_link_suggestion", idempotency_key=idem)
    if log is None:
        return None

    settings = get_settings()
    preferences_url = f"{app_url}/cuenta"

    html = render_gcal_link_suggestion(
        nombre=user.nombre,
        app_url=app_url,
        preferences_url=preferences_url,
    )

    try:
        msg_id = await send_email(
            settings,
            to=user.email,
            subject="No olvides sincronizar con Google Calendar",
            html=html,
        )
        await _finish_log_success(db, log, msg_id)
        return msg_id
    except ResendError as e:
        await _finish_log_failure(db, log, str(e))
        raise


# ---------------- EVOLUCION NUDGE (monthly, free + premium) ----------------

async def send_evolucion_nudge(
    db: AsyncSession,
    *,
    user: Usuario,
    cycle_n: int,
    app_url: str,
) -> Optional[str]:
    """Monthly nudge to revisit Mi Evolución.

    NOT gated by EmailPreferences (free users have no prefs row, and this
    is a retention-style transactional). The cycle number gives one envío
    per ~30-day window per user via the idempotency key.
    """
    idem = f"{user.id}-evolucion-cycle-{cycle_n}"
    log = await _start_log(db, usuario_id=user.id, email_type="evolucion_nudge", idempotency_key=idem)
    if log is None:
        return None

    settings = get_settings()
    preferences_url = f"{app_url}/cuenta"

    html = render_evolucion_nudge(
        nombre=user.nombre,
        app_url=app_url,
        preferences_url=preferences_url,
    )

    try:
        msg_id = await send_email(
            settings,
            to=user.email,
            subject="Mira tu evolución del mes",
            html=html,
        )
        await _finish_log_success(db, log, msg_id)
        return msg_id
    except ResendError as e:
        await _finish_log_failure(db, log, str(e))
        raise


# ---------------- ACTIVACIÓN (embudo A→B→C, free + premium) ----------------

ACTIVATION_FIRST_DELAY_DAYS = 2
ACTIVATION_RETRY_GAP_DAYS = 3
ACTIVATION_MAX_SENDS = 3

_ACTIVATION_SUBJECTS = {
    "no_start": "Tu Árbol de la Vida está esperando",
    "tree_incomplete": "Te faltan dimensiones por completar",
    "no_activity": "Dale vida a tus dimensiones",
}


async def send_activation_nudge(
    db: AsyncSession,
    *,
    user: Usuario,
    stage: str,
    app_url: str,
    now: datetime,
    faltan: int = 0,
) -> Optional[str]:
    """Nudge de activación. Gateado por preferencia `activation_nudges`.
    Tope de 3 envíos por etapa, espaciados >= ACTIVATION_RETRY_GAP_DAYS días.
    Idempotencia por (usuario, etapa, intento).

    El tope y el espaciado cuentan SOLO envíos exitosos (status='sent'): un
    fallo transitorio de Resend no debe consumir uno de los 3 intentos ni
    arrancar el reloj de espaciado. La idempotency key, en cambio, se deriva
    del conteo de TODAS las filas (éxito + fallo + queued huérfano) para que
    cada intento físico tenga una key única — si usáramos el conteo de
    exitosos, un reintento después de un fallo reutilizaría la misma key que
    la fila 'failed' ya insertada y el UNIQUE constraint bloquearía el
    reintento en silencio."""
    if stage not in ("no_start", "tree_incomplete", "no_activity"):
        raise ValueError(f"unknown activation stage: {stage}")

    prefs = await get_or_create_email_preferences(db, user.id)
    if not prefs.activation_nudges:
        return None

    email_type = f"activation_{stage}"

    # Conteo total (todas las filas) → solo para la idempotency key.
    total_count = (await db.execute(
        select(sql_func.count(EmailLog.id)).where(
            EmailLog.usuario_id == user.id,
            EmailLog.email_type == email_type,
        )
    )).scalar() or 0

    # Conteo + último envío de SOLO exitosos → tope y espaciado.
    sent_count = (await db.execute(
        select(sql_func.count(EmailLog.id)).where(
            EmailLog.usuario_id == user.id,
            EmailLog.email_type == email_type,
            EmailLog.status == "sent",
        )
    )).scalar() or 0
    if sent_count >= ACTIVATION_MAX_SENDS:
        return None

    last_sent = (await db.execute(
        select(sql_func.max(EmailLog.sent_at)).where(
            EmailLog.usuario_id == user.id,
            EmailLog.email_type == email_type,
            EmailLog.status == "sent",
        )
    )).scalar()
    if last_sent is not None:
        if last_sent.tzinfo is None:
            last_sent = last_sent.replace(tzinfo=timezone.utc)
        if (now - last_sent) < timedelta(days=ACTIVATION_RETRY_GAP_DAYS):
            return None

    idem = f"{user.id}-{email_type}-{total_count + 1}"
    log = await _start_log(db, usuario_id=user.id, email_type=email_type, idempotency_key=idem)
    if log is None:
        return None

    settings = get_settings()
    preferences_url = f"{app_url}/cuenta"
    if stage == "no_start":
        html = render_activation_no_start(nombre=user.nombre, app_url=app_url, preferences_url=preferences_url)
    elif stage == "tree_incomplete":
        html = render_activation_tree_incomplete(nombre=user.nombre, faltan=faltan, app_url=app_url, preferences_url=preferences_url)
    else:  # no_activity
        html = render_activation_no_activity(nombre=user.nombre, app_url=app_url, preferences_url=preferences_url)

    try:
        msg_id = await send_email(settings, to=user.email, subject=_ACTIVATION_SUBJECTS[stage], html=html)
        await _finish_log_success(db, log, msg_id)
        return msg_id
    except ResendError as e:
        await _finish_log_failure(db, log, str(e))
        raise
