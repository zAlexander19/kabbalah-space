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
