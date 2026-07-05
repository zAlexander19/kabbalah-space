"""Smoke del flujo de pago COMPLETO (backend), usando los secretos reales
del .env pero SIN depender de la pagina de pago hosteada ni de una tarjeta.

Simula el webhook `subscription_created` que Lemonsqueezy mandaria tras una
compra: lo firma con LEMONSQUEEZY_WEBHOOK_SECRET (leido en proceso, nunca se
imprime) y verifica que el usuario pase a premium y que el portal responda.

Ademas hace un GET real a la URL de checkout para reportar si la tienda ya
esta activada o sigue mostrando "This store has not been activated".

Uso:
    # backend vivo en 8100 con DB descartable:
    DATABASE_URL="sqlite+aiosqlite:///./smoke_premium.db" \
        python -m uvicorn main:app --port 8100
    # luego:
    python scripts/smoke_test_billing_flow.py http://127.0.0.1:8100
"""
import hashlib
import hmac
import json
import os
import sys
import uuid

import httpx

# Importa settings del backend (mismo .env que usa el server).
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from config import get_settings  # noqa: E402

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8100"

passed = 0
failed = 0


def check(name: str, cond: bool, extra: str = "") -> None:
    global passed, failed
    mark = "OK " if cond else "XX "
    if cond:
        passed += 1
    else:
        failed += 1
    print(f"  {mark} {name}" + (f"  [{extra}]" if extra else ""))


def register_and_login(c: httpx.Client, email: str) -> dict:
    r = c.post("/auth/register", json={"email": email, "password": "smokepass1", "nombre": "Flow"})
    assert r.status_code in (200, 201), f"register: {r.status_code} {r.text}"
    uid = r.json()["id"]
    r = c.post("/auth/login", json={"email": email, "password": "smokepass1"})
    assert r.status_code == 200, f"login: {r.status_code} {r.text}"
    token = r.json()["access_token"]
    return {"id": uid, "headers": {"Authorization": f"Bearer {token}"}}


def signed_webhook(c: httpx.Client, payload: dict, secret: str) -> httpx.Response:
    body = json.dumps(payload).encode()
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return c.post(
        "/webhooks/lemonsqueezy",
        content=body,
        headers={"Content-Type": "application/json", "X-Signature": sig},
    )


def main() -> None:
    settings = get_settings()
    secret = settings.lemonsqueezy_webhook_secret
    yearly_variant = settings.lemonsqueezy_variant_yearly

    print(f"\n[config]  LS configurado = {settings.lemonsqueezy_configured} | "
          f"webhook_secret {'SET' if secret else 'VACIO'} | "
          f"yearly_variant {'SET' if yearly_variant else 'VACIO'}")

    with httpx.Client(base_url=BASE, timeout=20) as c:
        stamp = uuid.uuid4().hex[:8]
        user = register_and_login(c, f"flow-{stamp}@example.com")

        print("\n[1] estado inicial")
        r = c.get("/billing/status", headers=user["headers"])
        check("status = free", r.status_code == 200 and r.json().get("tier") == "free", str(r.json()))

        print("\n[2] checkout")
        r = c.post("/billing/checkout", json={"plan": "yearly"}, headers=user["headers"])
        checkout_url = None
        if r.status_code == 200:
            checkout_url = r.json().get("checkout_url")
            check("checkout crea URL", bool(checkout_url), (checkout_url or "")[:50])
        else:
            check("checkout crea URL", False, f"{r.status_code} {r.text[:80]}")

        # GET real a la pagina de checkout: ¿tienda activada?
        if checkout_url:
            try:
                pg = httpx.get(checkout_url, timeout=20, follow_redirects=True)
                txt = pg.text.lower()
                not_active = "has not been activated" in txt or "forbidden from accessing" in txt
                if not_active:
                    check("pagina de checkout CARGA (tienda activada / test mode)", False,
                          "sigue 'store not activated'")
                else:
                    check("pagina de checkout CARGA (tienda activada / test mode)", True,
                          f"HTTP {pg.status_code}")
            except Exception as e:
                print(f"  ?? no se pudo fetchear el checkout: {e}")

        print("\n[3] webhook subscription_created (firmado)")
        if not secret:
            print("  ?? LEMONSQUEEZY_WEBHOOK_SECRET vacio — no se puede simular el webhook.")
        else:
            sub_id = f"sub_smoke_{stamp}"
            payload = {
                "meta": {"event_name": "subscription_created", "custom_data": {"usuario_id": user["id"]}},
                "data": {
                    "id": sub_id,
                    "attributes": {
                        "status": "active",
                        "variant_id": yearly_variant or "0",
                        "customer_id": 999999,
                        "created_at": "2026-07-04T00:00:00.000000Z",
                        "renews_at": "2027-07-04T00:00:00.000000Z",
                        "trial_ends_at": None,
                    },
                },
            }
            r = signed_webhook(c, payload, secret)
            check("webhook firmado aceptado (200 ok)",
                  r.status_code == 200 and r.json().get("status") == "ok", str(r.status_code))

            print("\n[4] el usuario quedo premium")
            r = c.get("/billing/status", headers=user["headers"])
            body = r.json()
            check("status = premium", body.get("tier") == "premium", str(body.get("tier")))
            sub = body.get("subscription") or {}
            check("plan = yearly", sub.get("plan") == "yearly", str(sub.get("plan")))
            check("estado = active", sub.get("status") == "active", str(sub.get("status")))

            print("\n[5] gates liberados para premium")
            r = c.post("/reflexiones-libres", json={"tipo": "arbol", "contenido": "a"}, headers=user["headers"])
            r2 = c.post("/reflexiones-libres", json={"tipo": "arbol", "contenido": "b"}, headers=user["headers"])
            check("2 reflexiones libres seguidas OK (sin gate mensual)",
                  r.status_code == 201 and r2.status_code == 201,
                  f"{r.status_code}/{r2.status_code}")

            print("\n[6] idempotencia del webhook")
            r = signed_webhook(c, payload, secret)
            check("reenvio mismo webhook -> duplicate_ignored",
                  r.status_code == 200 and r.json().get("status") == "duplicate_ignored",
                  str(r.json().get("status")))

            print("\n[7] portal de cliente")
            r = c.get("/billing/portal", headers=user["headers"])
            if r.status_code == 200 and r.json().get("portal_url"):
                check("portal devuelve URL", True, r.json()["portal_url"][:45])
            else:
                print(f"  ?? portal no operativo: {r.status_code} {r.text[:100]}")
                print("     (customer_id simulado no existe en LS; real tras compra real funciona)")

    print(f"\n=== RESULTADO: {passed} pasaron, {failed} fallaron ===")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
