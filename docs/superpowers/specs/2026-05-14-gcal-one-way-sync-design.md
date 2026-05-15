# Google Calendar Sync (one-way) — Kabbalah → Google

**Fecha:** 2026-05-14
**Alcance:** Sincronizar en una dirección las actividades del calendario cabalístico de Kabbalah Space hacia Google Calendar. Cuando el usuario crea / edita / borra una `Actividad` en Kabbalah, el cambio se refleja en su Google Calendar. Cambios hechos en Google Calendar NO vuelven a Kabbalah. Solo usuarios autenticados con Google pueden activarlo en v1.

---

## 1. Objetivo y motivación

Hoy el módulo Calendario Cabalístico vive aislado dentro de Kabbalah Space: si el usuario organiza la semana ahí pero usa Google Calendar para todo lo demás (trabajo, dentista, gym), termina con dos vistas paralelas. La promesa de "organizar tu tiempo por dimensiones del alma" se rompe cuando la realidad del día está en otro tab.

Sync uno-a-uno hacia Google soluciona esto: las actividades de Kabbalah aparecen automáticamente como una capa más en el Google Calendar del usuario, dentro de un calendario dedicado `"Kabbalah Space"` que el usuario puede mostrar / ocultar como cualquier otro.

La dirección elegida (una vía, Kabbalah → Google) es deliberada para v1: evita conflictos a resolver, no necesita webhooks, y captura el 80% del valor con el 20% de la complejidad. Sync bidireccional queda como Future.

---

## 2. Decisiones tomadas

| Eje | Decisión |
|---|---|
| Dirección | Una vía: Kabbalah → Google. Cambios en Google NO vienen a Kabbalah |
| Auth gating en v1 | Solo usuarios `provider="google"` pueden activar sync. Email users ven CTA disabled "Vinculá tu cuenta de Google" (out of scope) |
| Calendario target | Default: calendario dedicado `"Kabbalah Space"` creado por la app vía API. El picker para premium queda en el modelo de datos (`google_calendar_id` nullable) pero el toggle de UI es Future |
| Recurrentes | Un solo evento Google con RRULE — la app pushea solo el "series master" (la fila con `rrule` set); las materializadas children no se pushean individualmente |
| Backfill | Al activar sync, push automático de todas las actividades existentes en background con progress visible |
| Sync timing | Async vía `BackgroundTasks` de FastAPI: la API responde inmediato, push a Google ocurre en background |
| Failure | Si Google falla, la `Actividad` queda con `sync_status="error"` y el frontend muestra un badge con botón "reintentar" |
| Token storage | `refresh_token` encriptado con Fernet en la tabla `usuarios`; `access_token` no se persiste (se refresca on-demand cada llamada) |
| OAuth scope | Flow nuevo separado del login: scope `https://www.googleapis.com/auth/calendar`, `access_type=offline`, `prompt=consent` |
| Out of scope | Email user linking, picker premium, sync bidireccional, webhooks, otros providers (Outlook/Apple), all-day events, color per-sefirá editable |

---

## 3. Arquitectura

### 3.1 Modelo de datos

**Tabla `usuarios` — 3 columnas nuevas:**

```python
google_refresh_token_enc = Column(Text, nullable=True)         # Fernet-encrypted refresh_token
google_calendar_id       = Column(String(255), nullable=True)  # ID del calendario "Kabbalah Space" creado en Google
gcal_sync_enabled        = Column(Boolean, nullable=False, server_default="false")
```

**Tabla `actividades` — 2 columnas nuevas:**

```python
gcal_event_id  = Column(String(255), nullable=True, index=True)  # event ID en Google, NULL si nunca sincronizó
sync_status    = Column(String(20), nullable=False, server_default="pending")
```

Valores válidos de `sync_status`:
- `pending` — aún no se intentó push (estado inicial, también después de error que vuelve a `pending` al reintentar)
- `synced` — push exitoso, `gcal_event_id` poblado
- `error` — último push falló; el frontend muestra retry button
- `skipped` — instancia materializada de una serie cuyo master ya está en Google; no se pushea individualmente

**Migration Alembic** que agrega esas 5 columnas en una sola revision: `add_gcal_sync_columns`. Incluye `CREATE INDEX ix_actividades_gcal_event_id ON actividades(gcal_event_id)` para reverse lookup eficiente.

