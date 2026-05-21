"""KSpace-AI: wrapper sobre Gemini para evaluar reflexiones y leer el árbol.

Diseño:
- Una instancia configurada con (provider, api_key). Si provider != "gemini"
  o falta api_key, todas las llamadas devuelven fallbacks deterministas.
- Las llamadas reales a Gemini van a implementarse en una próxima tarea.

Cada función tiene dos variantes: la async (la que usa FastAPI) y un
`*_sync` que existe solo para tests sincrónicos en este módulo aislado.
"""
from __future__ import annotations

import random
from typing import Optional


STUB_FEEDBACK = (
    "KSpace-AI no está disponible en este momento. "
    "Tu reflexión fue guardada y se evaluará cuando vuelva el servicio."
)


class KSpaceAi:
    def __init__(self, provider: str, api_key: str):
        self.provider = provider
        self.api_key = api_key

    @property
    def enabled(self) -> bool:
        return self.provider == "gemini" and bool(self.api_key)

    # ---- Sync versions (para tests + composability) ----

    def evaluate_reflection_sync(
        self, sefira_nombre: str, texto: str, user_score: float,
    ) -> tuple[float, str]:
        if not self.enabled:
            return self._stub_evaluate(user_score)
        # Real call irá en la próxima tarea
        return self._stub_evaluate(user_score)

    def generate_calendar_reading_sync(
        self, sefirot_debiles: list[tuple[str, float]],
    ) -> Optional[str]:
        if not self.enabled:
            return None
        # Real call irá en la próxima tarea
        return None

    # ---- Async versions (las que usa FastAPI) ----

    async def evaluate_reflection(
        self, sefira_nombre: str, texto: str, user_score: float,
    ) -> tuple[float, str]:
        return self.evaluate_reflection_sync(sefira_nombre, texto, user_score)

    async def generate_calendar_reading(
        self, sefirot_debiles: list[tuple[str, float]],
    ) -> Optional[str]:
        return self.generate_calendar_reading_sync(sefirot_debiles)

    # ---- Stub helpers ----

    @staticmethod
    def _stub_evaluate(user_score: float) -> tuple[float, str]:
        jitter = random.choice([-1.5, -0.5, 0.0, 0.5, 1.5])
        score = max(1.0, min(10.0, user_score + jitter))
        return score, STUB_FEEDBACK
