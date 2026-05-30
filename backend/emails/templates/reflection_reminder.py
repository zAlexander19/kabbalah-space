"""Reflection reminder email — sent when user has been absent ≥7 days
AND has guide questions available."""
from .base import render_shell


def render_reflection_reminder(
    *,
    nombre: str,
    pregunta_texto: str,
    sefira_nombre: str,
    app_url: str,
    preferences_url: str,
) -> str:
    body = (
        f'<p style="margin:0;">Hola {nombre},</p>'
        f'<p style="margin:12px 0 0;">Una pregunta espera por ti en <strong style="color:#fef3c7;">{sefira_nombre}</strong>:</p>'
        f'<p style="margin:16px 0 0;padding:16px;background:rgba(0,0,0,0.3);border-radius:8px;font-style:italic;color:rgba(254,243,199,0.9);">{pregunta_texto}</p>'
    )

    return render_shell(
        preview="Una pregunta espera por ti",
        title="Una pregunta espera por ti",
        body_html=body,
        cta_label="Responder",
        cta_url=f"{app_url}/espejo",
        preferences_url=preferences_url,
    )
