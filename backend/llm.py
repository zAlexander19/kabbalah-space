"""KSpace-AI: wrapper sobre Gemini para evaluar reflexiones y leer el árbol.

Diseño:
- Una instancia configurada con (provider, api_key). Si provider != "gemini"
  o falta api_key, todas las llamadas devuelven fallbacks deterministas.
- Si el cliente Gemini tira cualquier excepción, también cae al fallback —
  el usuario nunca queda bloqueado por un problema de IA.
"""
from __future__ import annotations

import json
import logging
import random
from typing import Optional


logger = logging.getLogger(__name__)


STUB_FEEDBACK = (
    "KSpace-AI no está disponible en este momento. "
    "Tu reflexión fue guardada y se evaluará cuando vuelva el servicio."
)

EVAL_PROMPT_TEMPLATE = """Sos KSpace-AI, una guía contemplativa basada en la Cábala. Un usuario reflexionó sobre la sefirá "{sefira}" y se autopuntuó {user_score}/10.

Texto del usuario:
\"\"\"
{texto}
\"\"\"

Tarea: leer el texto y devolver en JSON estricto:
- "score": un número 1-10 (puede ser decimal con 1 cifra) reflejando profundidad/coherencia/sinceridad de la reflexión sobre esta sefirá. No es la calidad de la prosa — es qué tanto el texto realmente toca el arquetipo de la sefirá.
- "feedback": 2-3 frases breves en español rioplatense, tono contemplativo, sin moralizar ni dar órdenes. Reflejá lo que ves, sin prescribir.

Devolvé solo el JSON, sin texto antes ni después."""

CAL_READING_PROMPT_TEMPLATE = """Sos KSpace-AI. Estas sefirot del usuario tienen promedio bajo este mes (escala 1-10):

{lista}

Escribí una observación breve (máx 3 frases) en español rioplatense. Tono respetuoso, no moralices ni des órdenes — solo describí lo que ves y mencioná tipos de actividades que tienden a fortalecer cada una. No uses listas con viñetas; que sea un párrafo corrido.

Devolvé solo el texto, sin titulos ni encabezados."""


class KSpaceAi:
    def __init__(self, provider: str, api_key: str, client=None):
        """provider: "stub" o "gemini". client opcional: para inyectar en tests."""
        self.provider = provider
        self.api_key = api_key
        self._client = client

    @property
    def enabled(self) -> bool:
        return self.provider == "gemini" and bool(self.api_key)

    def _get_client(self):
        if self._client is not None:
            return self._client
        # Importación perezosa: solo intentamos importar google-genai si se va
        # a usar de verdad.
        from google import genai
        self._client = genai.Client(api_key=self.api_key)
        return self._client

    # ---- Sync versions (mantenidas para tests sincrónicos) ----

    def evaluate_reflection_sync(
        self, sefira_nombre: str, texto: str, user_score: float,
    ) -> tuple[float, str]:
        return self._stub_evaluate(user_score)

    def generate_calendar_reading_sync(
        self, sefirot_debiles: list[tuple[str, float]],
    ) -> Optional[str]:
        return None

    # ---- Async versions ----

    async def evaluate_reflection(
        self, sefira_nombre: str, texto: str, user_score: float,
    ) -> tuple[float, str]:
        if not self.enabled:
            return self._stub_evaluate(user_score)
        try:
            client = self._get_client()
            prompt = EVAL_PROMPT_TEMPLATE.format(
                sefira=sefira_nombre,
                user_score=round(user_score, 1),
                texto=texto.strip()[:2000],  # límite duro para no escalar tokens
            )
            resp = await client.aio.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )
            data = json.loads(resp.text)
            score = float(data["score"])
            score = max(1.0, min(10.0, score))
            feedback = str(data["feedback"]).strip()
            return score, feedback
        except Exception as e:
            logger.warning("KSpaceAi.evaluate_reflection fallback to stub: %s", e)
            return self._stub_evaluate(user_score)

    async def generate_calendar_reading(
        self, sefirot_debiles: list[tuple[str, float]],
    ) -> Optional[str]:
        if not self.enabled:
            return None
        if not sefirot_debiles:
            return None
        try:
            client = self._get_client()
            lista = "\n".join(f"- {nombre}: {score:.1f}" for nombre, score in sefirot_debiles)
            prompt = CAL_READING_PROMPT_TEMPLATE.format(lista=lista)
            resp = await client.aio.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )
            return resp.text.strip() or None
        except Exception as e:
            logger.warning("KSpaceAi.generate_calendar_reading fallback to None: %s", e)
            return None

    # ---- Stub helpers ----

    @staticmethod
    def _stub_evaluate(user_score: float) -> tuple[float, str]:
        jitter = random.choice([-1.5, -0.5, 0.0, 0.5, 1.5])
        score = max(1.0, min(10.0, user_score + jitter))
        return score, STUB_FEEDBACK
