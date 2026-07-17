"""Tests for GET/PUT /email/preferences."""
import pytest


@pytest.mark.asyncio
async def test_get_preferences_requires_auth(client):
    r = await client.get("/email/preferences")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_get_preferences_returns_defaults_for_premium_user(client, premium_user_headers):
    r = await client.get("/email/preferences", headers=premium_user_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["weekly_summary"] is True
    assert body["monthly_summary"] is True
    assert body["imbalance_alerts"] is True
    assert body["reflection_reminders"] is True


@pytest.mark.asyncio
async def test_get_preferences_lazy_creates_for_free_user(client, free_user_headers):
    """Free users have no email_preferences row yet; GET lazy-creates one with defaults."""
    r = await client.get("/email/preferences", headers=free_user_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["weekly_summary"] is True
    assert body["monthly_summary"] is True
    assert body["imbalance_alerts"] is True
    assert body["reflection_reminders"] is True
    assert body["activation_nudges"] is True


@pytest.mark.asyncio
async def test_put_preferences_updates_only_provided_fields(client, premium_user_headers):
    r = await client.put(
        "/email/preferences",
        json={"weekly_summary": False, "imbalance_alerts": False},
        headers=premium_user_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["weekly_summary"] is False
    assert body["imbalance_alerts"] is False
    # Untouched fields remain true
    assert body["monthly_summary"] is True
    assert body["reflection_reminders"] is True


@pytest.mark.asyncio
async def test_put_preferences_persists(client, premium_user_headers):
    await client.put(
        "/email/preferences",
        json={"weekly_summary": False},
        headers=premium_user_headers,
    )
    r = await client.get("/email/preferences", headers=premium_user_headers)
    assert r.json()["weekly_summary"] is False


@pytest.mark.asyncio
async def test_get_or_create_creates_row_for_free_user(db_session):
    from models import Usuario
    from billing.preferences import get_or_create_email_preferences

    u = Usuario(id="free1", email="free1@x.com", nombre="Free", provider="google")
    db_session.add(u)
    await db_session.commit()

    prefs = await get_or_create_email_preferences(db_session, u.id)
    assert prefs.usuario_id == u.id
    assert prefs.activation_nudges is True
    # segunda llamada no duplica
    prefs2 = await get_or_create_email_preferences(db_session, u.id)
    assert prefs2.usuario_id == u.id


@pytest.mark.asyncio
async def test_get_preferences_returns_row_for_free_user(client, normal_user_headers):
    res = await client.get("/email/preferences", headers=normal_user_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["activation_nudges"] is True
