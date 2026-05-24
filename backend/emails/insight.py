"""Hook for AI-generated insights in email content.

In Phase 1 (this plan), returns None for everything → templates fall back
to a generic plantilla with raw data. In Phase 2, this module wires up to
the KSpace-AI motor (POST /ai/insight) and returns 1-3 paragraphs of
personalized analysis in Spanish.

The contract:
- Input: usuario_id, tipo, periodo_start, periodo_end
- Output: str (paragraph(s)) or None (no AI available — caller uses fallback)
"""
from datetime import datetime
from typing import Optional, Literal

InsightType = Literal["weekly", "monthly", "imbalance", "reminder"]


async def generate_insight(
    usuario_id: str,
    tipo: InsightType,
    periodo_start: datetime,
    periodo_end: datetime,
) -> Optional[str]:
    """Return a generative AI insight or None.

    Phase 1: always None. Phase 2 will call the IA endpoint.
    """
    return None
