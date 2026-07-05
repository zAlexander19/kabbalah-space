"""Tests del hardening perimetral: rate limits, security headers,
límites de tamaño de input y guard de secretos en producción."""
import pytest

from config import Settings, assert_production_secrets
from tests.conftest import register_and_login


# ---------------------------------------------------------------- rate limits

@pytest.mark.asyncio
async def test_login_rate_limited_after_10_attempts(client, db_session):
    await register_and_login(db_session, "brute@example.com", "correcta1", "Brute")
    for _ in range(10):
        r = await client.post(
            "/auth/login", json={"email": "brute@example.com", "password": "incorrecta"}
        )
        assert r.status_code == 401
    r = await client.post(
        "/auth/login", json={"email": "brute@example.com", "password": "incorrecta"}
    )
    assert r.status_code == 429
    assert "Retry-After" in r.headers


# ------------------------------------------------------------ security headers

@pytest.mark.asyncio
async def test_security_headers_present(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert r.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    # Sin https no debe haber HSTS (evita fijarlo en dev).
    assert "Strict-Transport-Security" not in r.headers


@pytest.mark.asyncio
async def test_hsts_only_behind_https(client):
    r = await client.get("/health", headers={"x-forwarded-proto": "https"})
    assert "Strict-Transport-Security" in r.headers


# ------------------------------------------------------------------ body/input

@pytest.mark.asyncio
async def test_oversized_body_rejected(client):
    r = await client.post(
        "/auth/login",
        content=b"x" * 1_100_000,
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 413


@pytest.mark.asyncio
async def test_respuesta_texto_max_length(client, seeded_pregunta, free_user_headers):
    r = await client.post(
        "/respuestas",
        json={"pregunta_id": seeded_pregunta.id, "respuesta_texto": "x" * 20_001},
        headers=free_user_headers,
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_actividad_titulo_max_length(client, seed_sefirot, free_user_headers):
    r = await client.post(
        "/actividades",
        json={
            "titulo": "x" * 201,
            "inicio": "2026-07-02T10:00:00",
            "fin": "2026-07-02T11:00:00",
            "sefirot_ids": ["jesed"],
        },
        headers=free_user_headers,
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_reflexion_libre_max_length(client, seed_sefirot, free_user_headers):
    r = await client.post(
        "/reflexiones-libres",
        json={"tipo": "arbol", "contenido": "x" * 20_001},
        headers=free_user_headers,
    )
    assert r.status_code == 422


# ------------------------------------------------------------ production guard

def test_production_guard_rejects_default_jwt_secret():
    s = Settings(environment="production", jwt_secret="change-me-in-prod")
    with pytest.raises(RuntimeError):
        assert_production_secrets(s)


def test_production_guard_accepts_real_secret():
    assert_production_secrets(Settings(environment="production", jwt_secret="s3creto-fuerte"))


def test_dev_allows_default_secret():
    assert_production_secrets(Settings(environment="development", jwt_secret="change-me-in-prod"))
