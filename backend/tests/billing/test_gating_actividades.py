"""Tests for gating on POST /actividades: 10-activity limit for free users."""
import pytest
from datetime import datetime, timedelta, timezone


def _payload(titulo: str = "X", sefirot_ids=None):
    """Build a minimal valid actividad payload (no recurrence)."""
    now = datetime.now(timezone.utc)
    return {
        "titulo": titulo,
        "inicio": now.isoformat(),
        "fin": (now + timedelta(hours=1)).isoformat(),
        "sefirot_ids": sefirot_ids or ["jesed"],
    }


@pytest.mark.asyncio
async def test_free_user_cannot_create_11th_activity(client, free_user_headers, seed_sefirot):
    """Free user with 10 active activities gets 402 on the 11th."""
    for i in range(10):
        r = await client.post("/actividades", json=_payload(f"a{i}"), headers=free_user_headers)
        assert r.status_code == 200, f"create #{i+1} should succeed but got {r.status_code}: {r.text}"

    r = await client.post("/actividades", json=_payload("a11"), headers=free_user_headers)
    assert r.status_code == 402, r.text
    detail = r.json()["detail"]
    assert detail["error"] == "premium_required"
    assert detail["reason"] == "actividad_limit"
    assert detail["current"] == 10
    assert detail["max"] == 10


@pytest.mark.asyncio
async def test_premium_user_can_create_11th(client, premium_user_headers, seed_sefirot):
    """Premium user is not gated by the count limit."""
    for i in range(11):
        r = await client.post("/actividades", json=_payload(f"a{i}"), headers=premium_user_headers)
        assert r.status_code == 200, f"create #{i+1} failed: {r.text}"


@pytest.mark.asyncio
async def test_completed_activities_dont_count_against_limit(
    client, free_user_headers, seed_sefirot, db_session
):
    """Activities with estado != 'pendiente' do not count toward the free limit."""
    # Create 10 pendiente, then mark them completed
    ids = []
    for i in range(10):
        r = await client.post("/actividades", json=_payload(f"a{i}"), headers=free_user_headers)
        assert r.status_code == 200, r.text
        ids.append(r.json()[0]["id"])

    from sqlalchemy import text, bindparam
    stmt = text("UPDATE actividades SET estado='completada' WHERE id IN :ids").bindparams(
        bindparam("ids", expanding=True)
    )
    await db_session.execute(stmt, {"ids": ids})
    await db_session.commit()

    # Now creating the 11th should succeed
    r = await client.post("/actividades", json=_payload("a11"), headers=free_user_headers)
    assert r.status_code == 200, r.text


# ---------------- Task 6: recurrencias premium-only ----------------

def _payload_with_rrule(titulo: str, rrule: str, sefirot=None):
    """Build an actividad payload that includes an RRULE."""
    now = datetime.now(timezone.utc)
    return {
        "titulo": titulo,
        "inicio": now.isoformat(),
        "fin": (now + timedelta(hours=1)).isoformat(),
        "sefirot_ids": sefirot or ["jesed"],
        "rrule": rrule,
    }


@pytest.mark.asyncio
async def test_free_user_cannot_create_recurring(client, free_user_headers, seed_sefirot):
    """Any rrule = premium-only for free users, regardless of count."""
    r = await client.post(
        "/actividades",
        json=_payload_with_rrule("daily", "FREQ=DAILY;COUNT=5"),
        headers=free_user_headers,
    )
    assert r.status_code == 402, r.text
    detail = r.json()["detail"]
    assert detail["error"] == "premium_required"
    assert detail["reason"] == "recurrence_premium"


@pytest.mark.asyncio
async def test_premium_user_can_create_recurring(client, premium_user_headers, seed_sefirot):
    """Premium users create recurrences without issue."""
    r = await client.post(
        "/actividades",
        json=_payload_with_rrule("daily-premium", "FREQ=DAILY;COUNT=5"),
        headers=premium_user_headers,
    )
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_recurrence_gate_fires_before_count_gate(client, free_user_headers, seed_sefirot):
    """Even with zero existing actividades, an RRULE payload triggers recurrence_premium first."""
    r = await client.post(
        "/actividades",
        json=_payload_with_rrule("weekly", "FREQ=WEEKLY"),
        headers=free_user_headers,
    )
    assert r.status_code == 402
    # Must say recurrence_premium, NOT actividad_limit
    assert r.json()["detail"]["reason"] == "recurrence_premium"
