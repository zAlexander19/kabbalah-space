"""Smoke test premium — drive el backend VIVO como cliente HTTP real.

Cubre lo que NO depende de servicios externos (Lemonsqueezy/Resend):
gating de free tier, /billing/status, y el guard de firma del webhook.

Uso:
    # 1) levantar un backend fresco con DB descartable en el puerto 8100
    DATABASE_URL="sqlite+aiosqlite:///./smoke_premium.db" \
        python -m uvicorn main:app --port 8100
    # 2) en otra terminal
    python scripts/smoke_test_premium.py http://127.0.0.1:8100

Sale con código 0 si todo pasó, 1 si algo falló.
"""
import sys
import time
import uuid

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8100"

passed = 0
failed = 0


def check(name: str, cond: bool, extra: str = "") -> None:
    global passed, failed
    mark = "✓" if cond else "✗"
    if cond:
        passed += 1
    else:
        failed += 1
    print(f"  {mark} {name}" + (f"  [{extra}]" if extra else ""))


def register_and_login(c: httpx.Client, email: str) -> dict:
    r = c.post("/auth/register", json={"email": email, "password": "smokepass1", "nombre": "Smoke"})
    assert r.status_code in (200, 201), f"register: {r.status_code} {r.text}"
    r = c.post("/auth/login", json={"email": email, "password": "smokepass1"})
    assert r.status_code == 200, f"login: {r.status_code} {r.text}"
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def act_payload(rrule: str | None = None) -> dict:
    return {
        "titulo": "Meditación smoke",
        "inicio": "2026-08-01T10:00:00",
        "fin": "2026-08-01T11:00:00",
        "sefirot_ids": ["jesed"],
        **({"rrule": rrule} if rrule else {}),
    }


def main() -> None:
    with httpx.Client(base_url=BASE, timeout=15) as c:
        # --- infra ---
        print("\n[infra]")
        r = c.get("/health")
        check("/health 200", r.status_code == 200, r.text[:60])
        check("header X-Content-Type-Options=nosniff",
              r.headers.get("X-Content-Type-Options") == "nosniff")
        check("header X-Frame-Options=DENY", r.headers.get("X-Frame-Options") == "DENY")

        # --- billing status: free ---
        print("\n[billing/status]")
        stamp = uuid.uuid4().hex[:8]
        headers = register_and_login(c, f"free-{stamp}@example.com")
        r = c.get("/billing/status", headers=headers)
        body = r.json() if r.status_code == 200 else {}
        check("/billing/status tier=free",
              r.status_code == 200 and body.get("tier") == "free", str(body))

        # --- gate: recurrencia premium-only ---
        print("\n[gate recurrencia]")
        h_rec = register_and_login(c, f"rec-{stamp}@example.com")
        r = c.post("/actividades", json=act_payload(rrule="FREQ=WEEKLY;BYDAY=MO"), headers=h_rec)
        reason = r.json().get("detail", {}).get("reason") if r.status_code == 402 else None
        check("actividad recurrente free → 402 recurrence_premium",
              r.status_code == 402 and reason == "recurrence_premium",
              f"{r.status_code} {reason}")

        # --- gate: límite de 10 actividades ---
        print("\n[gate límite actividades]")
        h_lim = register_and_login(c, f"lim-{stamp}@example.com")
        ok10 = 0
        for _ in range(10):
            r = c.post("/actividades", json=act_payload(), headers=h_lim)
            if r.status_code == 200:
                ok10 += 1
        check("10 actividades simples free → 200", ok10 == 10, f"{ok10}/10 OK")
        r = c.post("/actividades", json=act_payload(), headers=h_lim)
        reason = r.json().get("detail", {}).get("reason") if r.status_code == 402 else None
        check("actividad #11 → 402 actividad_limit",
              r.status_code == 402 and reason == "actividad_limit",
              f"{r.status_code} {reason}")

        # --- gate: reflexión libre 1/mes ---
        print("\n[gate reflexión libre]")
        h_ref = register_and_login(c, f"ref-{stamp}@example.com")
        r1 = c.post("/reflexiones-libres", json={"tipo": "arbol", "contenido": "primera"}, headers=h_ref)
        check("1ra reflexión libre → 201", r1.status_code == 201, str(r1.status_code))
        r2 = c.post("/reflexiones-libres", json={"tipo": "arbol", "contenido": "segunda"}, headers=h_ref)
        reason = r2.json().get("detail", {}).get("reason") if r2.status_code == 402 else None
        check("2da reflexión libre (mismo mes) → 402 free_reflection_limit",
              r2.status_code == 402 and reason == "free_reflection_limit",
              f"{r2.status_code} {reason}")

        # --- webhook: firma inválida rechazada ---
        print("\n[webhook lemonsqueezy]")
        r = c.post("/webhooks/lemonsqueezy", content=b'{"meta":{"event_name":"x"}}',
                   headers={"Content-Type": "application/json"})
        check("webhook sin firma → 401", r.status_code == 401, str(r.status_code))
        r = c.post("/webhooks/lemonsqueezy", content=b'{"meta":{"event_name":"x"}}',
                   headers={"Content-Type": "application/json", "X-Signature": "deadbeef"})
        check("webhook firma inválida → 401", r.status_code == 401, str(r.status_code))

        # --- checkout: reporta si Lemonsqueezy está configurado ---
        print("\n[checkout — informativo]")
        r = c.post("/billing/checkout", json={"plan": "monthly"}, headers=headers)
        if r.status_code == 200 and r.json().get("checkout_url"):
            check("checkout devuelve URL (Lemonsqueezy CONFIGURADO)", True, r.json()["checkout_url"][:40])
        else:
            print(f"  ⚠ checkout no operativo (esperado sin config): {r.status_code} {r.text[:80]}")
            print("    → requiere LEMONSQUEEZY_* en el entorno. Paso manual pre-launch.")

    print(f"\n=== RESULTADO: {passed} pasaron, {failed} fallaron ===")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
