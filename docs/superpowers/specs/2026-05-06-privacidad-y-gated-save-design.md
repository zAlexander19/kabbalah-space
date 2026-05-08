# Privacidad por usuario + Gated Save — Spec

**Fecha:** 2026-05-06
**Issues:** #28 (refinado) + #30 (nuevo)
**Alcance:** Asegurar que todas las reflexiones y actividades de un usuario sean **privadas a su cuenta**, tanto en la base de datos como en los drafts locales. Sumar UX de "guardar con sesión" — el usuario puede escribir sin loguearse y al apretar Guardar, el sistema gatea el flujo, preserva lo escrito y completa el guardado tras login. Confirmación explícita antes de cada POST.

---

## 1. Objetivo y motivación

Hoy:

- `RespuestaPregunta` y `Actividad` no tienen `user_id`. `GET /respuestas/{sefira_id}`, `GET /actividades`, etc. devuelven datos de **todos los usuarios mezclados**. Cualquiera con un browser puede leer reflexiones de cualquier otro.
- `POST /respuestas`, `POST /actividades`, `POST /evaluate` no requieren auth: un anónimo puede crear registros que después nadie puede atribuir.
- En el frontend, los formularios de Espejo y Calendario funcionan sin login. Si el user empieza a escribir y refresca, pierde todo.

Decisión de producto: **privacidad 100% — un usuario solo ve lo suyo, ya lo haya escrito anónimo o logueado**. Y: **drafts no se pierden** — autosave local con TTL para anónimos, sin TTL para logueados.

Esto se separa en dos issues con orden de merge fijo (Phase 1 → Phase 2) porque mergear el frontend antes del backend dejaría a anónimos rotos.

---

## 2. Decisiones tomadas

| Eje | Decisión |
|---|---|
| Persistencia de drafts | Autosave a `localStorage` en cada cambio (debounced 250ms) |
| Granularidad de drafts | Uno por "objeto": `draft.espejo.<sefira_id>` y `draft.calendario.new` |
| Privacidad de drafts | Cada draft lleva `owner: user_id \| null` |
| Adoption en login | Drafts con `owner: null` se reescriben con `owner: user.id` al loguear |
| Wipe en logout / cambio de cuenta | Borramos todo el namespace `kabbalah_drafts:*` |
| TTL anónimos | 24 h. Al rehidratar un draft anónimo más viejo, se descarta silenciosamente |
| TTL logueados | Sin expiración |
| Flujo de guardado (logueado) | Click Guardar → modal "¿Seguro? (las respuestas se bloquean 30d)" → confirmar → POST |
| Flujo de guardado (anónimo) | Click Guardar → LoginModal → tras login → modal "¿Seguro?" → confirmar → POST |
| Auto-replay tras login | Solo si el LoginModal se abrió con `triggeredBy: 'gated-save'`. Si abrió manualmente desde header, el draft queda esperando |
| Privacidad backend | Todos los endpoints de negocio requieren token; queries filtran por `current_user.id` |
| Datos legacy en DB local | Wipe en la migración (no hay datos prod todavía) |
| Out of scope | Sync de drafts entre devices, undo de un POST confirmado, rate limiting, sharing entre users |

---

## 3. Arquitectura — Phase 1 (Backend, issue #30)

### 3.1 Schema

**Estado actual del schema** — las columnas `usuario_id` (String(36) FK a `usuarios.id`, ON DELETE CASCADE) **ya existen** en `RespuestaPregunta`, `Actividad` y `RegistroDiario`, pero están **nullable y nunca se setean ni se leen** en `backend/main.py`. Entonces todas las rows actuales tienen `usuario_id IS NULL`.

Migración Alembic `xxxx_enforce_usuario_id_on_user_data.py`:

1. `DELETE FROM respuestas_preguntas` (wipe legacy — todos los rows tienen `usuario_id NULL`).
2. `DELETE FROM actividades_sefirot; DELETE FROM actividades`.
3. `DELETE FROM registros_diario`.
4. `ALTER COLUMN usuario_id SET NOT NULL` en las tres tablas (en SQLite eso requiere el patrón "rename + recreate"; Alembic `batch_alter_table` lo maneja).
5. Crear índices `ix_respuestas_preguntas_usuario_id`, `ix_actividades_usuario_id`, `ix_registros_diario_usuario_id` si no existen.

Modelos en `backend/models.py`: agregar `nullable=False` a las tres columnas `usuario_id` y `index=True`. Agregar `back_populates` en `Usuario` con las tres relaciones (`respuestas`, `actividades`, `registros`).

### 3.2 Endpoints

Cada handler agrega `user: Usuario = Depends(get_current_user)` y los queries filtran por `user.id`. El campo en la DB se llama `usuario_id` (mantenemos la convención en castellano del schema existente).

