"""Free users limited to last 12 months of history. Premium users can request more."""
import pytest


@pytest.mark.asyncio
async def test_free_user_evolucion_meses_clamped_to_12(client, free_user_headers, seed_sefirot):
    """Free user requesting meses=60 gets only 12 buckets per sefirá."""
    r = await client.get("/espejo/evolucion?meses=60", headers=free_user_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    # Each sefirá entry must have exactly 12 month buckets, not 60
    assert len(body) > 0
    for sefira_entry in body:
        assert len(sefira_entry["meses"]) == 12, \
            f"Expected 12 buckets, got {len(sefira_entry['meses'])} for {sefira_entry['sefira_id']}"


@pytest.mark.asyncio
async def test_premium_user_evolucion_meses_honored(client, premium_user_headers, seed_sefirot):
    """Premium user requesting meses=24 gets 24 buckets per sefirá."""
    r = await client.get("/espejo/evolucion?meses=24", headers=premium_user_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body) > 0
    for sefira_entry in body:
        assert len(sefira_entry["meses"]) == 24


@pytest.mark.asyncio
async def test_free_user_blocked_from_old_month_semanas(client, free_user_headers, seed_sefirot):
    """Free user requesting semanas of a month >12 months ago gets 402."""
    from datetime import datetime
    # Pick a month definitively older than 12 calendar months
    old_year = datetime.utcnow().year - 2
    r = await client.get(
        f"/espejo/evolucion/jesed/semanas?mes={old_year}-01",
        headers=free_user_headers,
    )
    assert r.status_code == 402, r.text
    detail = r.json()["detail"]
    assert detail["reason"] == "historico_premium"


@pytest.mark.asyncio
async def test_premium_user_can_access_old_month_semanas(client, premium_user_headers, seed_sefirot):
    """Premium user can request very old months."""
    from datetime import datetime
    old_year = datetime.utcnow().year - 2
    r = await client.get(
        f"/espejo/evolucion/jesed/semanas?mes={old_year}-01",
        headers=premium_user_headers,
    )
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_free_user_recent_month_semanas_works(client, free_user_headers, seed_sefirot):
    """Free user can still access the current month's semanas (within 12)."""
    from datetime import datetime
    now = datetime.utcnow()
    r = await client.get(
        f"/espejo/evolucion/jesed/semanas?mes={now.year}-{now.month:02d}",
        headers=free_user_headers,
    )
    assert r.status_code == 200, r.text
