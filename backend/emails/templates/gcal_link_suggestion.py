"""Transactional onboarding email — fires once when the user has created
5+ activities but hasn't connected Google Calendar yet (idle ≥2h since
the last creation, so we don't interrupt a creation streak).

Tono aviso/recordatorio: corto, sin métricas, foco en el beneficio práctico
(tener agenda y calendario en un solo lugar)."""
from .base import render_shell


def render_gcal_link_suggestion(
    *,
    nombre: str,
    app_url: str,
    preferences_url: str,
) -> str:
    body = (
        f'<p style="margin:0;">Hola {nombre},</p>'
        f'<p style="margin:14px 0 0;">No olvides que puedes sincronizar '
        f'<strong style="color:#fef3c7;">Kabbalah Space</strong> con tu '
        f'<strong style="color:#fef3c7;">Google Calendar</strong> — así tienes '
        f'tu agenda y tu calendario juntos en un solo lugar.</p>'
        f'<p style="margin:14px 0 0;color:rgba(214,211,209,0.9);">'
        f'Lo que crees en cualquiera de los dos aparece en el otro automáticamente.'
        f'</p>'
        f'<p style="margin:20px 0 0;font-size:13px;color:rgba(168,162,158,0.85);">'
        f'Es opcional. Si prefieres mantenerlos separados, ignora este correo — '
        f'no te lo volveremos a enviar.'
        f'</p>'
    )

    return render_shell(
        preview="No olvides sincronizar con Google Calendar",
        title="Sincroniza con Google Calendar",
        body_html=body,
        cta_label="Sincronizar ahora",
        cta_url=f"{app_url}/cuenta",
        preferences_url=preferences_url,
    )
