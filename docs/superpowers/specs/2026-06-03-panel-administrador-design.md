# Spec: Panel de Administrador

**Fecha:** 2026-06-03
**Estado:** Aprobado, listo para plan de implementación
**Rama de trabajo:** feat/gcal-sync (rama activa actual)

## Objetivo

Dar al/los dueño(s) de Kabbalah Space un panel de administración para:

1. Gestionar las preguntas guía de cada sefirá (crear, editar, borrar, reordenar).
2. Ver estadísticas de la plataforma (usuarios, actividad/uso, premium/ingresos).
3. Ver y gestionar usuarios (listar, eliminar, otorgar/quitar premium, nombrar/quitar admin).

Hoy existe un `AdminPanel.tsx` plano que sólo crea/borra preguntas, **sin ningún control de acceso** y usando una URL hardcodeada. Este trabajo lo reemplaza por un módulo completo y seguro.

## Decisiones tomadas (brainstorming)

- **Acceso:** roles gestionables desde la UI (no sólo lista en config).
- **Stats:** usuarios + actividad/uso + premium/ingresos (NO stats de contenido).
- **Usuarios:** ver lista, eliminar, otorgar/quitar premium (+ nombrar/quitar admin, implícito por roles gestionables).
- **Preguntas:** crear, editar, borrar y reordenar.
- **Arquitectura:** módulo separado (`backend/admin/` + `frontend/src/admin/`), siguiendo el patrón de `billing/`.
- **Premium manual:** indefinido (sin fecha de vencimiento).
- **Reordenar preguntas:** botones subir/bajar (sin librería de drag-and-drop).

## Estado actual relevante (descubierto)

- `Usuario` ([backend/models.py](../../../backend/models.py)) no tiene concepto de admin/rol.
- `PreguntaSefira` no tiene campo de orden.
- Endpoints actuales: `GET/POST/DELETE /preguntas` en [backend/main.py:459-480](../../../backend/main.py) — los mutantes están **abiertos sin auth**.
- Auth: `get_current_user` ([backend/auth.py:100](../../../backend/auth.py)) valida JWT Bearer; `UserOut` es el schema de salida.
- Premium: `Subscription` ([backend/billing/models.py](../../../backend/billing/models.py)) con `status` (trial|active|...), `plan`, `lemonsqueezy_subscription_id` (NOT NULL, único), `current_period_start/end`, `canceled_at`. La verdad de "es premium" es `Usuario.is_premium` (join con subscription status in trial|active).
- Frontend: cliente auth-aware `apiFetch` en [frontend/src/auth/api.ts](../../../frontend/src/auth/api.ts). App de una sola página con conmutación de vistas por estado (`ViewKey`) en [frontend/src/App.tsx](../../../frontend/src/App.tsx); ya existe la vista `'admin'`.

## 1. Modelo de datos (migraciones Alembic)

### 1.1 `usuarios.is_admin`
- Columna `Boolean NOT NULL, server_default="false"`.
- Migración: añade la columna.

### 1.2 `preguntas_sefirot.orden`
- Columna `Integer NOT NULL, server_default="0"`.
- Migración: añade la columna y rellena el orden de las filas existentes por `fecha_creacion` ascendente, agrupado por `sefira_id` (0-based o 1-based, consistente).

### 1.3 Bootstrap del primer admin
- Nuevo setting `admin_bootstrap_emails: str = ""` en [backend/config.py](../../../backend/config.py) (lista separada por comas, vía `.env`).
- En el `lifespan`/startup de la app: parsear la lista y hacer `UPDATE usuarios SET is_admin = true WHERE email IN (...)`. Idempotente.
- Garantiza acceso del dueño aunque se resetee la BD y resuelve el problema huevo-y-gallina (sin un admin inicial nadie podría nombrar admins desde la UI).

## 2. Control de acceso (backend)

- Nueva dependencia `require_admin` (en `backend/admin/deps.py` o `routers.py`):
  ```python
  async def require_admin(user: Usuario = Depends(get_current_user)) -> Usuario:
      if not user.is_admin:
          raise HTTPException(403, "Acceso de administrador requerido")
      return user
  ```
- Todos los endpoints `/admin/*` dependen de `require_admin`.
- `UserOut` ([backend/auth.py](../../../backend/auth.py)) gana `is_admin: bool = False` para que el frontend decida si exponer el panel.

## 3. Backend — módulo `backend/admin/`

Nuevo paquete (patrón `billing/`): `__init__.py`, `routers.py`, `schemas.py`. `APIRouter` con prefijo `/admin`, incluido en main.py vía `app.include_router(admin_router)`.

### 3.1 Estadísticas
- `GET /admin/stats` → objeto con tres bloques:
  - **usuarios**: `total`, `nuevos_hoy`, `nuevos_semana`, `nuevos_mes`, `por_provider` {email, google}, `premium` (count).
  - **actividad**: `reflexiones_total`, `respuestas_total`, `actividades_total`, `usuarios_activos_7d`, `usuarios_activos_30d`, `gcal_sync_activos`.
  - **premium**: `activos`, `trial`, `cancelados`, `por_plan` (dict plan→count).
- "Usuario activo" = usuario con al menos un registro/respuesta/actividad creado en la ventana. Se define la métrica de forma simple y consistente en el plan.

