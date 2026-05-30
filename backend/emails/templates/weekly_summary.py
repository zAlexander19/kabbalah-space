"""Weekly summary email template."""
from datetime import datetime
from typing import Optional

from .base import render_shell


SECTION_LABEL_STYLE = (
    "margin:24px 0 8px;color:rgba(254,243,199,0.75);"
    "font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;"
)


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
    total = sum(c for _, c in top_sefirot)

    # Top sefirot block — labeled with what the numbers mean
    if top_sefirot:
        sefirot_items = "".join(
            f'<li style="margin:0 0 6px;">'
            f'<strong style="color:#fef3c7;">{name}</strong> '
            f'<span style="color:rgba(168,162,158,0.85);">— {count} actividad{"es" if count != 1 else ""}</span>'
            f'</li>'
            for name, count in top_sefirot
        )
        sefirot_block = (
            f'<p style="{SECTION_LABEL_STYLE}">Tus dimensiones más activas</p>'
            f'<p style="margin:0 0 4px;font-size:13px;color:rgba(168,162,158,0.85);">'
            f'Las sefirot que recibieron más actividades del calendario esta semana.'
            f'</p>'
            f'<ul style="margin:8px 0 0;padding-left:18px;">{sefirot_items}</ul>'
            f'<p style="margin:10px 0 0;font-size:13px;color:rgba(168,162,158,0.85);">'
            f'Total: <strong style="color:#fef3c7;">{total}</strong> '
            f'actividad{"es" if total != 1 else ""} en estas dimensiones.'
            f'</p>'
        )
    else:
        sefirot_block = (
            f'<p style="{SECTION_LABEL_STYLE}">Tus dimensiones más activas</p>'
            f'<p style="margin:0;color:rgba(168,162,158,0.85);font-style:italic;">'
            f'No registraste actividades esta semana. El templo descansa.'
            f'</p>'
        )

    # Reflections block — labeled separately so the user knows it's a different metric
    if reflexiones_count > 0:
        reflexiones_block = (
            f'<p style="{SECTION_LABEL_STYLE}">Reflexiones</p>'
            f'<p style="margin:0;">'
            f'Escribiste <strong style="color:#fef3c7;">{reflexiones_count}</strong> '
            f'reflexión{"es" if reflexiones_count != 1 else ""} sobre las preguntas guía.'
            f'</p>'
        )
    else:
        reflexiones_block = (
            f'<p style="{SECTION_LABEL_STYLE}">Reflexiones</p>'
            f'<p style="margin:0;color:rgba(168,162,158,0.85);font-style:italic;">'
            f'Sin reflexiones escritas esta semana.'
            f'</p>'
        )

    if insight:
        insight_block = (
            f'<div style="margin:24px 0 0;padding:16px;background:rgba(254,243,199,0.05);'
            f'border-left:2px solid rgba(254,243,199,0.4);border-radius:4px;">'
            f'<p style="margin:0;font-style:italic;color:rgba(254,243,199,0.9);">{insight}</p>'
            f'</div>'
        )
    else:
        insight_block = ""

    body = (
        f'<p style="margin:0;">Hola {nombre},</p>'
        f'<p style="margin:12px 0 0;">Este es tu resumen del <strong>{week_start:%d/%m}</strong> '
        f'al <strong>{week_end:%d/%m}</strong> en Kabbalah Space:</p>'
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
