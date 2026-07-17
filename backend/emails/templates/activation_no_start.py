"""Correo etapa A: registrado, sin ninguna dimensión respondida.
Español neutro (NO voseo). Estética Templo Digital."""
from .base import render_shell


def render_activation_no_start(*, nombre: str, app_url: str, preferences_url: str) -> str:
    body = (
        f'<p style="margin:0;">Hola {nombre},</p>'
        f'<p style="margin:14px 0 0;">Tu Árbol de la Vida está esperando el primer trazo. '
        f'Elige una dimensión y responde sus preguntas guía: la IA la clasifica y '
        f'comienza a dibujarse tu mapa interior.</p>'
        f'<p style="margin:14px 0 0;color:rgba(214,211,209,0.9);">'
        f'No hay respuestas correctas — solo tu mirada honesta sobre cada aspecto de tu vida.'
        f'</p>'
    )
    return render_shell(
        preview="Tu Árbol de la Vida está esperando",
        title="Comienza tu Árbol",
        body_html=body,
        cta_label="Comenzar ahora",
        cta_url=f"{app_url}/espejo",
        preferences_url=preferences_url,
    )
