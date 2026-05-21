"""Tests integración para los endpoints PATCH /usuarios/me/ksai y /ia/calendario/*."""
import pytest


@pytest.mark.asyncio
async def test_patch_ksai_toggles_flag(client, seed_sefirot, two_users):
    alice = two_users["alice"]

    # Default: enabled
    r = await client.get("/auth/me", headers=alice["headers"])
    assert r.status_code == 200
    assert r.json()["ksai_enabled"] is True

    # Desactivar
    r = await client.patch(
        "/usuarios/me/ksai",
        json={"enabled": False},
        headers=alice["headers"],
    )
    assert r.status_code == 200
    assert r.json()["ksai_enabled"] is False

    # /auth/me lo refleja
    r = await client.get("/auth/me", headers=alice["headers"])
    assert r.json()["ksai_enabled"] is False

    # Reactivar
    r = await client.patch(
        "/usuarios/me/ksai",
        json={"enabled": True},
        headers=alice["headers"],
    )
    assert r.status_code == 200
    assert r.json()["ksai_enabled"] is True


@pytest.mark.asyncio
async def test_patch_ksai_requires_auth(client):
    r = await client.patch("/usuarios/me/ksai", json={"enabled": False})
    assert r.status_code == 401


from datetime import datetime, timezone
from sqlalchemy import select
from unittest.mock import patch, AsyncMock


@pytest.mark.asyncio
async def test_lectura_status_no_data_sin_reflexiones(client, seed_sefirot, two_users):
    """Usuario sin reflexiones este mes → no_data."""
    alice = two_users["alice"]
    r = await client.get("/ia/calendario/lectura", headers=alice["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "no_data"
    assert body["weak_sefirot"] == []
    assert "Aún sin reflexiones" in body["message"]


@pytest.mark.asyncio
async def test_lectura_status_disabled_si_toggle_off(
    client, db_session, seed_sefirot, two_users,
):
    alice = two_users["alice"]
    from models import Usuario
    u = (await db_session.execute(
        select(Usuario).where(Usuario.id == alice["id"])
    )).scalars().first()
    u.ksai_enabled = False
    await db_session.commit()

    r = await client.get("/ia/calendario/lectura", headers=alice["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "disabled"
    assert body["weak_sefirot"] == []
    assert "Activá KSpace-AI" in body["message"]


@pytest.mark.asyncio
async def test_lectura_status_balanced_si_promedio_alto(
    client, db_session, seed_sefirot, two_users,
):
    """Reflexión este mes con scores altos → balanced."""
    alice = two_users["alice"]
    from models import RegistroDiario
    now = datetime.utcnow()
    db_session.add(RegistroDiario(
        sefira_id="tiferet",
        reflexion_texto="x",
        puntuacion_usuario=8,
        puntuacion_ia=8,
        usuario_id=alice["id"],
        fecha_registro=now,
    ))
    await db_session.commit()

    r = await client.get("/ia/calendario/lectura", headers=alice["headers"])
    body = r.json()
    assert body["status"] == "balanced"
    assert body["weak_sefirot"] == []
    assert "balanceado" in body["message"]


@pytest.mark.asyncio
async def test_lectura_status_weak_llama_a_kspace_ai(
    client, db_session, seed_sefirot, two_users,
):
    """Una sefirá con promedio < 5 → status=weak, llama al LLM."""
    alice = two_users["alice"]
    from models import RegistroDiario
    now = datetime.utcnow()
    # tiferet promedio 3.5 (user=3, ia=4)
    db_session.add(RegistroDiario(
        sefira_id="tiferet",
        reflexion_texto="x",
        puntuacion_usuario=3,
        puntuacion_ia=4,
        usuario_id=alice["id"],
        fecha_registro=now,
    ))
    await db_session.commit()

    with patch("main.kspace_ai.generate_calendar_reading", new_callable=AsyncMock) as mock:
        mock.return_value = "Tu Tiféret pide equilibrio."
        r = await client.get("/ia/calendario/lectura", headers=alice["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "weak"
    assert len(body["weak_sefirot"]) == 1
    assert body["weak_sefirot"][0]["id"] == "tiferet"
    assert body["weak_sefirot"][0]["score"] == 3.5
    assert body["message"] == "Tu Tiféret pide equilibrio."
    mock.assert_awaited_once_with([("Tiféret", 3.5)])


@pytest.mark.asyncio
async def test_lectura_status_weak_message_null_si_llm_falla(
    client, db_session, seed_sefirot, two_users,
):
    alice = two_users["alice"]
    from models import RegistroDiario
    db_session.add(RegistroDiario(
        sefira_id="tiferet", reflexion_texto="x",
        puntuacion_usuario=3, puntuacion_ia=4,
        usuario_id=alice["id"], fecha_registro=datetime.utcnow(),
    ))
    await db_session.commit()

    with patch("main.kspace_ai.generate_calendar_reading", new_callable=AsyncMock) as mock:
        mock.return_value = None
        r = await client.get("/ia/calendario/lectura", headers=alice["headers"])
    body = r.json()
    assert body["status"] == "weak"
    assert body["message"] is None
    assert len(body["weak_sefirot"]) == 1


@pytest.mark.asyncio
async def test_lectura_aisla_por_usuario(client, db_session, seed_sefirot, two_users):
    """Reflexiones de Bob no afectan la lectura de Alice."""
    alice = two_users["alice"]
    bob = two_users["bob"]
    from models import RegistroDiario
    # Bob tiene una sefirá floja
    db_session.add(RegistroDiario(
        sefira_id="tiferet", reflexion_texto="x",
        puntuacion_usuario=2, puntuacion_ia=2,
        usuario_id=bob["id"], fecha_registro=datetime.utcnow(),
    ))
    await db_session.commit()

    r = await client.get("/ia/calendario/lectura", headers=alice["headers"])
    body = r.json()
    # Alice no debería ver nada (no tiene data propia)
    assert body["status"] == "no_data"
