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
async def test_get_preferences_404_for_free_user(client, free_user_headers):
    """Free users have no email_preferences row."""
    r = await client.get("/email/preferences", headers=free_user_headers)
    assert r.status_code == 404


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
