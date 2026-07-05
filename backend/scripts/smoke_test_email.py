"""Smoke test: manda UN weekly_summary real via Resend para validar la
configuracion end-to-end (API key + dominio + render + envio).

NO toca la DB ni los EmailLogs — usa el cliente directo y un template
renderizado con datos dummy. Imprime el message_id de Resend en exito o
el error en fallo.

Uso:
    venv/Scripts/python.exe scripts/smoke_test_email.py <destinatario>

Ej:
    venv/Scripts/python.exe scripts/smoke_test_email.py evonova.001@gmail.com
"""
import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta

# Allow importing from the backend root.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from config import get_settings
from emails.client import send_email, ResendError, ResendAuthError
from emails.templates.weekly_summary import render_weekly_summary


APP_URL = os.environ.get("APP_URL", "https://kabbalahspace.app")
PREFS_URL = f"{APP_URL}/cuenta"


async def main(to: str) -> int:
    settings = get_settings()
    print(f"emails_enabled = {settings.emails_enabled}")
    print(f"from_email     = {settings.from_email}")
    print(f"to             = {to}")
    print(f"api key len    = {len(settings.resend_api_key)} chars")
    print()

    if not settings.emails_enabled:
        print("ERROR: EMAILS_ENABLED is false — set it to true in .env")
        return 2
    if not settings.resend_api_key:
        print("ERROR: RESEND_API_KEY is empty")
        return 2

    now = datetime.now(timezone.utc)
    week_start = now - timedelta(days=7)
    html = render_weekly_summary(
        nombre="Alex",
        week_start=week_start,
        week_end=now,
        top_sefirot=[("Tiferet", 5), ("Jesed", 3), ("Guevura", 2)],
        reflexiones_count=3,
        insight=(
            "Smoke test desde scripts/smoke_test_email.py — si estas viendo "
            "esto en tu inbox, el pipeline Resend funciona end-to-end."
        ),
        app_url=APP_URL,
        preferences_url=PREFS_URL,
    )

    try:
        msg_id = await send_email(
            settings,
            to=to,
            subject="[SMOKE TEST] Tu semana en el arbol",
            html=html,
        )
    except ResendAuthError as e:
        print(f"AUTH ERROR: {e}")
        print("--> Verifica RESEND_API_KEY en .env")
        return 3
    except ResendError as e:
        print(f"RESEND ERROR: {e}")
        print("--> Posibles causas:")
        print("    - Dominio no verificado (si usas from_email custom)")
        print("    - Destinatario != duenio de la cuenta Resend (si from=onboarding@resend.dev)")
        print("    - Limit/cuota agotado")
        return 4

    print(f"OK — message_id = {msg_id}")
    print()
    print("Proximos pasos:")
    print("  1. Revisa tu inbox (puede tardar 10-30s)")
    print("  2. Revisa SPAM si no llega")
    print("  3. En dashboard.resend.com -> Logs vas a ver el envio")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python scripts/smoke_test_email.py <destinatario>")
        sys.exit(1)
    sys.exit(asyncio.run(main(sys.argv[1])))
