"""Tests for the 'clasificada' field on /espejo/resumen (Task 10).

'clasificada' es True cuando la sefirá tiene al menos un RegistroDiario con
puntuacion_ia no nulo para el usuario autenticado (definición del funnel).
"""
from __future__ import annotations

from datetime import datetime, timezone

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models import RegistroDiario


async def test_resumen_marks_clasificada_true_when_ia_score_exists(
    client: AsyncClient, seed_sefirot, two_users, db_session: AsyncSession
):
    alice = two_users["alice"]

    db_session.add(RegistroDiario(
        usuario_id=alice["id"], sefira_id="keter",
        puntuacion_ia=8, reflexion_texto=None,
        fecha_registro=datetime.now(timezone.utc),
    ))
    await db_session.commit()

    res = await client.get("/espejo/resumen", headers=alice["headers"])
    assert res.status_code == 200
    data = {r["sefira_id"]: r for r in res.json()}

    # keter tiene un registro con puntuacion_ia -> clasificada True
    assert data["keter"]["clasificada"] is True

    # jesed no tiene ningún RegistroDiario -> clasificada False
    assert data["jesed"]["clasificada"] is False
