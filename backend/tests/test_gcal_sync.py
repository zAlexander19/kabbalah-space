"""Tests for gcal_sync orchestration. The HTTP client is mocked via respx."""
import httpx
import pytest
import respx
from cryptography.fernet import Fernet

from gcal_client import CALENDAR_API_BASE, GOOGLE_TOKEN_URL
from gcal_sync import enable_sync_for_user, disable_sync_for_user
from fernet import decrypt_token
from models import Usuario


@pytest.fixture
def fkey() -> str:
    return Fernet.generate_key().decode()


@pytest.mark.asyncio
async def test_enable_sync_creates_calendar_and_stores_refresh_token(
    db_session, google_user, fkey, monkeypatch,
):
    monkeypatch.setattr("gcal_sync.get_settings", lambda: _settings_with(fkey))

    with respx.mock:
        respx.post(GOOGLE_TOKEN_URL).mock(
            return_value=httpx.Response(200, json={"access_token": "ya29.fresh", "expires_in": 3600}),
        )
        respx.post(f"{CALENDAR_API_BASE}/calendars").mock(
            return_value=httpx.Response(200, json={"id": "cal_new", "summary": "Kabbalah Space"}),
        )

        await enable_sync_for_user(db_session, google_user.id, refresh_token="1//rtok")

    await db_session.refresh(google_user)
    assert google_user.gcal_sync_enabled is True
    assert google_user.google_calendar_id == "cal_new"
    assert google_user.google_refresh_token_enc is not None
    assert decrypt_token(google_user.google_refresh_token_enc, fkey) == "1//rtok"


@pytest.mark.asyncio
async def test_disable_sync_revokes_and_wipes(
    db_session, google_user, fkey, monkeypatch,
):
    from fernet import encrypt_token
    google_user.gcal_sync_enabled = True
    google_user.google_calendar_id = "cal_abc"
    google_user.google_refresh_token_enc = encrypt_token("1//rtok", fkey)
    await db_session.commit()

    monkeypatch.setattr("gcal_sync.get_settings", lambda: _settings_with(fkey))

    with respx.mock:
        respx.post(GOOGLE_TOKEN_URL).mock(
            return_value=httpx.Response(200, json={"access_token": "ya29.fresh"}),
        )
        respx.delete(f"{CALENDAR_API_BASE}/calendars/cal_abc").mock(
            return_value=httpx.Response(204),
        )
        respx.post("https://oauth2.googleapis.com/revoke").mock(
            return_value=httpx.Response(200),
        )

        await disable_sync_for_user(db_session, google_user.id)

    await db_session.refresh(google_user)
    assert google_user.gcal_sync_enabled is False
    assert google_user.google_calendar_id is None
    assert google_user.google_refresh_token_enc is None


def _settings_with(fkey: str):
    """Mock a Settings instance with fernet_key + google_client_* set."""
    class S:
        fernet_key = fkey
        google_client_id = "cid"
        google_client_secret = "csec"
        google_oauth_configured = True
        gcal_sync_configured = True
    return S()


from datetime import datetime, timezone
from gcal_sync import push_actividad, update_actividad, delete_actividad
from models import Actividad, ActividadSefira, Sefira


async def _seed_user_with_sync(db_session, fkey: str, user) -> None:
    """Helper: mark the test user as sync-enabled."""
    from fernet import encrypt_token
    user.gcal_sync_enabled = True
    user.google_calendar_id = "cal_abc"
    user.google_refresh_token_enc = encrypt_token("1//rtok", fkey)
    await db_session.commit()


async def _seed_actividad(db_session, user_id: str, **overrides) -> Actividad:
    base = dict(
        usuario_id=user_id,
        titulo="Meditate",
        descripcion=None,
        inicio=datetime(2026, 5, 15, 8, 0, tzinfo=timezone.utc),
        fin=datetime(2026, 5, 15, 9, 0, tzinfo=timezone.utc),
        estado="pendiente",
        sync_status="pending",
    )
    base.update(overrides)
    a = Actividad(**base)
    db_session.add(a)
    await db_session.commit()
    await db_session.refresh(a)
    # Tag with jesed sefira (insert if missing)
    existing = (await db_session.execute(
        # use select to avoid duplicate insert errors across test runs
        __import__('sqlalchemy').select(Sefira).where(Sefira.id == "jesed")
    )).scalars().first()
    if not existing:
        db_session.add(Sefira(id="jesed", nombre="Jésed", pilar="derecha", descripcion=""))
        await db_session.commit()
    db_session.add(ActividadSefira(actividad_id=a.id, sefira_id="jesed"))
    await db_session.commit()
    return a


