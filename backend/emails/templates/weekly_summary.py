"""Weekly summary email template."""
from datetime import datetime
from typing import Optional

from .base import render_shell


def render_weekly_summary(
    *,
    nombre: str,
    week_start: datetime,
    week_end: datetime,
    top_sefirot: list[tuple[str, int]],
    reflexiones_count: int,
    insight: Optional[str],
    app_url: str,
    preferences_url: str,
) -> str:
    sefirot_items = "".join(
        f'<li style="margin:0 0 6px;"><strong style="color:#fef3c7;">{name}</strong> · {count} actividad{"es" if count != 1 else ""}</li>'
        for name, count in top_sefirot
    )
    sefirot_block = (
        f'<p style="margin:16px 0 8px;color:rgba(254,243,199,0.7);font-size:12px;letter-spacing:0.18em;text-transform:uppercase;">Tus sefirot esta semana</p>'
        f'<ul style="margin:0;padding-left:18px;">{sefirot_items}</ul>'
        if top_sefirot else
        '<p style="margin:8px 0;color:rgba(168,162,158,0.7);font-style:italic;">No registraste actividades esta semana. El templo descansa.</p>'
    )

    reflexiones_block = (
        f'<p style="margin:16px 0 0;">Y volcaste <strong>{reflexiones_count}</strong> reflexión{"es" if reflexiones_count != 1 else ""} en el camino.</p>'
        if reflexiones_count > 0 else ""
    )

    if insight:
        insight_block = (
            f'<div style="margin:20px 0 0;padding:16px;background:rgba(254,243,199,0.05);border-left:2px solid rgba(254,243,199,0.4);border-radius:4px;">'
            f'<p style="margin:0;font-style:italic;color:rgba(254,243,199,0.9);">{insight}</p>'
            f'</div>'
        )
    else:
        insight_block = ""

    body = (
        f'<p style="margin:0;">Hola {nombre},</p>'
        f'<p style="margin:12px 0 0;">Tu semana ({week_start:%d/%m} al {week_end:%d/%m}) en el árbol:</p>'
        + sefirot_block + reflexiones_block + insight_block
    )

    return render_shell(
        preview="Tu semana en el árbol",
        title="Tu semana en el árbol",
        body_html=body,
        cta_label="Ver Mi Evolución",
        cta_url=f"{app_url}/espejo",
        preferences_url=preferences_url,
    )
