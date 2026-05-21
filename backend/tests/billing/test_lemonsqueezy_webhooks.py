"""Tests for POST /webhooks/lemonsqueezy: HMAC signature + idempotency.

Per-event dispatching is tested in later test files (Tasks 13-15).
"""
import json
import hmac
import hashlib
import pytest


WEBHOOK_SECRET = "test-webhook-secret"


def _sign(body: bytes, secret: str = WEBHOOK_SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


@pytest.fixture
def webhook_secret_configured(monkeypatch):
    """Inject the webhook secret for tests."""
    from config import get_settings
    settings = get_settings()
    monkeypatch.setattr(settings, "lemonsqueezy_webhook_secret", WEBHOOK_SECRET)
    return settings


@pytest.mark.asyncio
async def test_webhook_rejects_missing_signature(client, webhook_secret_configured):
    payload = {
        "meta": {"event_name": "subscription_created", "custom_data": {}},
        "data": {"id": "evt-no-sig", "attributes": {}},
    }
    r = await client.post("/webhooks/lemonsqueezy", json=payload)
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_webhook_rejects_bad_signature(client, webhook_secret_configured):
    payload = {
        "meta": {"event_name": "subscription_created", "custom_data": {}},
        "data": {"id": "evt-bad-sig", "attributes": {}},
    }
    body = json.dumps(payload).encode()
    r = await client.post(
        "/webhooks/lemonsqueezy",
        content=body,
        headers={"X-Signature": "deadbeef", "Content-Type": "application/json"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_webhook_accepts_valid_signature(client, webhook_secret_configured):
    """Valid HMAC sig → 200. Event type 'unknown' is logged but doesn't fail."""
    payload = {
        "meta": {"event_name": "subscription_created", "custom_data": {}, "test_mode": True},
        "data": {"id": "evt-valid-1", "attributes": {}},
    }
    body = json.dumps(payload).encode()
    sig = _sign(body)
    r = await client.post(
        "/webhooks/lemonsqueezy",
        content=body,
        headers={"X-Signature": sig, "Content-Type": "application/json"},
    )
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_webhook_rejects_malformed_payload(client, webhook_secret_configured):
    """Missing event_name or data.id → 400 (after sig verification)."""
    body = json.dumps({"meta": {}, "data": {}}).encode()
    sig = _sign(body)
    r = await client.post(
        "/webhooks/lemonsqueezy",
        content=body,
        headers={"X-Signature": sig, "Content-Type": "application/json"},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_webhook_idempotent_on_repeat_event_id(client, webhook_secret_configured, db_session):
    """Same event_id sent twice → only one webhook_events row."""
    from sqlalchemy import select, func
    from billing.models import WebhookEvent

    payload = {
        "meta": {"event_name": "subscription_created", "custom_data": {}},
        "data": {"id": "evt-dup-99", "attributes": {}},
    }
    body = json.dumps(payload).encode()
    sig = _sign(body)
    headers = {"X-Signature": sig, "Content-Type": "application/json"}

    r1 = await client.post("/webhooks/lemonsqueezy", content=body, headers=headers)
    r2 = await client.post("/webhooks/lemonsqueezy", content=body, headers=headers)

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r2.json()["status"] in ("duplicate_ignored", "ok")  # implementation may flag

    count = (await db_session.execute(
        select(func.count(WebhookEvent.id)).where(
            WebhookEvent.event_id == "evt-dup-99",
            WebhookEvent.provider == "lemonsqueezy",
        )
    )).scalar()
    assert count == 1, f"Expected 1 webhook_event row, got {count}"
