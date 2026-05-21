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