| Endpoint | Cambio |
|---|---|
| `POST /evaluate` | Requiere token. `RegistroDiario` se crea con `usuario_id=user.id` |
| `POST /respuestas` | Requiere token. Inyecta `usuario_id`. Cooldown 30d se calcula filtrando por `usuario_id == user.id` |
| `GET /respuestas/{sefira_id}` | Filtra por `usuario_id == user.id` (cooldown por usuario) |
| `GET /espejo/resumen` | Filtra registros y respuestas por `usuario_id` |
| `GET /espejo/registros/{sefira_id}` | Filtra por `usuario_id` |
| `GET /espejo/evolucion` | Filtra por `usuario_id` |
| `POST/GET/PUT/DELETE /actividades*` | Filtra y persiste por `usuario_id` |
| `GET /volumen-semanal` | Filtra por `usuario_id` |
| Endpoints públicos | `/sefirot`, `/auth/*`, `/health`, `/auth/config` siguen sin auth |

### 3.3 Autorización implícita

Por filtrar por `user_id`, un user que pida `GET /actividades/<id-de-otro>` recibe 404, no 403 — para no leakear existencia. Los DELETE/PUT por id también devuelven 404 si la actividad existe pero pertenece a otro.

### 3.4 Tests

- `tests/test_privacy.py`: dos usuarios A y B. A crea respuesta+actividad. B no las ve en sus listas, ni puede leer/editar/borrar por id (404).
- Cooldown 30d: ahora es por usuario (A y B pueden contestar la misma pregunta independientemente).
- Endpoints sin token devuelven 401.

---

## 4. Arquitectura — Phase 2 (Frontend, issue #28)

### 4.1 Módulo nuevo: `frontend/src/shared/drafts/`

Cinco archivos. Cada uno hace una cosa.

**`storage.ts`** — Capa de persistencia pura. Sin React.
```ts
type Draft<T> = { value: T; owner: string | null; updatedAt: number };
export function readDraft<T>(scope, key, currentOwner): Draft<T> | null;
export function writeDraft<T>(scope, key, value: T, currentOwner): void;
export function clearDraft(scope, key): void;
export function wipeAll(): void;
export function adoptAnonymous(newOwner: string): void; // null → user_id
```
Reglas:
- Namespace de keys: `kabbalah_drafts:<scope>:<key>`.
- `readDraft` filtra por owner. Si `currentOwner === null` (anónimo) y el draft tiene `owner === null`, devuelve solo si `Date.now() - updatedAt < 24h`. Si pasó el TTL, lo borra y devuelve null.
- `readDraft` con `currentOwner === user.id` solo devuelve si `draft.owner === user.id` (sin TTL).
- `wipeAll` itera `localStorage` y borra todo lo que matchee `kabbalah_drafts:`.

**`useDraftPersistence.ts`** — Hook de autosave + rehidratación.
```ts
function useDraftPersistence<T>(scope, key, value: T, deps): {
  hydrated: T | null;
  hasPendingDraft: boolean;
  clear: () => void;
};
```
- Al montar, lee de `storage` y devuelve `hydrated` (el caller decide si lo aplica al state inicial).
- Al cambiar `value`, escribe con debounce 250ms. Owner = `useAuth().user?.id ?? null`.
- `hasPendingDraft = hydrated !== null && hydrated !== value` — útil para mostrar el badge.

**`useGatedSave.ts`** — Hook que envuelve la acción de guardado.
```ts
function useGatedSave(onSubmit: () => Promise<void>): {
  triggerSave: () => void;
  isConfirming: boolean;
  isSaving: boolean;
  confirm: () => Promise<void>;
  cancel: () => void;
};
```
- `triggerSave()`:
  - Si `auth.status === 'authenticated'` → setea `isConfirming = true` (muestra el dialog).
  - Si `auth.status === 'anonymous'` → llama a `auth.openLoginModal({ triggeredBy: 'gated-save' })`. Cuando `auth.status` cambie a `'authenticated'` (por efecto), si la causa fue gated-save, setea `isConfirming = true` automáticamente.
- `confirm()` → ejecuta `onSubmit()`, luego `isConfirming = false`. Errores se rethrow al caller para que muestre el mensaje en su UI propia.

**`ConfirmSaveDialog.tsx`** — Modal genérico, dos botones.
```tsx
<ConfirmSaveDialog open title body confirmLabel onConfirm onCancel />
```
Body es un `ReactNode` para que cada caller meta su mensaje específico ("Las respuestas se bloquearán por 30 días" / "Se creará la actividad").

**`PendingDraftBadge.tsx`** — Chip pequeño "Tenés un borrador sin guardar". Posicionable absolutamente o inline; recibe `onResume` opcional.

### 4.2 Cambios en `AuthContext.tsx`

- Agregar `triggeredBy?: 'gated-save' | 'manual'` al `openLoginModal`. Persistir en state.
- En el callback de login exitoso (después de `setStatus('authenticated')`):
  1. Llamar `adoptAnonymous(me.id)` — los drafts anónimos quedan firmados con el user.
  2. Si el último `triggeredBy === 'gated-save'`, exponer un evento (callback registrado por `useGatedSave`) para que dispare el confirm dialog.
