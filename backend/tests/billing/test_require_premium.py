"""Tests for premium gating: is_premium property (Task 3). Dependency tests in Task 4."""
import pytest
from datetime import datetime, timedelta, timezone

from models import Usuario
from billing.models import Subscription


def _make_user_with_sub(status: str) -> Usuario:
    """Build an in-memory Usuario with an attached Subscription. No DB."""
    user = Usuario(id="u1", email="a@b.com", nombre="A", provider="email")
    sub = Subscription(
        id="s1",
        usuario_id="u1",
        status=status,
        plan="monthly",
        lemonsqueezy_subscription_id="ls1",
        lemonsqueezy_customer_id="lc1",
        current_period_start=datetime.now(timezone.utc),
        current_period_end=datetime.now(timezone.utc) + timedelta(days=30),
    )
    user.subscription = sub
    return user


def test_is_premium_true_for_active():
    user = _make_user_with_sub("active")
    assert user.is_premium is True


def test_is_premium_true_for_trial():
    user = _make_user_with_sub("trial")
    assert user.is_premium is True


@pytest.mark.parametrize("status", ["past_due", "canceled", "expired"])
def test_is_premium_false_for_inactive(status):
    user = _make_user_with_sub(status)
    assert user.is_premium is False


def test_is_premium_false_when_no_subscription():
    user = Usuario(id="u2", email="x@y.com", nombre="X", provider="email")
    user.subscription = None
    assert user.is_premium is False
