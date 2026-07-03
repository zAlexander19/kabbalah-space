# Pulido UX + Seguridad + Popup Premium — Diseño

**Fecha:** 2026-07-02
**Rama:** feat/gcal-sync
**Origen:** pedido del usuario: mejorar fluidez, best practices de botones, seguridad efectiva, revisar responsive, y un popup premium que aparezca de vez en cuando.

Este spec consolida tres auditorías (seguridad, UX/botones, responsive) hechas sobre el código actual. La sesión corre en modo autónomo: las decisiones marcadas *(decisión)* fueron tomadas sin consulta y son fáciles de revertir.

---

## 1. Seguridad (backend)

Lo que ya está bien y NO se toca: bcrypt, JWT con algoritmo fijo, webhook Lemonsqueezy HMAC timing-safe + idempotente, anti-IDOR consistente, admin con `require_admin`, Fernet para tokens de Google, secretos fuera de git.

Cambios:

1. **`jwt_secret` default inseguro** (`config.py:67`): nuevo setting `environment` (default `development`). En `lifespan`, si `environment=production` y el secret sigue en `change-me-in-prod` → `RuntimeError` (la app no arranca). En dev solo warning. `render.yaml` y `.do/app.yaml` (si existe) setean `ENVIRONMENT=production`.
2. **Security headers**: middleware que agrega `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` mínima; HSTS solo cuando el request llegó por https (directo o `x-forwarded-proto`).
3. **Rate limiting** *(decisión: limiter propio in-memory, sin dependencia nueva — la app corre single-instance; slowapi sería equivalente pero suma deps)*: módulo `rate_limit.py` con ventana deslizante.
   - `/auth/login`: 10 intentos / 5 min por IP+email.
   - `/auth/register`: 20 / hora por IP.
   - Endpoints IA (`/ia/respuestas/evaluar`, `/ia/calendario/felicitacion`): 60 / hora por usuario (protege costo Gemini).
   - Respuesta 429 con `Retry-After`. Reset por test en conftest (autouse) + tests dedicados.
4. **Límites de input**: `max_length` en texto libre — `ActividadCreate.titulo` 200 / `descripcion` 5000, `EvaluationRequest.text` 20000, `RespuestaCreate.respuesta_texto` 20000, `ReflexionLibreCreate.contenido` 20000. Middleware de body: rechaza `Content-Length` > 1 MB con 413.

Riesgos aceptados (documentados, sin cambio): JWT 24 h en localStorage (migrar a cookie HttpOnly + refresh tokens es un cambio de arquitectura — queda como deuda), mensaje de email duplicado en registro (UX deliberada, mitigada por rate limit), f-string constante en migración Alembic.

## 2. Fluidez

1. **Reset de scroll** al cambiar de vista (`App.tsx`, effect sobre `activeView`).
2. **Transición entre vistas**: fade corto (0.18–0.25 s) del `<section>` + título/subtítulo animados por `activeView` (hoy el swap es seco). Respetando `useReducedMotion`.
3. **Globales en `index.css`**: `-webkit-font-smoothing: antialiased`, `overscroll-behavior-y: none` en body, focus-ring global dorado `:focus-visible` para `button/a/[role=button]` (hoy solo 3 componentes tienen ring de marca).

## 3. Botones — best practices

1. `PreguntasPanel`: estado `busy` en crear/editar/borrar (hoy permite doble-submit), `aria-label` en icon-buttons, touch targets ≥36 px.
2. `UsuariosPanel`: `aria-label` explícito (hoy solo `title`).
3. `ActivityForm`: guardia in-flight en borrar; `GcalSyncCard`: "Reintentar" usa el flag `working`.
4. `CalendarToolbar` prev/next: `type="button"`.
5. **Teclado en calendario**: chips de actividad (`CalendarEvent`) y celdas/slots (`MonthView`, `WeekView`, `DayViewMobile`) con `role="button"` + `tabIndex` + Enter/Espacio; skip de `EspejoIntro` ídem. Kebab del chip: área clickeable ≥32 px sin agrandar el icono.

## 4. Responsive

1. **iOS zoom**: regla global — inputs/textarea/select con `font-size: 16px` bajo 768 px.
2. `LoginModal`: `max-h-[90vh] + overflow-y-auto` (hoy el form de registro se recorta en landscape).
3. `ConfirmSaveDialog` y `RecurrenceScopeDialog`: `max-h` defensivo.
4. `SefiraHeader`: `text-3xl md:text-4xl`.
5. `WeekViewMobile`: implementar el scroll horizontal + `min-w` que su propio comentario promete.

Aceptado sin cambio: tabla admin con scroll horizontal en mobile (funciona; rediseño a cards queda como mejora futura), árbol del espejo en viewports de 320 px.

## 5. Popup premium recurrente

Nuevo `frontend/src/premium/PremiumPromoPopup.tsx`, integrado en `App.tsx`.

- **Quién lo ve**: usuarios no-premium (free o anónimos). Nunca premium.
- **Cuándo** *(decisión)*: a los 45 s de sesión activa; máx. 1 vez por sesión (`sessionStorage`); mínimo 4 días entre apariciones (`localStorage ks_premium_promo_last_shown`). Suprimido si: tour activo, gate o modal de planes abiertos, login modal abierto, vista admin/cuenta.
- **Contenido**: estética Templo Digital (dorado sobre oscuro), título + `PREMIUM_HIGHLIGHTS` + precios reales (USD 5.99/mes · USD 59.99/año, ahorrás 2 meses). CTA primario "Ver planes" → `gate.openPlans()`; secundario "Ahora no" (cierra y arranca cooldown).
- **A11y**: `role="dialog"`, `aria-modal`, Escape, scroll lock, foco al CTA, `useReducedMotion`.

## 6. Verificación

- Backend: `pytest` completo (incluye tests nuevos de rate limit y max_length).
- Frontend: `tsc -b && vite build` + `eslint`.
- Smoke: levantar uvicorn y verificar `/health` + arranque sin errores.
- `graphify update .` al final.

## 7. Fuera de alcance

Cookie HttpOnly/refresh tokens, rediseño de tabla admin en mobile, TrustedHostMiddleware, verificación de email en registro.
