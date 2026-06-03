import pytest

pytestmark = pytest.mark.asyncio


async def test_stats_forbidden_for_normal(client, normal_user_headers):
    r = await client.get("/admin/stats", headers=normal_user_headers)
    assert r.status_code == 403


async def test_stats_shape(client, admin_user_headers, two_users):
    r = await client.get("/admin/stats", headers=admin_user_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body.keys()) == {"usuarios", "actividad", "premium"}
    assert body["usuarios"]["total"] >= 3
    assert "por_provider" in body["usuarios"]
    assert "email" in body["usuarios"]["por_provider"]
    assert {"reflexiones_total", "respuestas_total", "actividades_total",
            "usuarios_activos_7d", "usuarios_activos_30d", "gcal_sync_activos"} <= set(body["actividad"].keys())
    assert {"activos", "trial", "cancelados", "por_plan"} <= set(body["premium"].keys())


async def test_stats_counts_premium(client, admin_user_headers, premium_user_headers):
    r = await client.get("/admin/stats", headers=admin_user_headers)
    body = r.json()
    assert body["usuarios"]["premium"] >= 1
    assert body["premium"]["activos"] >= 1
