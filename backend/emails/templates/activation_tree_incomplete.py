"""Correo etapa B: empezó pero el árbol no está completo (<10 clasificadas).
Español neutro (NO voseo)."""
from .base import render_shell


def render_activation_tree_incomplete(*, nombre: str, faltan: int, app_url: str, preferences_url: str) -> str:
    dim = "dimensión" if faltan == 1 else "dimensiones"
    body = (
        f'<p style="margin:0;">Hola {nombre},</p>'
        f'<p style="margin:14px 0 0;">Ya comenzaste a recorrer tu Árbol — '
        f'te quedan <strong style="color:#fef3c7;">{faltan} {dim}</strong> por explorar '
        f'para completar el mapa.</p>'
        f'<p style="margin:14px 0 0;color:rgba(214,211,209,0.9);">'
        f'Cada dimensión que respondes suma una pieza a la lectura que la IA hace de tu presente.'
        f'</p>'
    )
    return render_shell(
        preview="Te faltan dimensiones por completar",
        title="Completa tu Árbol",
        body_html=body,
        cta_label="Continuar",
        cta_url=f"{app_url}/espejo",
        preferences_url=preferences_url,
    )
