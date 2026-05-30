"""Render the 4 email templates with dummy data and write them to
`email-previews/*.html` so they can be opened locally in a browser.

Run with: venv/Scripts/python.exe scripts/preview_emails.py
"""
import os
import sys
from datetime import datetime, timezone, timedelta

# Allow importing emails.* from the backend root.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from emails.templates.weekly_summary import render_weekly_summary
from emails.templates.monthly_summary import render_monthly_summary
from emails.templates.imbalance_alert import render_imbalance_alert
from emails.templates.reflection_reminder import render_reflection_reminder
from emails.templates.gcal_link_suggestion import render_gcal_link_suggestion
from emails.templates.evolucion_nudge import render_evolucion_nudge


OUT = os.path.join(ROOT, "email-previews")
os.makedirs(OUT, exist_ok=True)

APP_URL = "https://kabbalahspace.app"
PREFS_URL = f"{APP_URL}/cuenta"
NOMBRE = "Alex"

now = datetime(2026, 5, 25, 9, 0, tzinfo=timezone.utc)
week_start = now - timedelta(days=7)
week_end = now

# 1. Weekly
weekly_html = render_weekly_summary(
    nombre=NOMBRE,
    week_start=week_start,
    week_end=week_end,
    top_sefirot=[("Tiféret", 5), ("Jésed", 3), ("Guevurá", 2)],
    reflexiones_count=3,
    insight=None,  # Phase 1 — sin IA aún
    app_url=APP_URL,
    preferences_url=PREFS_URL,
)
with open(os.path.join(OUT, "01-weekly.html"), "w", encoding="utf-8") as f:
    f.write(weekly_html)

# 1b. Weekly con insight (cómo se vería en Phase 2)
weekly_with_insight = render_weekly_summary(
    nombre=NOMBRE,
    week_start=week_start,
    week_end=week_end,
    top_sefirot=[("Tiféret", 5), ("Jésed", 3), ("Guevurá", 2)],
    reflexiones_count=3,
    insight=(
        "Tu semana se inclinó fuerte hacia Tiféret — armonía y centro. "
        "Notamos que Guevurá aparece sólo dos veces; quizás esté pidiendo "
        "más espacio para los límites y la disciplina en los próximos días."
    ),
    app_url=APP_URL,
    preferences_url=PREFS_URL,
)
with open(os.path.join(OUT, "01b-weekly-with-insight.html"), "w", encoding="utf-8") as f:
    f.write(weekly_with_insight)

# 2. Monthly
monthly_html = render_monthly_summary(
    nombre=NOMBRE,
    month_label="abril de 2026",
    sefirot_breakdown=[
        ("Tiféret", 18), ("Jésed", 12), ("Guevurá", 8),
        ("Netsaj", 6), ("Yesod", 5), ("Hod", 4), ("Maljut", 2),
    ],
    reflexiones_count=11,
    delta_vs_prev_month=14,  # más activo que el mes anterior
    insight=None,
    app_url=APP_URL,
    preferences_url=PREFS_URL,
)
with open(os.path.join(OUT, "02-monthly.html"), "w", encoding="utf-8") as f:
    f.write(monthly_html)

# 3. Imbalance alert
imbalance_html = render_imbalance_alert(
    nombre=NOMBRE,
    sefira_nombre="Guevurá",
    days_since=14,
    app_url=APP_URL,
    preferences_url=PREFS_URL,
)
with open(os.path.join(OUT, "03-imbalance.html"), "w", encoding="utf-8") as f:
    f.write(imbalance_html)

# 4. Reflection reminder
reminder_html = render_reflection_reminder(
    nombre=NOMBRE,
    pregunta_texto="¿En qué situación esta semana sentiste que tu corazón se abrió sin condiciones?",
    sefira_nombre="Jésed",
    app_url=APP_URL,
    preferences_url=PREFS_URL,
)
with open(os.path.join(OUT, "04-reminder.html"), "w", encoding="utf-8") as f:
    f.write(reminder_html)

# 5. Gcal link suggestion (transactional onboarding)
gcal_html = render_gcal_link_suggestion(
    nombre=NOMBRE,
    app_url=APP_URL,
    preferences_url=PREFS_URL,
)
with open(os.path.join(OUT, "05-gcal-link.html"), "w", encoding="utf-8") as f:
    f.write(gcal_html)

# 6. Evolucion nudge (monthly, free + premium)
evol_html = render_evolucion_nudge(
    nombre=NOMBRE,
    app_url=APP_URL,
    preferences_url=PREFS_URL,
)
with open(os.path.join(OUT, "06-evolucion-nudge.html"), "w", encoding="utf-8") as f:
    f.write(evol_html)

print(f"Listo. 5 archivos generados en: {OUT}")
for fname in sorted(os.listdir(OUT)):
    print(f"  {fname}")
