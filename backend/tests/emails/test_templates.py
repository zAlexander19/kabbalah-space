"""Tests for each email template — they render and contain the key data points."""
from datetime import datetime, timezone, timedelta

from emails.templates.weekly_summary import render_weekly_summary
from emails.templates.monthly_summary import render_monthly_summary
from emails.templates.imbalance_alert import render_imbalance_alert
from emails.templates.reflection_reminder import render_reflection_reminder


FROZEN_NOW = datetime(2026, 5, 24, 12, 0, tzinfo=timezone.utc)


def test_weekly_summary_includes_top_sefirot_and_counts():
    html = render_weekly_summary(
        nombre="Alex",
        week_start=FROZEN_NOW - timedelta(days=7),
        week_end=FROZEN_NOW,
        top_sefirot=[("Jésed", 3), ("Tiféret", 2)],
        reflexiones_count=2,
        insight=None,
        app_url="https://kabbalahspace.app",
        preferences_url="https://kabbalahspace.app/cuenta",
    )
    assert "Jésed" in html and "3" in html
    assert "Tiféret" in html
    assert "Alex" in html
    assert "kabbalahspace.app/espejo" in html


def test_weekly_summary_uses_insight_when_provided():
    insight = "Esta semana mostraste mucha actividad en el pilar derecho."
    html = render_weekly_summary(
        nombre="Alex",
        week_start=FROZEN_NOW - timedelta(days=7),
        week_end=FROZEN_NOW,
        top_sefirot=[("Jésed", 3)],
        reflexiones_count=1,
        insight=insight,
        app_url="https://x.com",
        preferences_url="https://x.com/cuenta",
    )
    assert insight in html


def test_weekly_summary_empty_state():
    """No sefirot + 0 reflexiones → templo descansa copy."""
    html = render_weekly_summary(
        nombre="Alex",
        week_start=FROZEN_NOW - timedelta(days=7),
        week_end=FROZEN_NOW,
        top_sefirot=[],
        reflexiones_count=0,
        insight=None,
        app_url="https://x.com",
        preferences_url="https://x.com/cuenta",
    )
    assert "templo descansa" in html.lower()


def test_monthly_summary_includes_month_label():
    html = render_monthly_summary(
        nombre="Alex",
        month_label="mayo de 2026",
        sefirot_breakdown=[("Jésed", 12), ("Gueburá", 5)],
        reflexiones_count=8,
        delta_vs_prev_month=+3,
        insight=None,
        app_url="https://x.com",
        preferences_url="https://x.com/cuenta",
    )
    assert "mayo de 2026" in html
    assert "Jésed" in html
    assert "Gueburá" in html


def test_monthly_summary_positive_delta_message():
    html = render_monthly_summary(
        nombre="Alex",
        month_label="mayo de 2026",
        sefirot_breakdown=[("Jésed", 12)],
        reflexiones_count=8,
        delta_vs_prev_month=+5,
        insight=None,
        app_url="https://x.com",
        preferences_url="https://x.com/cuenta",
    )
    assert "5 más" in html or "5 mas" in html


def test_monthly_summary_negative_delta_message():
    html = render_monthly_summary(
        nombre="Alex",
        month_label="mayo de 2026",
        sefirot_breakdown=[("Jésed", 12)],
        reflexiones_count=8,
        delta_vs_prev_month=-3,
        insight=None,
        app_url="https://x.com",
        preferences_url="https://x.com/cuenta",
    )
    assert "3 menos" in html


def test_imbalance_alert_includes_sefira_and_days():
    html = render_imbalance_alert(
        nombre="Alex",
        sefira_nombre="Gueburá",
        days_since=18,
        app_url="https://x.com",
        preferences_url="https://x.com/cuenta",
    )
    assert "Gueburá" in html
    assert "18" in html


def test_reflection_reminder_includes_pregunta_text():
    pregunta = "¿Qué decisión venís postergando?"
    html = render_reflection_reminder(
        nombre="Alex",
        pregunta_texto=pregunta,
        sefira_nombre="Tiféret",
        app_url="https://x.com",
        preferences_url="https://x.com/cuenta",
    )
    assert pregunta in html
    assert "Tiféret" in html
