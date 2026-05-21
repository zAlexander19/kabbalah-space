"""Test que /evaluate llama a KSpaceAi.evaluate_reflection cuando el usuario
tiene ksai_enabled=True, y cae al stub determinista cuando es False."""
from unittest.mock import patch, AsyncMock

import pytest


@pytest.mark.asyncio
async def test_evaluate_uses_kspaceai_when_user_enabled(
    client, seed_sefirot, two_users,
):
    alice = two_users["alice"]
    with patch("main.kspace_ai.evaluate_reflection", new_callable=AsyncMock) as mock:
        mock.return_value = (7.5, "Buena reflexión.")
        r = await client.post(
            "/evaluate",
            json={"sefira": "Tiféret", "sefira_id": "tiferet", "text": "hola", "score": 6},
            headers=alice["headers"],
        )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ai_score"] == 7.5
    assert data["feedback"] == "Buena reflexión."
    mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_evaluate_skips_kspaceai_when_user_disabled(
    client, db_session, seed_sefirot, two_users,
):
    alice = two_users["alice"]
    # Desactivar el toggle directamente en DB
    from models import Usuario
    from sqlalchemy import select
    u = (await db_session.execute(
        select(Usuario).where(Usuario.id == alice["id"])
    )).scalars().first()
    u.ksai_enabled = False
    await db_session.commit()

    with patch("main.kspace_ai.evaluate_reflection", new_callable=AsyncMock) as mock:
        r = await client.post(
            "/evaluate",
            json={"sefira": "Tiféret", "sefira_id": "tiferet", "text": "hola", "score": 6},
            headers=alice["headers"],
        )
    assert r.status_code == 200, r.text
    # El stub determinista NO debería haber llamado al servicio
    mock.assert_not_called()
    # El feedback es el hardcodeado-stub o el genérico
    data = r.json()
    assert "ai_score" in data
