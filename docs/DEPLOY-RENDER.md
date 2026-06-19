# Deploy a producción en Render — Kabbalah Space

Guía paso a paso. Hay dos servicios web (backend FastAPI + frontend estático) y
una base Postgres gestionada. Tiempo estimado: ~1–2 h (la mayoría es configurar
cuentas externas).

> Convención: `<backend>` = URL del backend en Render (ej. `https://kabbalah-backend.onrender.com`).
> `<frontend>` = URL del frontend (ej. `https://kabbalah-frontend.onrender.com`) o tu dominio.

---

## 0. Antes de empezar

- [ ] Código en GitHub, rama `main` pusheada (`git push origin main`).
- [ ] Cuenta en **Render**, **Google Cloud Console**, **Lemonsqueezy** (modo live), **Resend** (con dominio para verificar).
- [ ] Generá una **FERNET_KEY** (la vas a pegar como secreto):
  ```bash
  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  ```

---

## 1. Crear los servicios en Render

**Opción A — Blueprint (recomendada):** Dashboard → **New → Blueprint** → conectá el repo. Render lee [`render.yaml`](../render.yaml) y crea: `kabbalah-db` (Postgres), `kabbalah-backend`, `kabbalah-frontend`. Las variables `sync: false` quedan vacías para que las cargues en el paso 3.

**Opción B — Manual:** creá una **PostgreSQL** (plan pago, no la free que expira), un **Web Service** (root `backend`, build `pip install -r requirements.txt`, pre-deploy `alembic upgrade head`, start `uvicorn main:app --host 0.0.0.0 --port $PORT`, health check `/health`) y un **Static Site** (root `frontend`, build `npm ci && npm run build`, publish `dist`, rewrite `/* → /index.html`).

> El backend debe ser un plan **always-on** (Starter+). El free se duerme y mata el scheduler de emails.

---

## 2. Anotá las URLs

Después del primer deploy, anotá `<backend>` y `<frontend>`. Las necesitás para las variables cruzadas del paso 3.

---

## 3. Variables de entorno del BACKEND (en el dashboard del servicio)

Automáticas (ya vienen del blueprint): `DATABASE_URL`, `JWT_SECRET`, `LLM_PROVIDER=gemini`, `EMAILS_ENABLED=true`, `RUN_SCHEDULER=true`, `PYTHON_VERSION`.

A cargar a mano:

| Variable | Valor |
|---|---|
| `GEMINI_API_KEY` | tu API key de Gemini |
| `GOOGLE_CLIENT_ID` | de Google Cloud (paso 4) |
| `GOOGLE_CLIENT_SECRET` | de Google Cloud (paso 4) |
| `GOOGLE_REDIRECT_URI` | `https://<backend>/auth/google/callback` |
| `GCAL_REDIRECT_URI` | `https://<backend>/sync/google/callback` |
| `FRONTEND_URL` | `https://<frontend>` |
| `CORS_ORIGINS` | `https://<frontend>` (sin slash final; varios separados por coma) |
| `FERNET_KEY` | la que generaste en el paso 0 |
| `ADMIN_BOOTSTRAP_EMAILS` | tu email admin (ej. `evonova.001@gmail.com`) |
| `LEMONSQUEEZY_API_KEY` | key **live** (paso 5) |
| `LEMONSQUEEZY_STORE_ID` | store id |
| `LEMONSQUEEZY_VARIANT_MONTHLY` | variant id mensual **live** |
| `LEMONSQUEEZY_VARIANT_YEARLY` | variant id anual **live** |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | signing secret del webhook (paso 5) |
| `RESEND_API_KEY` | API key de Resend (paso 6) |
| `RESEND_WEBHOOK_SECRET` | signing secret del webhook (paso 6) |
| `FROM_EMAIL` | `Kabbalah Space <hola@tudominio.com>` (dominio verificado) |

## Variable del FRONTEND (en el Static Site)

| Variable | Valor |
|---|---|
| `VITE_API_BASE` | `https://<backend>` (sin slash final) |

> Importante: `VITE_API_BASE` se inyecta en **build time**. Si la cambiás, hay que **redeployar** el frontend.

---

## 4. Google OAuth (login + calendario)

En Google Cloud Console → APIs & Services → **Credentials** → tu OAuth Client:

- [ ] **Authorized JavaScript origins**: agregá `https://<frontend>`.
- [ ] **Authorized redirect URIs**: agregá
  - `https://<backend>/auth/google/callback`
  - `https://<backend>/sync/google/callback`
- [ ] Si la app está en "Testing", pasala a **Production** (o agregá los usuarios de prueba).

---

## 5. Lemonsqueezy (premium) — pasar a LIVE

- [ ] Desactivá "Test mode" y obtené la **API key live**, el **store id** y los **variant id** (mensual/anual) de los productos live.
- [ ] Webhook: Settings → Webhooks → New. URL: `https://<backend>/webhooks/lemonsqueezy`. Guardá el **signing secret** en `LEMONSQUEEZY_WEBHOOK_SECRET`. Suscribí los eventos de subscription/payment.

---

## 6. Resend (emails)

- [ ] **Verificá tu dominio** (DNS: SPF/DKIM) y poné `FROM_EMAIL` con ese dominio.
- [ ] Webhook: URL `https://<backend>/webhooks/resend`, guardá el **signing secret** en `RESEND_WEBHOOK_SECRET`.

---

## 7. Primer deploy y verificación

- [ ] Redeployá el backend (toma todas las variables). Las migraciones corren solas en el pre-deploy (`alembic upgrade head`).
- [ ] `GET https://<backend>/health` → `{"status":"ok",...}`.
- [ ] Abrí `https://<frontend>`, registrate con tu **email admin** (el de `ADMIN_BOOTSTRAP_EMAILS`).
- [ ] **Reiniciá el backend una vez** (Manual Deploy → o restart): el bootstrap te promueve a admin al startup. Refrescá → ves el "Panel de administrador" y caés directo en él.

### Smoke test mínimo
- [ ] Login con email/password y con Google.
- [ ] Crear una actividad en el Calendario; conectar Google Calendar y verificar sync.
- [ ] Responder preguntas en el Espejo (evaluación IA).
- [ ] Checkout premium (compra de prueba si tenés modo test, o real chico) → verificar que el webhook activa premium.
- [ ] Panel admin: stats cargan, CRUD de preguntas, gestión de usuarios.

---

## Notas de escala (para más adelante)
- Subir recursos = cambiar el tier del servicio/DB (un clic).
- Para varias instancias del backend: poné `RUN_SCHEDULER=false` en las web y movés el scheduler a un **Background Worker / Cron** de Render (el flag ya está listo).
- El cuello de botella real es la DB: monitoreá conexiones/CPU y subí el tier de Postgres cuando haga falta.
