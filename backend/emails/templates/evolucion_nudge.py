"""Monthly nudge to revisit Mi Evolución — fires every ~30 days per user
(based on days since their signup, not calendar day 1, so it doesn't pile
up with the monthly_summary on the same day for premium).

Tono aviso/recordatorio, corto. Igual estética que gcal_link_suggestion."""
from .base import render_shell


def render_evolucion_nudge(
    *,
    nombre: str,
    app_url: str,
    preferences_url: str,
) -> str:
    body = (
        f'<p style="margin:0;">Hola {nombre},</p>'
        f'<p style="margin:14px 0 0;">Pasó un mes — es buen momento para '
        f'<strong style="color:#fef3c7;">ver tu evolución</strong> en el árbol '
        f'y notar los patrones que se dibujaron en este tiempo.</p>'
        f'<p style="margin:14px 0 0;color:rgba(214,211,209,0.9);">'
        f'Las dimensiones que se fortalecieron, las que pidieron más atención, '
        f'y el ritmo con el que recorriste el camino.'
        f'</p>'
        f'<p style="margin:20px 0 0;font-size:13px;color:rgba(168,162,158,0.85);">'
        f'Cada mes te enviamos este aviso para que no pierdas el hilo.'
        f'</p>'
    )

    return render_shell(
        preview="Mira tu evolución del mes",
        title="Tu evolución del mes",
        body_html=body,
        cta_label="Ver mi evolución",
        cta_url=f"{app_url}/evolucion",
        preferences_url=preferences_url,
    )
