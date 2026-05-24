"""Monthly summary email template."""
from typing import Optional

from .base import render_shell


def render_monthly_summary(
    *,
    nombre: str,
    month_label: str,
    sefirot_breakdown: list[tuple[str, int]],
    reflexiones_count: int,
    delta_vs_prev_month: int,
    insight: Optional[str],
    app_url: str,
    preferences_url: str,
) -> str:
    sefirot_items = "".join(
        f'<tr><td style="padding:4px 12px 4px 0;color:#fef3c7;">{name}</td><td style="padding:4px 0;color:#d6d3d1;text-align:right;">{count}</td></tr>'
        for name, count in sefirot_breakdown
    )
    sefirot_table = (
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 0;width:100%;font-size:14px;">{sefirot_items}</table>'
        if sefirot_breakdown else
        '<p style="margin:8px 0;color:rgba(168,162,158,0.7);font-style:italic;">Sin actividades registradas este mes.</p>'
    )

    delta_text = ""
    if delta_vs_prev_month > 0:
        delta_text = f'<p style="margin:12px 0 0;color:rgba(134,239,172,0.85);">Este mes hiciste {delta_vs_prev_month} más que el mes anterior.</p>'
    elif delta_vs_prev_month < 0:
        delta_text = f'<p style="margin:12px 0 0;color:rgba(253,186,116,0.85);">Este mes hiciste {abs(delta_vs_prev_month)} menos que el mes anterior.</p>'

    insight_block = (
        f'<div style="margin:20px 0 0;padding:16px;background:rgba(254,243,199,0.05);border-left:2px solid rgba(254,243,199,0.4);border-radius:4px;">'
        f'<p style="margin:0;font-style:italic;color:rgba(254,243,199,0.9);">{insight}</p>'
        f'</div>'
        if insight else ""
    )

    body = (
        f'<p style="margin:0;">Hola {nombre},</p>'
        f'<p style="margin:12px 0 0;">Tu mes de <strong>{month_label}</strong>:</p>'
        + sefirot_table
        + f'<p style="margin:16px 0 0;">Reflexiones: <strong>{reflexiones_count}</strong>.</p>'
        + delta_text + insight_block
    )

    return render_shell(
        preview=f"Tu mes en el árbol — {month_label}",
        title=f"Tu mes en el árbol",
        body_html=body,
        cta_label="Ver Mi Evolución",
        cta_url=f"{app_url}/evolucion",
        preferences_url=preferences_url,
    )
