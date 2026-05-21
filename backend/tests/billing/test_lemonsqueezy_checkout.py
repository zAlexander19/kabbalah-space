"""Tests for POST /billing/checkout — Lemonsqueezy hosted checkout creation."""
import pytest
import respx
from httpx import Response

from config import get_settings


@pytest.fixture
def ls_settings_configured(monkeypatch):
    """Inject Lemonsqueezy config into Settings for the duration of the test."""
    settings = get_settings()
    monkeypatch.setattr(settings, "lemonsqueezy_api_key", "test-key")
    monkeypatch.setattr(settings, "lemonsqueezy_store_id", "12345")
    monkeypatch.setattr(settings, "lemonsqueezy_variant_monthly", "v-monthly")
    monkeypatch.setattr(settings, "lemonsqueezy_variant_yearly", "v-yearly")
    return settings


@pytest.mark.asyncio
async def test_checkout_returns_url(client, free_user_headers, ls_settings_configured):
    """Successful checkout returns the hosted checkout URL."""
    with respx.mock(base_url="https://api.lemonsqueezy.com/v1") as mock:
        mock.post("/checkouts").mock(
            return_value=Response(201, json={
                "data": {"attributes": {"url": "https://kab.lemonsqueezy.com/checkout/abc"}}
            })
        )

        r = await client.post(
            "/billing/checkout",
            json={"plan": "monthly"},
            headers=free_user_headers,
        )

    assert r.status_code == 200, r.text
    assert r.json()["checkout_url"] == "https://kab.lemonsqueezy.com/checkout/abc"


@pytest.mark.asyncio
async def test_checkout_requires_auth(client):
    r = await client.post("/billing/checkout", json={"plan": "monthly"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_checkout_validates_plan(client, free_user_headers, ls_settings_configured):
    r = await client.post(
        "/billing/checkout",
        json={"plan": "invalid"},
        headers=free_user_headers,
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_checkout_with_invalid_promo_fails(client, free_user_headers, ls_settings_configured):
    r = await client.post(
        "/billing/checkout",
        json={"plan": "monthly", "promo_code": "DOES_NOT_EXIST"},
        headers=free_user_headers,
    )
    assert r.status_code == 400
    assert "promo" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_checkout_with_valid_promo_passes_trial_days_to_ls(
    client, free_user_headers, ls_settings_configured, db_session
):
    """Valid promo → trial_days appears in the request body to Lemonsqueezy."""
    from billing.models import PromoCode
    promo = PromoCode(code="LAUNCH7", trial_days=7, max_uses=100, uses_count=0)
    db_session.add(promo)
    await db_session.commit()

    with respx.mock(base_url="https://api.lemonsqueezy.com/v1") as mock:
        route = mock.post("/checkouts").mock(
            return_value=Response(201, json={"data": {"attributes": {"url": "https://x/c"}}})
        )

        r = await client.post(
            "/billing/checkout",
            json={"plan": "monthly", "promo_code": "LAUNCH7"},
            headers=free_user_headers,
        )

    assert r.status_code == 200, r.text
    assert len(route.calls) == 1
    body = route.calls[0].request.read().decode()
    assert "trial_days" in body
    assert "\"7\"" in body  # trial_days serialized as string per Lemonsqueezy custom_data


@pytest.mark.asyncio
async def test_checkout_uses_yearly_variant_when_yearly_plan(
    client, free_user_headers, ls_settings_configured
):
    """Plan='yearly' → variant id from lemonsqueezy_variant_yearly setting."""
    with respx.mock(base_url="https://api.lemonsqueezy.com/v1") as mock:
        route = mock.post("/checkouts").mock(
            return_value=Response(201, json={"data": {"attributes": {"url": "https://x/c"}}})
        )

        r = await client.post(
            "/billing/checkout",
            json={"plan": "yearly"},
            headers=free_user_headers,
        )

    assert r.status_code == 200, r.text
    body = route.calls[0].request.read().decode()
    assert "v-yearly" in body
    assert "v-monthly" not in body