**Secret nuevo en `.env`:** `FERNET_KEY` (32 bytes base64). Se genera con:
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```
Si `FERNET_KEY` no está seteado al iniciar el backend, las llamadas a `/sync/*` devuelven `503 Service Unavailable` con mensaje "Google Calendar sync no está configurado en este servidor".

### 3.2 OAuth flow extendido

Hoy `backend/auth.py` define el login flow con `GOOGLE_SCOPES = "openid email profile"` y `access_type="online"`. Eso da identidad pero NO `refresh_token`.

Para sync se agrega un **segundo flow OAuth completamente separado** que se dispara solo cuando el usuario aprieta "Activar sync con Google Calendar" en `/settings`. Mezclar los dos flows en el login significaría pedir scope de calendario a todos los usuarios al loguear, lo cual ahuyenta a los que solo quieren probar la app.

**Parámetros del flow nuevo:**

```python
GCAL_SCOPES = "https://www.googleapis.com/auth/calendar"

params = {
    "client_id": settings.google_client_id,
    "redirect_uri": settings.gcal_redirect_uri,   # diferente del login redirect
    "response_type": "code",
    "scope": GCAL_SCOPES,
    "state": create_state_token(settings, purpose="gcal_sync_state"),
    "access_type": "offline",            # ← clave: devuelve refresh_token
    "prompt": "consent",                 # ← fuerza re-consent aunque ya haya aceptado
    "include_granted_scopes": "true",    # combina con scopes previos
}
```

El `state` token reutiliza el formato JWT existente pero con `purpose: "gcal_sync_state"` para distinguirlo del state del login flow (`purpose: "oauth_state"`) y prevenir cross-flow attacks. La función `create_state_token` en `auth.py` se generaliza para aceptar un `purpose` parameter.

**Nuevos endpoints (todos requieren `current_user` autenticado):**

```
GET  /sync/google/authorize        → devuelve { url } para redirect
GET  /sync/google/callback         → recibe code, intercambia por tokens, encripta refresh_token,
                                     crea calendario "Kabbalah Space", marca enabled=true,
                                     redirige a frontend /settings?sync=connected
POST /sync/google/disconnect       → revoca refresh_token (Google revoke endpoint),
                                     borra calendario dedicado, limpia las 3 columnas de usuarios,
                                     UPDATE actividades SET gcal_event_id=NULL, sync_status='pending'
                                     WHERE usuario_id=current_user.id
GET  /sync/status                  → { enabled, calendar_name, last_sync_at,
                                       pending_count, error_count, backfill_progress }
POST /sync/backfill                → dispara backfill manual (idempotente)
POST /actividades/{id}/retry-sync  → reintento puntual
```

### 3.3 Módulos backend nuevos

Tres módulos en `backend/` con responsabilidad acotada:

**`backend/gcal_client.py`** — HTTP client de bajo nivel sobre `httpx`. No conoce ni la DB ni FastAPI. Funciones:

```python
async def refresh_access_token(refresh_token: str, settings) -> str
async def create_calendar(access_token: str, summary: str) -> dict       # devuelve {id, summary}
async def delete_calendar(access_token: str, calendar_id: str) -> None
async def insert_event(access_token: str, calendar_id: str, event: dict) -> dict
async def update_event(access_token: str, calendar_id: str, event_id: str, event: dict) -> dict
async def delete_event(access_token: str, calendar_id: str, event_id: str) -> None
async def revoke_refresh_token(refresh_token: str) -> None
```

Excepciones tipadas que traduce desde HTTP de Google:
- `GcalAuthError` — 401 sobre refresh_token (token revocado o expirado sin posibilidad de refresh)
- `GcalNotFoundError` — 404 (calendar o event ya no existe en Google)
- `GcalRateLimitError` — 429
- `GcalTransientError` — 5xx

**`backend/gcal_mapper.py`** — Una función pura, sin I/O:

```python
def actividad_to_event(actividad: Actividad, sefirot: list[Sefira]) -> dict:
    """Build the Google Calendar event payload from an Actividad.

    Series master (rrule set) → includes RRULE in event.recurrence.
    Single activity (no serie_id, no rrule) → plain event.
    """
```

Mapping:
- `event.summary` = `actividad.titulo`
- `event.description` = `actividad.descripcion or ""` + `\n\n— Sefirot: Kéter, Jésed, ...` (los nombres en español de las sefirot asociadas, en orden)
- `event.start.dateTime` / `event.end.dateTime` = `actividad.inicio.isoformat()` / `actividad.fin.isoformat()` (ISO 8601 con offset UTC)
- `event.recurrence` = `[f"RRULE:{actividad.rrule}"]` si es series master, else omitido
- `event.colorId` = mapeo hardcoded de la primera sefirá asociada a uno de los 11 colorId válidos de Google Calendar (tabla constante en el módulo)

**`backend/gcal_sync.py`** — Orquestación: une el mapper + client + DB. Funciones de alto nivel que llaman los endpoints o los BackgroundTasks:

```python
async def push_actividad(db_factory, usuario_id: str, actividad_id: str) -> None
async def update_actividad(db_factory, usuario_id: str, actividad_id: str) -> None
async def delete_actividad(db_factory, usuario_id: str, gcal_event_id: str) -> None
async def backfill_user(db_factory, usuario_id: str) -> None
async def enable_sync_for_user(db, usuario_id: str, refresh_token: str) -> None
async def disable_sync_for_user(db, usuario_id: str) -> None
```

Cada una maneja:
1. Lookup del usuario y validación de `gcal_sync_enabled`
2. Desencripta `google_refresh_token_enc` con Fernet
3. Llama `refresh_access_token` para obtener un access_token fresco
4. Construye el payload con `actividad_to_event`
5. Llama al `gcal_client`
6. Update de `gcal_event_id` + `sync_status="synced"` (o `"error"` con backoff retry)
7. Log

`db_factory` es necesario porque las funciones llamadas como `BackgroundTask` corren fuera del request lifecycle — abren su propia `AsyncSession`. Las dos funciones que corren dentro de un request (`enable_sync_for_user`, `disable_sync_for_user`) aceptan la sesión existente directamente.

Las excepciones del client se capturan y traducen a updates de `sync_status="error"` sin propagar — un fallo en background nunca debe romper el response del endpoint principal.

### 3.4 Integración con endpoints existentes

`POST /actividades` (en `main.py`) gana esta línea al final, justo antes de `return`:

```python
if usuario.gcal_sync_enabled:
    for actividad in created:
        # Solo el series master, no las materializadas children
        if not actividad.serie_id or actividad.rrule:
            background_tasks.add_task(
                gcal_sync.push_actividad, db_factory, usuario.id, actividad.id,
            )
        else:
            actividad.sync_status = "skipped"
```

Análogo para `PUT /actividades/{id}` (llama `update_actividad`) y `DELETE /actividades/{id}` (llama `delete_actividad` antes del DELETE en DB, usando el `gcal_event_id` leído primero).

El parámetro `background_tasks: BackgroundTasks` se inyecta vía dependency injection de FastAPI en los 3 endpoints. `db_factory` se importa desde `backend/database.py` como una función que abre una nueva `AsyncSession`.

### 3.5 Manejo de series y overrides

Una `Actividad` puede ser:
1. **Single** — `serie_id IS NULL`, `rrule IS NULL`. Push directo como evento Google sin recurrence.
2. **Series master** — `rrule IS NOT NULL`, `serie_id` set, es la primera fila del grupo. Push como evento Google con `event.recurrence = [RRULE]`.
3. **Series child** — `rrule IS NULL`, `serie_id` set, hijo de un master. NO se pushea; `sync_status="skipped"`. Google maneja las repeticiones a partir del master.
4. **Series child con override** — el usuario edita una sola instancia (ej. "este lunes corro de 9 a 10 en vez de 8 a 9"). Detección en el endpoint `PUT /actividades/{id}`: si la `Actividad` tiene `serie_id` set y `rrule IS NULL` (o sea, es una child), siempre se trata como override — push a Google como "recurring instance override" usando `recurringEventId` (el `gcal_event_id` del series master) + `originalStartTime` (el `inicio` original de la instancia, leído antes del UPDATE). El `sync_status` de la child cambia de `"skipped"` a `"synced"` después del push.

Borrar una serie entera en Kabbalah → DELETE del series master → un solo DELETE en Google sobre el evento recurrente master. Las child rows que se borran en DB pasan a `sync_status="skipped"` automáticamente porque Google ya las elimina como parte del master.

---

## 4. UX en el frontend

### 4.1 Settings card

Nueva vista `settings` que se agrega como `activeView === 'settings'` en `App.tsx` (siguiendo el patrón de los otros módulos). Se accede desde un nuevo ítem "Configuración" en el dropdown del avatar de `InicioNav` que dispara `onNavigate('settings')`. Una sola card por ahora:

```
┌──────────────────────────────────────────────────────────────┐
│  GOOGLE CALENDAR                                              │
│                                                               │
│  Sincronizar tus actividades con Google Calendar              │
│  Las actividades que crees aparecerán en un calendario        │
│  dedicado llamado "Kabbalah Space".                           │
│                                                               │
│  [  Activar sync con Google Calendar  ]                       │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Estados de la card

1. **Anónimo o email auth**: card grayed-out con texto "Necesitás iniciar sesión con Google para activar sync" + link "Vinculá tu cuenta de Google" (botón disabled — Future).

2. **Google auth + sync desactivado**: botón "Activar sync con Google Calendar". Al click → `GET /sync/google/authorize` → redirect a Google consent screen → callback → vuelve a `/settings?sync=connected` con toast "Calendario conectado · Subiendo 47 actividades..." y comienza polling de `/sync/status` cada 2s.

3. **Sync activo, backfill en curso**: progress bar `Sincronizando 23 de 47...` + estado `last_sync_at: hace 2 minutos`. Botón "Desconectar Google" deshabilitado durante backfill.

4. **Sync activo, idle**:
   ```
   ✓ Sincronizado · última actividad subida hace 5 min
   Calendario: "Kabbalah Space" (en tu Google Calendar)
   [ Re-sincronizar todo ]    [ Desconectar Google ]
   ```
   Si `error_count > 0`: banner amarillo "3 actividades no sincronizaron · [Reintentar]"

5. **Desconectar**: modal de confirmación "¿Borrar el calendario 'Kabbalah Space' de tu Google? Tus actividades en Kabbalah se conservan." → confirmar → `POST /sync/google/disconnect` → toast.

### 4.3 Indicador por actividad

En `CalendarModule` (la vista de calendario actual), cada `Actividad` card lleva un mini-ícono de status en la esquina:
- `synced` → ícono Google Calendar dorado pequeño (tooltip: "Sincronizado con Google")
- `pending` → spinner sutil
- `error` → ⚠ rojo (tooltip: "No se subió a Google · click para reintentar")
- `skipped` → sin ícono (el master lleva el indicador)
- Si `gcal_sync_enabled === false` → ningún ícono

### 4.4 Hooks y componentes nuevos

- `frontend/src/sync/useGcalStatus.ts` — fetch + poll de `/sync/status`, expone `{ enabled, calendarName, lastSyncAt, backfillProgress, errorCount }`
- `frontend/src/sync/useGcalSync.ts` — acciones `connect()`, `disconnect()`, `retryActividad(id)`, `backfillAll()`
- `frontend/src/settings/GcalSettingsCard.tsx` — la card descrita arriba
- `frontend/src/calendar/ActividadSyncBadge.tsx` — el mini-ícono por actividad

### 4.5 Routing

La vista `settings` usa el mismo header global (`InicioNav`) que las otras vistas — el `InicioNav` ya está pensado para vistas nuevas. Cuando `activeView === 'settings'` está activo, ningún ítem de las 3 secciones (Mi Árbol / Calendario / Mi Evolución) se highlightea — el dropdown del avatar es el indicador de "estoy en Configuración".

---

## 5. Edge cases y manejo de errores

| Caso | Comportamiento |
|---|---|
| **refresh_token revocado** (usuario revoca acceso desde myaccount.google.com) | Cuando `gcal_client.refresh_access_token` levanta `GcalAuthError`, las funciones de `gcal_sync` lo capturan y llaman `disable_sync_for_user` internamente (sin intentar `delete_calendar` porque el token ya no sirve): `gcal_sync_enabled=false`, limpian `google_calendar_id` y `google_refresh_token_enc`, todas las actividades del usuario pasan a `sync_status="pending"`. Frontend ve `enabled=false` en el próximo poll y muestra "Tu acceso a Google expiró · re-conectar" |
| **Calendario "Kabbalah Space" borrado manualmente en Google** | Al próximo push, Google responde 404 sobre el calendar_id. Recreamos automáticamente el calendario, actualizamos `google_calendar_id`, reintentamos el push. Log WARN. |
| **Evento individual borrado en Google** (usuario borra una actividad en Google Calendar directamente) | El próximo `update_event` o `delete_event` desde Kabbalah devuelve 404. Si el flow era UPDATE: hacemos `insert` re-creando el evento. Si era DELETE: no-op. |
| **Rate limit 429** | Backoff exponencial: 1s, 2s, 4s, 8s, 16s, hasta 5 reintentos. Si después de 5 sigue fallando, marcamos `sync_status="error"`. El usuario puede reintentar manual desde la UI. |
| **5xx transitorio de Google** | Mismo backoff que 429. |
| **Backfill interrumpido** (server restart durante el bulk push) | El backfill es idempotente: itera `actividades WHERE usuario_id=X AND sync_status='pending' AND (rrule IS NOT NULL OR serie_id IS NULL)`. Si se interrumpe, al volver a llamar `/sync/backfill` continúa desde donde estaba. El frontend dispara `/sync/backfill` automáticamente cuando detecta `enabled=true AND pending_count > 0 AND backfill_progress IS NULL`. |
| **Concurrencia: dos requests editan la misma actividad casi simultáneamente** | El `BackgroundTask` lee la actividad fresh de DB justo antes de pushear. Si dos tasks corren, el último gana en Google. Suficiente para v1. |
| **Series con override en una instancia** | Push como "recurring instance override" usando `recurringEventId` + `originalStartTime` en el payload (ver §3.5). |
| **`FERNET_KEY` no configurado en el servidor** | Las llamadas a `/sync/*` devuelven `503 Service Unavailable`. Frontend grayea la card con mensaje "Sync de Google Calendar no está disponible en este servidor". El resto de la app funciona normal. |
| **Usuario cambia de email auth a Google auth (re-registro)** | No aplica en v1 — la app no soporta cambiar provider después de creado el usuario. Si en el futuro se agrega "linkear cuenta Google", ahí se diseña el flow. |
| **Backend se reinicia con un BackgroundTask en vuelo** | Esa tarea se pierde. La actividad queda en `sync_status="pending"`. El frontend la marca con spinner. Al detectar `pending_count > 0` sin backfill activo y sin actividad reciente, dispara `/sync/backfill` para limpiar. |

---

## 6. Tests / verificación

**Tests automatizados (pytest):**

- `tests/backend/test_gcal_mapper.py` — la función pura. Casos: single activity, series master con RRULE, series con múltiples sefirot en description, colorId mapping para cada sefirá, fechas con timezone.
- `tests/backend/test_gcal_sync.py` — orquestación con `gcal_client` mockeado (`pytest-httpx` o `respx`). Casos: push exitoso actualiza DB, 401 dispara disable_sync, 404 sobre calendar recrea, 429 hace backoff y reintenta, backfill itera solo pendientes y skip-eados.
- `tests/backend/test_sync_endpoints.py` — los 6 endpoints HTTP. Casos: authorize devuelve URL bien formada, callback con state inválido → 401, disconnect limpia DB, status devuelve los counts correctos.
- `tests/backend/test_actividad_sync_integration.py` — POST/PUT/DELETE de actividad agendan BackgroundTask cuando enabled. Series child no agenda task (skipped).

**Verificación manual (smoke):**

1. Usuario Google se loguea → `/settings` muestra la card con botón "Activar".
2. Click activar → consent screen de Google muestra "Kabbalah quiere ver y editar tu calendario" → aceptar → vuelve a `/settings?sync=connected` → toast.
3. Verificar en Google Calendar que apareció el calendario "Kabbalah Space" vacío (o con las actividades existentes si el usuario tenía).
4. Crear actividad single en Kabbalah → aparece en Google Calendar dentro de ~3 segundos.
5. Crear actividad recurrente semanal → aparece en Google como evento recurrente.
6. Editar una instancia puntual de la recurrente → en Google se ve como override de esa instancia.
7. Borrar serie entera en Kabbalah → desaparece del Google Calendar.
8. Desconectar Google → calendario "Kabbalah Space" desaparece de Google. Modal confirma. Actividades en Kabbalah quedan.
9. Probar con `FERNET_KEY` ausente → endpoints `/sync/*` devuelven 503, card grayed-out.
10. Probar con `gcal_sync_enabled` pero `google_refresh_token_enc=NULL` (estado inconsistente) → endpoints devuelven 500 con log, frontend muestra "Reconectá Google".

**Out of scope para tests:** Mock fidelity con la Google Calendar API real (las llamadas son contra Google de verdad en el smoke manual, no en CI).

---

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Cuotas de Google Calendar API (1M queries/día por proyecto + 600 queries/minute por user) | Backfill con throttle de 10 req/s por usuario. Si un usuario sincroniza 1000 actividades, el backfill toma ~100s — aceptable. Las llamadas individuales (crear / editar / borrar) son raras (≤1 por segundo en uso normal). |
| Refresh_token revocado silenciosamente por Google (inactividad >6 meses, password change, etc.) | Detectamos en el primer 401 y disable_sync. Frontend muestra "Reconectá Google". |
| Encryption key (`FERNET_KEY`) leak | El secret vive solo en `.env` y en el servidor. Si se compromete, todos los refresh_tokens de la DB quedan expuestos. Mitigación: rotación documentada (re-cifrar todos los rows con la nueva key). Para v1 documentamos el procedure pero no se implementa rotación automática. |
| Costo de mantener el calendar "Kabbalah Space" si el usuario revoca y vuelve a activar | Al desconectar borramos el calendar de Google. Al reconectar se crea uno nuevo. Los `gcal_event_id` viejos quedan obsoletos (limpiados en disconnect). Re-backfill genera todos los eventos nuevos. |
| FastAPI `BackgroundTasks` corre en el mismo proceso, perdiendo tareas en restart | Para v1 aceptable porque la DB es la fuente de verdad y el backfill idempotente recupera lo perdido. Si llegamos a escala donde esto duele, migramos a Celery/Arq en una rev posterior. |
| Usuario edita una recurring instance vía cliente que NO marca el override explícito | Detección heurística en el endpoint PUT: si la fila editada tiene `serie_id` y campos editados difieren del master del mismo serie_id → tratamos como override. Si la heurística falla (edge case), el sync queda inconsistente pero la app sigue funcionando. |
| Eventos all-day no soportados | `Actividad.inicio` y `Actividad.fin` son DateTime, no Date. Los eventos all-day en Google requieren `event.start.date` (sin time). Si el usuario crea una actividad de 00:00 a 23:59, igual la pusheamos como timed event. Aceptable para v1. |
| Sefirot con colores hex no mapeables limpio a los 11 colorIds de Google | Tabla de mapping hardcoded: cada sefirá del enum se asigna al colorId más cercano visualmente. Documentado en `gcal_mapper.py` con comentarios. |

---

## 8. Out of scope / Future

- **Linkear cuenta Google a usuarios email/password** (extiende sync a la otra mitad de los usuarios).
- **Picker de calendario target para usuarios premium** (el modelo de datos ya lo soporta vía `google_calendar_id`).
- **Sync bidireccional** (eventos creados en Google → Kabbalah). Requiere webhooks o polling, conflict resolution, asignación de sefirá a eventos importados.
- **Webhooks de Google** (push notifications) para detectar cambios desde Google.
- **Sync con Outlook / Apple Calendar / CalDAV**.
- **Color por sefirá editable por el usuario** (hoy hardcoded).
- **Eventos all-day** (requiere extender `Actividad` con un flag `is_all_day` y manejar el payload diferente).
- **Múltiples calendarios "Kabbalah Space"** (uno por sefirá, p.ej.).
- **Rotación automática de `FERNET_KEY`** con re-encrypt batch.
- **Cancelación del backfill** mid-flight (hoy se completa siempre).