@pytest.mark.asyncio
async def test_push_actividad_success_sets_synced_status(
    db_session, session_maker, google_user, fkey, monkeypatch,
):
    await _seed_user_with_sync(db_session, fkey, google_user)
    act = await _seed_actividad(db_session, google_user.id)
    monkeypatch.setattr("gcal_sync.get_settings", lambda: _settings_with(fkey))

    with respx.mock:
        respx.post(GOOGLE_TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "ya29"}))
        respx.post(f"{CALENDAR_API_BASE}/calendars/cal_abc/events").mock(
            return_value=httpx.Response(200, json={"id": "evt_new"}),
        )

        await push_actividad(session_maker, google_user.id, act.id)

    await db_session.refresh(act)
    assert act.sync_status == "synced"
    assert act.gcal_event_id == "evt_new"


@pytest.mark.asyncio
async def test_push_actividad_500_sets_error_status(
    db_session, session_maker, google_user, fkey, monkeypatch,
):
    await _seed_user_with_sync(db_session, fkey, google_user)
    act = await _seed_actividad(db_session, google_user.id)
    monkeypatch.setattr("gcal_sync.get_settings", lambda: _settings_with(fkey))

    with respx.mock:
        respx.post(GOOGLE_TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "ya29"}))
        respx.post(f"{CALENDAR_API_BASE}/calendars/cal_abc/events").mock(
            return_value=httpx.Response(500),
        )

        await push_actividad(session_maker, google_user.id, act.id)

    await db_session.refresh(act)
    assert act.sync_status == "error"
    assert act.gcal_event_id is None


@pytest.mark.asyncio
async def test_push_actividad_auth_error_disables_sync(
    db_session, session_maker, google_user, fkey, monkeypatch,
):
    await _seed_user_with_sync(db_session, fkey, google_user)
    act = await _seed_actividad(db_session, google_user.id)
    monkeypatch.setattr("gcal_sync.get_settings", lambda: _settings_with(fkey))

    with respx.mock:
        respx.post(GOOGLE_TOKEN_URL).mock(
            return_value=httpx.Response(400, json={"error": "invalid_grant"}),
        )

        await push_actividad(session_maker, google_user.id, act.id)

    await db_session.refresh(google_user)
    assert google_user.gcal_sync_enabled is False
    assert google_user.google_refresh_token_enc is None


@pytest.mark.asyncio
async def test_update_actividad_calls_update_event(
    db_session, session_maker, google_user, fkey, monkeypatch,
):
    await _seed_user_with_sync(db_session, fkey, google_user)
    act = await _seed_actividad(db_session, google_user.id, gcal_event_id="evt_existing", sync_status="synced")
    monkeypatch.setattr("gcal_sync.get_settings", lambda: _settings_with(fkey))

    with respx.mock:
        respx.post(GOOGLE_TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "ya29"}))
        respx.put(f"{CALENDAR_API_BASE}/calendars/cal_abc/events/evt_existing").mock(
            return_value=httpx.Response(200, json={"id": "evt_existing"}),
        )

        await update_actividad(session_maker, google_user.id, act.id)

    await db_session.refresh(act)
    assert act.sync_status == "synced"


@pytest.mark.asyncio
async def test_delete_actividad_calls_delete_event(
    db_session, session_maker, google_user, fkey, monkeypatch,
):
    await _seed_user_with_sync(db_session, fkey, google_user)
    monkeypatch.setattr("gcal_sync.get_settings", lambda: _settings_with(fkey))

    with respx.mock:
        respx.post(GOOGLE_TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "ya29"}))
        route = respx.delete(f"{CALENDAR_API_BASE}/calendars/cal_abc/events/evt_existing").mock(
            return_value=httpx.Response(204),
        )

        await delete_actividad(session_maker, google_user.id, "evt_existing")
        assert route.called


from gcal_sync import backfill_user


@pytest.mark.asyncio
async def test_backfill_iterates_only_pending_and_skips_children(
    db_session, session_maker, google_user, fkey, monkeypatch,
):
    await _seed_user_with_sync(db_session, fkey, google_user)
    monkeypatch.setattr("gcal_sync.get_settings", lambda: _settings_with(fkey))

    # Three activities: single pending, series master pending, series child (should skip)
    a1 = await _seed_actividad(db_session, google_user.id, titulo="Single")
    a2 = await _seed_actividad(
        db_session, google_user.id, titulo="Master",
        serie_id="series-x", rrule="FREQ=WEEKLY",
    )
    a3 = await _seed_actividad(
        db_session, google_user.id, titulo="Child",
        serie_id="series-x", rrule=None,
    )

    with respx.mock:
        respx.post(GOOGLE_TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "ya29"}))
        insert_route = respx.post(f"{CALENDAR_API_BASE}/calendars/cal_abc/events").mock(
            side_effect=[
                httpx.Response(200, json={"id": "evt_1"}),
                httpx.Response(200, json={"id": "evt_2"}),
            ],
        )

        await backfill_user(session_maker, google_user.id)
        assert insert_route.call_count == 2  # only single + master, not child

    for a in (a1, a2, a3):
        await db_session.refresh(a)
    assert a1.sync_status == "synced"
    assert a2.sync_status == "synced"
    assert a3.sync_status == "skipped"