- En `logout`: llamar `wipeAll()` antes de `setStoredToken(null)`.
- En `setUnauthorizedHandler` (cuando un 401 fuerza logout): también `wipeAll()`.
- Detectar cambio de `user.id` entre sesiones: si el `me` que devuelve `/auth/me` tiene un id distinto al que ya teníamos guardado en memoria, `wipeAll()` antes de adoptar.

### 4.3 Wire-up — Espejo

`SefiraDetailPanel.tsx`:
- El handler que hoy ejecuta el batch save inline pasa a usar `useGatedSave`.
- El `onBatchSave` que recibe `QuestionCarousel` se vuelve `triggerSave` envuelto.

`QuestionCarousel.tsx`:
- Recibe nuevo prop `sefiraId: string`.
- Usa `useDraftPersistence('espejo', sefiraId, answers, [sefiraId])` para autosave + rehidratar el state inicial de `answers`.
- Si el draft rehidratado tiene respuestas, arranca en el primer `pregunta_id` sin respuesta (mejor UX que volver a la 1).
- Render del `<PendingDraftBadge>` arriba del carrusel cuando `hasPendingDraft`.

`EspejoModule.tsx` o donde corresponda: el `<ConfirmSaveDialog>` se renderiza en el módulo (no dentro del carrusel) para no recrearlo a cada step.

### 4.4 Wire-up — Calendar

`ActivityForm.tsx`:
1. **Refactor previo**: cambiar `fetch(...)` crudo por `apiFetch(...)` (sino los POSTs del calendario no llevan token y rompen tras Phase 1). Usar el wrapper que ya existe en `frontend/src/auth/api.ts`.
2. Para el flujo "crear actividad nueva" (sin `editing`): envolver el handler de submit con `useGatedSave` y persistir con `useDraftPersistence('calendario', 'new', formState, [])`.
3. Para "editar existente" (`editing != null`): no hay draft ni gating. El user ya está logueado (porque está editando algo suyo) y editar es PUT directo.

### 4.5 Tests

- Vitest + Testing Library:
  - `useDraftPersistence`: rehidrata, autosaves debounced, respeta owner filter, respeta TTL 24h.
  - `useGatedSave`: en anónimo abre modal con flag correcto; en logueado va directo al confirm; auto-replay tras login.
  - `storage.ts`: `wipeAll`, `adoptAnonymous`, TTL boundaries.
- Manual:
  - Espejo: contestar 2 preguntas anónimo → refrescar página → carrusel arranca en pregunta 3 con las 2 anteriores ya escritas → click Guardar → LoginModal → loguear → confirm dialog → POST → grid de respuestas.
  - Logout: confirmar que `localStorage` queda sin keys `kabbalah_drafts:*`.
  - Cambio de cuenta: A escribe draft, A loguea, A logout, B loguea — B no ve nada de A.

---

## 5. Plan de merge

Dos PRs separados. **#30 mergea primero**.

1. **PR para #30** — backend ownership. Antes de mergear, en local: `pbi connect` no aplica acá; correr migración con `alembic upgrade head` contra DB local (que se vacía). Tests verdes.
2. **PR para #28** — frontend gated save + drafts. Asume que `main` ya tiene #30. El frontend agrega Authorization header (vía `apiFetch`) en todos los POST a /respuestas y /actividades.

Si por alguna razón el orden se invierte localmente (estoy en #28 antes de mergear #30): el dev server del backend puede correr una rama temporal con #30 mientras desarrollo #28.

---

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| `localStorage` lleno | Wipe en logout + TTL 24h en anónimos limita el crecimiento. Cada draft pesa <5 KB |
| User cierra el LoginModal sin loguear y pierde el draft de "sesión actual" | El draft está en `localStorage` con `owner: null`, sigue ahí. Reabre y reanuda |
| Race: user loguea desde header (manual) mientras tiene un draft que se disparó por gated-save | El flag `triggeredBy` se pisa: el último gana. Aceptable — UX rara pero no destruye datos |
| Migración borra datos de prueba que el dev quería conservar | Documentar en el PR. Recomendar `cp kabbalah.db kabbalah.db.bak` antes de migrar |
| Usuario logueado hace click Guardar varias veces antes de confirmar | El `<ConfirmSaveDialog>` es un singleton por módulo; mientras esté abierto, `isConfirming = true` y `triggerSave` es noop |
| 401 en medio de un POST (token expiró) | El interceptor en `apiFetch` ya lo cubre — abre LoginModal automáticamente. El draft sigue intacto |

---

## 7. Open / future

- Sync de drafts a backend para que crucen devices: requiere endpoint nuevo. Out of scope.
- Indicador "borradores en otras sefirot": un contador global con la cantidad de drafts pendientes. Out of scope, fácil de agregar después.
- Soft-delete en lugar de wipe en logout: out of scope. El requisito de privacidad pesa más que la conveniencia.
