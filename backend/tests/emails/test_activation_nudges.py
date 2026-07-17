"""Tests de los correos de activación (embudo A→B→C)."""
import pytest
import respx
from datetime import datetime, timedelta, timezone
from httpx import Response
from sqlalchemy import select

from models import Usuario, Sefira, PreguntaSefira, RespuestaPregunta, RegistroDiario, Actividad, ActividadSefira
from emails.models import EmailLog
from emails.templates.activation_no_start import render_activation_no_start
from emails.templates.activation_tree_incomplete import render_activation_tree_incomplete
from emails.templates.activation_no_activity import render_activation_no_activity


def _assert_no_voseo(html: str):
    assert "podés" not in html and "querés" not in html and "preferís" not in html


def test_no_start_template_render():
    html = render_activation_no_start(
        nombre="Alex", app_url="https://kabbalahspace.app",
        preferences_url="https://kabbalahspace.app/cuenta",
    )
    assert "Alex" in html
    assert "kabbalahspace.app/cuenta" in html
    assert "Comenzar" in html  # CTA label
    _assert_no_voseo(html)


def test_tree_incomplete_template_render():
    html = render_activation_tree_incomplete(
        nombre="Alex", faltan=6, app_url="https://kabbalahspace.app",
        preferences_url="https://kabbalahspace.app/cuenta",
    )
    assert "Alex" in html
    assert "6" in html  # cuántas faltan
    _assert_no_voseo(html)


def test_no_activity_template_render():
    html = render_activation_no_activity(
        nombre="Alex", app_url="https://kabbalahspace.app",
        preferences_url="https://kabbalahspace.app/cuenta",
    )
    assert "Alex" in html
    assert "/calendario" in html  # CTA hacia el calendario
    _assert_no_voseo(html)
