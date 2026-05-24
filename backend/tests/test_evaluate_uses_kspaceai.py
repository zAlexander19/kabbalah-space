"""Test que /evaluate guarda la reflexión sin llamar a KSpace-AI.

La IA ya no evalúa reflexiones libres — eso ahora lo hace POST
/ia/respuestas/evaluar sobre las respuestas a preguntas guía. La reflexión
libre queda como nota personal con auto-puntuación.
"""
from unittest.mock import patch, AsyncMock

import pytest
from sqlalchemy import select


@pytest.mark.asyncio
async def test_evaluate_guarda_reflexion_sin_llamar_ia(
    client, db_session, seed_sefirot, two_users,
):
    """/evaluate guarda RegistroDiario con puntuacion_ia=NULL y no llama al LLM."""
    from models import RegistroDiario
    alice = two_users["alice"]

    with patch("main.kspace_ai.evaluate_reflection", new_callable=AsyncMock) as mock:
        r = await client.post(
            "/evaluate",
            json={"sefira": "Tiféret", "sefira_id": "tiferet", "text": "hola mundo", "score": 6},
            headers=alice["headers"],
        )
    assert r.status_code == 200, r.text
    assert r.json() == {"saved": True}
    mock.assert_not_called()

    rows = (await db_session.execute(
        select(RegistroDiario).where(RegistroDiario.usuario_id == alice["id"])
    )).scalars().all()
    assert len(rows) == 1
    assert rows[0].reflexion_texto == "hola mundo"
    assert rows[0].puntuacion_usuario == 6
    assert rows[0].puntuacion_ia is None


@pytest.mark.asyncio
async def test_evaluate_ignora_ksai_enabled(
    client, db_session, seed_sefirot, two_users,
):
    """Aunque ksai_enabled sea True, /evaluate no llama a la IA."""
    from models import Usuario
    alice = two_users["alice"]
    u = (await db_session.execute(
        select(Usuario).where(Usuario.id == alice["id"])
    )).scalars().first()
    assert u.ksai_enabled is True  # default

    with patch("main.kspace_ai.evaluate_reflection", new_callable=AsyncMock) as mock:
        r = await client.post(
            "/evaluate",
            json={"sefira": "Tiféret", "sefira_id": "tiferet", "text": "x", "score": 5},
            headers=alice["headers"],
        )
    assert r.status_code == 200
    mock.assert_not_called()
