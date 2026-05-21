import json
from unittest.mock import MagicMock

import pytest
from llm import KSpaceAi


def test_kspace_ai_stub_mode_evaluate_reflection():
    """Cuando provider != 'gemini' o falta api_key, evaluate_reflection cae al stub."""
    svc = KSpaceAi(provider="stub", api_key="")
    score, feedback = svc.evaluate_reflection_sync(
        sefira_nombre="Tiféret", texto="Hoy intenté equilibrar.", user_score=6.0,
    )
    assert 1.0 <= score <= 10.0
    assert isinstance(feedback, str) and len(feedback) > 0


def test_kspace_ai_stub_mode_calendar_reading():
    """En modo stub, generate_calendar_reading devuelve None (frontend oculta texto)."""
    svc = KSpaceAi(provider="stub", api_key="")
    result = svc.generate_calendar_reading_sync([("Tiféret", 4.2)])
    assert result is None


@pytest.mark.asyncio
async def test_evaluate_reflection_calls_gemini_and_parses_json():
    """En modo gemini, llama al cliente y parsea el JSON de respuesta."""
    # Mock que simula el cliente google-genai
    fake_client = MagicMock()
    fake_resp = MagicMock()
    fake_resp.text = json.dumps({
        "score": 7.5,
        "feedback": "Tu reflexión muestra una búsqueda de equilibrio.",
    })
    fake_client.aio.models.generate_content = MagicMock(
        return_value=_async_return(fake_resp)
    )

    svc = KSpaceAi(provider="gemini", api_key="fake-key", client=fake_client)
    score, feedback = await svc.evaluate_reflection(
        sefira_nombre="Tiféret", texto="Hoy intenté equilibrar.", user_score=6.0,
    )

    assert score == 7.5
    assert "equilibrio" in feedback.lower()


@pytest.mark.asyncio
async def test_evaluate_reflection_falls_back_on_exception():
    """Si el cliente tira excepción (timeout, rate limit, etc), cae al stub."""
    fake_client = MagicMock()
    fake_client.aio.models.generate_content = MagicMock(
        side_effect=Exception("simulated timeout")
    )

    svc = KSpaceAi(provider="gemini", api_key="fake-key", client=fake_client)
    score, feedback = await svc.evaluate_reflection(
        sefira_nombre="Tiféret", texto="x", user_score=5.0,
    )

    # Cayó al stub: score en rango, feedback es el STUB_FEEDBACK
    assert 1.0 <= score <= 10.0
    assert "KSpace-AI no está disponible" in feedback


@pytest.mark.asyncio
async def test_calendar_reading_calls_gemini_and_returns_text():
    fake_client = MagicMock()
    fake_resp = MagicMock()
    fake_resp.text = "Tu Tiféret está en 4.2 — buscás más equilibrio que del que disponés."
    fake_client.aio.models.generate_content = MagicMock(
        return_value=_async_return(fake_resp)
    )

    svc = KSpaceAi(provider="gemini", api_key="fake-key", client=fake_client)
    text = await svc.generate_calendar_reading([("Tiféret", 4.2), ("Yesod", 3.8)])

    assert text is not None
    assert "Tiféret" in text


@pytest.mark.asyncio
async def test_calendar_reading_empty_input_returns_none():
    """Sin sefirot débiles, no se llama a Gemini."""
    fake_client = MagicMock()
    fake_client.aio.models.generate_content = MagicMock(
        side_effect=AssertionError("no debería llamarse"),
    )
    svc = KSpaceAi(provider="gemini", api_key="fake-key", client=fake_client)
    assert await svc.generate_calendar_reading([]) is None


@pytest.mark.asyncio
async def test_calendar_reading_fallback_on_exception():
    fake_client = MagicMock()
    fake_client.aio.models.generate_content = MagicMock(
        side_effect=Exception("rate limit")
    )
    svc = KSpaceAi(provider="gemini", api_key="fake-key", client=fake_client)
    assert await svc.generate_calendar_reading([("Tiféret", 4.2)]) is None


def _async_return(value):
    async def _coro():
        return value
    return _coro()
