"""Thin async HTTP wrapper over the Lemonsqueezy API.

This module knows nothing about our DB. It talks to Lemonsqueezy and returns
parsed JSON. The webhook handler and routers translate to/from our domain.

API docs: https://docs.lemonsqueezy.com/api
"""
from typing import Optional
import httpx

from config import Settings


BASE_URL = "https://api.lemonsqueezy.com/v1"
TIMEOUT_SECONDS = 15


class LemonsqueezyError(Exception):
    """Base exception for Lemonsqueezy API failures."""


class LemonsqueezyAuthError(LemonsqueezyError):
    """401 from Lemonsqueezy - API key is invalid or missing."""


def _headers(api_key: str) -> dict:
    return {
        "Accept": "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        "Authorization": f"Bearer {api_key}",
    }


async def create_checkout(
    settings: Settings,
    *,
    variant_id: str,
    usuario_id: str,
    redirect_url: str,
    promo_code: Optional[str] = None,
    trial_days: Optional[int] = None,
) -> str:
    """Create a Checkout in Lemonsqueezy. Returns the hosted checkout URL.

    Args:
        variant_id: the Lemonsqueezy variant id (monthly or yearly).
        usuario_id: our internal user id; round-trips via custom_data so the
            webhook can attribute the subscription back to our user.
        redirect_url: where Lemonsqueezy sends the user after payment.
        promo_code: if provided, attached to custom_data for accounting.
        trial_days: if provided (= valid promo code), apply a trial period.

    Raises:
        LemonsqueezyAuthError on 401, LemonsqueezyError on any other failure.
    """
    custom = {"usuario_id": usuario_id}
    if promo_code:
        custom["promo_code"] = promo_code
    if trial_days:
        custom["trial_days"] = str(trial_days)

    body = {
        "data": {
            "type": "checkouts",
            "attributes": {
                "checkout_data": {"custom": custom},
                "product_options": {"redirect_url": redirect_url},
            },
            "relationships": {
                "store": {"data": {"type": "stores", "id": settings.lemonsqueezy_store_id}},
                "variant": {"data": {"type": "variants", "id": variant_id}},
            },
        }
    }

    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as http:
        r = await http.post(
            f"{BASE_URL}/checkouts",
            json=body,
            headers=_headers(settings.lemonsqueezy_api_key),
        )

    if r.status_code == 401:
        raise LemonsqueezyAuthError("lemonsqueezy auth failed (check LEMONSQUEEZY_API_KEY)")
    if r.status_code >= 400:
        raise LemonsqueezyError(f"lemonsqueezy {r.status_code}: {r.text}")

    return r.json()["data"]["attributes"]["url"]


async def get_customer_portal_url(settings: Settings, customer_id: str) -> str:
    """Return the customer portal URL where the user manages their subscription.

    The user is redirected here from our /billing/portal endpoint.
    """
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as http:
        r = await http.get(
            f"{BASE_URL}/customers/{customer_id}",
            headers=_headers(settings.lemonsqueezy_api_key),
        )

    if r.status_code == 401:
        raise LemonsqueezyAuthError("lemonsqueezy auth failed")
    if r.status_code >= 400:
        raise LemonsqueezyError(f"lemonsqueezy {r.status_code}: {r.text}")

    return r.json()["data"]["attributes"]["urls"]["customer_portal"]
