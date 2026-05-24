"""Tests for POST /webhooks/resend — Resend delivery events."""
import json
import hmac
import hashlib
import base64
import pytest
from sqlalchemy import select


WEBHOOK_SECRET = "whsec_test_secret"


def _sign(body: bytes, secret: str = WEBHOOK_SECRET) -> str:
    """Resend uses Svix; the signature is base64(hmac_sha256(secret, body))."""
    digest = hmac.new(secret.encode(), body, hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


@pytest.fixture
def resend_secret_configured(monkeypatch):
    from config import get_settings
    s = get_settings()
    monkeypatch.setattr(s, "resend_webhook_secret", WEBHOOK_SECRET)
    return s


@pytest.fixture
async def email_log_row(db_session):
    """Seed an EmailLog row that the webhook will update."""
    from emails.models import EmailLog
    from models import Usuario

    user = Usuario(id="u-wh-1", email="recipient@x.com", nombre="X", provider="email")
    log = EmailLog(
        usuario_id="u-wh-1",
        email_type="weekly",
        idempotency_key="u-wh-1-weekly-2026-W22",
        status="sent",
        provider_message_id="msg-xyz",
    )
    db_session.add_all([user, log])
    await db_session.commit()
    return log


@pytest.mark.asyncio
async def test_webhook_rejects_missing_signature(client, resend_secret_configured):
    r = await client.post(
        "/webhooks/resend",
        json={"type": "email.delivered", "data": {"email_id": "msg-1"}},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_webhook_rejects_bad_signature(client, resend_secret_configured):
    body = json.dumps({"type": "email.delivered", "data": {"email_id": "msg-1"}}).encode()
    r = await client.post(
        "/webhooks/resend",
        content=body,
        headers={"Svix-Signature": "v1,bad-sig", "Content-Type": "application/json"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_webhook_delivered_updates_status(client, resend_secret_configured, email_log_row, db_session):
    from emails.models import EmailLog
    body = json.dumps({"type": "email.delivered", "data": {"email_id": "msg-xyz"}}).encode()
    r = await client.post(
        "/webhooks/resend",
        content=body,
        headers={"Svix-Signature": _sign(body), "Content-Type": "application/json"},
    )
    assert r.status_code == 200
    db_session.expire_all()
    log = (await db_session.execute(
        select(EmailLog).where(EmailLog.provider_message_id == "msg-xyz")
    )).scalars().first()
    assert log.status == "delivered"


@pytest.mark.asyncio
async def test_webhook_bounced_updates_status(client, resend_secret_configured, email_log_row, db_session):
    from emails.models import EmailLog
    body = json.dumps({"type": "email.bounced", "data": {"email_id": "msg-xyz", "bounce_type": "hard"}}).encode()
    r = await client.post(
        "/webhooks/resend",
        content=body,
        headers={"Svix-Signature": _sign(body), "Content-Type": "application/json"},
    )
    assert r.status_code == 200
    db_session.expire_all()
    log = (await db_session.execute(
        select(EmailLog).where(EmailLog.provider_message_id == "msg-xyz")
    )).scalars().first()
    assert log.status == "bounced"


@pytest.mark.asyncio
async def test_webhook_unknown_email_id_is_ok(client, resend_secret_configured):
    """An email_id not in our DB → 200 + {"status": "unknown_email"}, no error."""
    body = json.dumps({"type": "email.delivered", "data": {"email_id": "msg-ghost"}}).encode()
    r = await client.post(
        "/webhooks/resend",
        content=body,
        headers={"Svix-Signature": _sign(body), "Content-Type": "application/json"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "unknown_email"


@pytest.mark.asyncio
async def test_webhook_three_hard_bounces_pauses_user(client, resend_secret_configured, db_session):
    """After 3 hard bounces for the same user, all their email prefs flip to False."""
    from emails.models import EmailLog
    from billing.models import EmailPreferences
    from models import Usuario

    user = Usuario(id="u-wh-2", email="bounce@x.com", nombre="X", provider="email")
    prefs = EmailPreferences(usuario_id="u-wh-2")  # all true by default
    # 2 existing bounced rows + 1 fresh "sent" row that the webhook will bounce
    logs = [
        EmailLog(
            usuario_id="u-wh-2", email_type="weekly",
            idempotency_key=f"u-wh-2-weekly-W{i}",
            status="bounced",
            provider_message_id=f"msg-old-{i}",
        )
        for i in range(2)
    ]
    logs.append(EmailLog(
        usuario_id="u-wh-2", email_type="weekly",
        idempotency_key="u-wh-2-weekly-W3",
        status="sent",
        provider_message_id="msg-fresh",
    ))
    db_session.add_all([user, prefs, *logs])
    await db_session.commit()

    body = json.dumps({"type": "email.bounced", "data": {"email_id": "msg-fresh", "bounce_type": "hard"}}).encode()
    r = await client.post(
        "/webhooks/resend",
        content=body,
        headers={"Svix-Signature": _sign(body), "Content-Type": "application/json"},
    )
    assert r.status_code == 200

    db_session.expire_all()
    prefs_after = (await db_session.execute(
        select(EmailPreferences).where(EmailPreferences.usuario_id == "u-wh-2")
    )).scalars().first()
    assert prefs_after.weekly_summary is False
    assert prefs_after.monthly_summary is False
    assert prefs_after.imbalance_alerts is False
    assert prefs_after.reflection_reminders is False
