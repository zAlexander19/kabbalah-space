"""Imbalance alert email — fires when a sefira hasn't been touched in >14 days."""
from .base import render_shell


def render_imbalance_alert(
    *,
    nombre: str,
    sefira_nombre: str,
    days_since: int,
    app_url: str,
    preferences_url: str,
) -> str:
    body = (
        f'<p style="margin:0;">Hola {nombre},</p>'
        f'<p style="margin:12px 0 0;">Hace <strong>{days_since} días</strong> que <strong style="color:#fef3c7;">{sefira_nombre}</strong> no recibe atención.</p>'
        f'<p style="margin:12px 0 0;color:rgba(168,162,158,0.85);">El árbol vive en equilibrio. Tal vez sea momento de visitarla.</p>'
    )

    return render_shell(
        preview=f"{sefira_nombre} te espera",
        title=f"{sefira_nombre} te espera",
        body_html=body,
        cta_label=f"Visitar {sefira_nombre}",
        cta_url=f"{app_url}/espejo",
        preferences_url=preferences_url,
    )