### 3.2 Usuarios
- `GET /admin/usuarios?search=&limit=50&offset=0` → lista paginada. Campos: id, nombre, email, provider, is_admin, is_premium, fecha_creacion. `search` filtra por nombre/email (case-insensitive).
- `POST /admin/usuarios/{id}/admin` → `is_admin = true`.
- `DELETE /admin/usuarios/{id}/admin` → `is_admin = false`. **Guard:** no podés degradarte a vos mismo; no podés degradar al último admin.
- `POST /admin/usuarios/{id}/premium` → otorgar premium manual: crea `Subscription` con `status="active"`, `plan="manual"`, `lemonsqueezy_subscription_id=f"manual-{uuid}"`, `lemonsqueezy_customer_id="manual"`, `current_period_start=now`, `current_period_end=now + ~100 años` (indefinido). Si ya tiene subscription activa, no-op o 409.
- `DELETE /admin/usuarios/{id}/premium` → quitar premium: borra la fila `Subscription` del usuario (o sólo la de plan="manual"; el plan decide). Para suscripciones reales de Lemonsqueezy, advertir/no tocar — el alcance v1 es premium manual.
- `DELETE /admin/usuarios/{id}` → elimina la cuenta (cascade ya configurado en los FKs). **Guard:** no podés eliminar tu propia cuenta ni al último admin.

### 3.3 Preguntas (reemplaza los endpoints actuales)
- `GET /admin/preguntas/{sefira_id}` → ordenadas por `orden` asc.
- `POST /admin/preguntas` `{sefira_id, texto}` → crea con `orden = max(orden)+1` en esa sefirá.
- `PATCH /admin/preguntas/{id}` `{texto}` → edita el texto. **(nuevo)**
- `DELETE /admin/preguntas/{id}` → borra.
- `PUT /admin/preguntas/{sefira_id}/orden` `{ids: [...]}` → reordena; valida que `ids` sean exactamente las preguntas de esa sefirá y reasigna `orden` por índice.

### 3.4 Seguridad del estado actual
- Se eliminan los `POST /preguntas` y `DELETE /preguntas/{id}` abiertos de [backend/main.py](../../../backend/main.py); su funcionalidad vive ahora bajo `/admin/preguntas/*` con `require_admin`.
- El `GET /preguntas/{sefira_id}` público se mantiene (lo consume el módulo Espejo de los usuarios). Debe devolver las preguntas ordenadas por `orden`.

## 4. Frontend — `frontend/src/admin/`

Reemplaza [frontend/src/AdminPanel.tsx](../../../frontend/src/AdminPanel.tsx) (se elimina el archivo plano).

- `AdminModule.tsx` — contenedor con 3 pestañas: **Estadísticas · Preguntas · Usuarios**.
- `components/StatsPanel.tsx` — tarjetas con las métricas de `GET /admin/stats`.
- `components/PreguntasPanel.tsx` — selector de sefirá + lista; editar in-place, borrar, reordenar con botones ↑/↓ (cada cambio persiste vía `PUT .../orden`), formulario de alta.
- `components/UsuariosPanel.tsx` — tabla con búsqueda; acciones por fila (otorgar/quitar premium, nombrar/quitar admin, eliminar) con diálogo de confirmación en las destructivas.
- `api.ts` — wrappers sobre `apiFetch` (token incluido); reemplaza la URL hardcodeada.
- Respeta el estilo visual existente (glass `bg-stone-950/40 backdrop-blur`, dorado sobre negro, `glowText`).

### 4.1 Gating de navegación
- Se añade `is_admin: boolean` al tipo `User` ([frontend/src/auth/types.ts]) y se propaga desde `/auth/me`.
- El enlace de acceso al panel (en el menú del avatar / `InicioNav`) sólo se renderiza si `user.is_admin`.
- En [App.tsx](../../../frontend/src/App.tsx), la vista `'admin'` sólo es alcanzable por admins; el backend igual responde 403 si se fuerza.

## 5. Manejo de errores

- 403 desde `require_admin` para no-admins; el frontend trata 403 mostrando "sin acceso" (no debería ocurrir en flujo normal porque el link está oculto).
- Guards anti-lockout devuelven 400/409 con mensaje claro (no degradar/eliminar último admin ni a uno mismo).
- Acciones destructivas en el frontend siempre con confirmación.

## 6. Testing (pytest, patrón de las suites de privacidad existentes)

- `require_admin`: 403 para usuario normal, 200 para admin, 401 sin token.
- Cada grupo de endpoints `/admin/*` rechaza no-admins.
- Preguntas: crear asigna orden correcto; editar persiste texto; reordenar persiste; `GET /preguntas` público devuelve ordenado.
- Usuarios: listar/paginar/buscar; eliminar; grant/revoke premium manual refleja `is_premium`.
- Guards: no degradar al último admin; no auto-eliminarse; no auto-degradarse.
- Bootstrap: emails en `admin_bootstrap_emails` quedan `is_admin=true` al startup.

## Fuera de alcance (v1)

- Stats de contenido (qué preguntas se responden más/menos).
- Edición de subscripciones reales de Lemonsqueezy desde el panel (sólo premium manual).
- Auditoría/log de acciones admin.
- Drag-and-drop para reordenar (se usan botones).
