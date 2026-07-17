"""Correo etapa C: árbol clasificado pero sin actividades registradas.
Español neutro (NO voseo)."""
from .base import render_shell


def render_activation_no_activity(*, nombre: str, app_url: str, preferences_url: str) -> str:
    body = (
        f'<p style="margin:0;">Hola {nombre},</p>'
        f'<p style="margin:14px 0 0;">Clasificaste tus dimensiones — '
        f'ahora dales vida. Registra actividades en tu calendario y conéctalas con '
        f'las sefirot que trabajan en cada momento de tu día.</p>'
        f'<p style="margin:14px 0 0;color:rgba(214,211,209,0.9);">'
        f'Así el árbol deja de ser un retrato y se vuelve un seguimiento vivo de tu equilibrio.'
        f'</p>'
    )
    return render_shell(
        preview="Dale vida a tus dimensiones",
        title="Registra tu primera actividad",
        body_html=body,
        cta_label="Ir al calendario",
        cta_url=f"{app_url}/calendario",
        preferences_url=preferences_url,
    )
