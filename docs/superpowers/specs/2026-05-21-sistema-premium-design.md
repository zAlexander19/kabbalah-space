# Sistema Premium — Diseño

**Fecha:** 2026-05-21
**Estado:** Spec aprobado, pendiente plan de implementación
**Rama de trabajo:** `feat/gcal-sync` (rama de trabajo activa) → se creará sub-rama para implementación
**Dependencia:** rama paralela del motor de IA (issue #9). Diseñado para arrancar sin IA y "pluggear" la IA en Fase 2.

---

## 1. Contexto y motivación

Kabbalah Space necesita un modelo de monetización que sostenga los costos del motor de IA (issue #9) y haga sostenible la operación, sin traicionar el espíritu del producto: una práctica seria de auto-conocimiento.

El público objetivo son personas con interés genuino en la Kabbalah, dispuestas a invertir en herramientas que profundicen su práctica. No se busca optimizar conversión a costa de la integridad — se busca un free generoso que enganche y un premium con valor real.

**Decisión clave:** un solo tier premium (no dos tiers — se descartó por complejidad de comunicación) con dos opciones de facturación (mensual y anual).

## 2. Tiers — qué hay en cada uno

### Free — "Caminar el árbol"
- Espejo Cognitivo: árbol interactivo, todas las preguntas guía con cooldown 30 días por pregunta
- **1 reflexión libre por mes** (sefirá o árbol) — al intentar guardar la 2da, modal premium
- Calendario Cabalístico: hasta **10 actividades simples activas**, sin recurrencias
- Google Calendar sync **habilitado** (gancho — usuario ve que funciona)
- Mi Evolución: timeline → mes → sefirá con drill semanal completo
- Histórico: últimos **12 meses** en Mi Evolución y Espejo
- Cuenta: Google OAuth + email/pass, drafts autosave

### Premium — "Profundizar en el árbol"
**Precio:** USD 6.58/mes o USD 65.80/año (descuento ~17% = 2 meses)

Todo lo de Free, +:
- **Reflexión libre ilimitada** (sefirá y árbol)
- **Calendario sin límite + recurrencias permitidas** (cualquier RRULE)
- **Cooldown reducido a 7 días** en preguntas guía
- **Histórico ilimitado**
- **Motor de IA real**: devolución personalizada en cada reflexión, análisis de fricción/polaridad, recomendaciones por sefirá *(depende de Fase 2)*
- **Seguimiento por correo**: resumen semanal, resumen mensual, alertas de desbalance, recordatorios de reflexión

### Filosofía de la división
- Free → Premium: gate cuantitativo (límites en cantidad)
- Premium agrega *inteligencia* y *acompañamiento*, no "más datos" del propio usuario
- No se cobra por ver el propio historial — eso sería mezquino y traiciona la confianza

### Decisiones explícitamente fuera de scope
- Dashboard avanzado (heatmap, radar) — fuera del scope de premium en esta versión
- Múltiples calendarios sincronizados — fuera de scope
- Sync bidireccional con Google Calendar — fuera de scope
- Tier "Lite" intermedio — descartado por complejidad de mensaje

## 3. Trial gateado por código promo

**Política:**
- **No hay trial general.** Quien llega a `/premium` orgánicamente ve "Suscribirse" directo con cobro inmediato.
- **Trial 7 días con tarjeta requerida** se ofrece SOLO a quienes llegan con un código promocional válido en la URL (ej. `/premium?promo=launch7`).
- Tarjeta requerida desde el día 1. Al día 7 se cobra automáticamente salvo cancelación.

**Razón:** el trial es un activo de marketing controlado, no un default. Permite hacer campañas con "7 días gratis" específicas. Conversión orgánica entra al funnel limpio.

**Por qué 7 días:** alcanza a entregar 1 resumen semanal (cae al día 7) + 1-2 devoluciones de IA + dejar que el usuario use reflexión libre y calendario sin topes. El usuario ve el valor antes de que se le cobre.

## 4. Cancelación y reembolsos

- **Cancelar es visible** en "Mi Cuenta → Suscripción" (botón "Gestionar suscripción" lleva al portal de Lemonsqueezy)
- **Cancelación inmediata no corta el acceso**: el usuario mantiene premium hasta el final del período pagado, después pasa a free
- **Política de reembolsos:** no hay reembolsos automáticos. Cancela cuando quieras, no se cobra el siguiente período. Casos especiales se atienden manualmente desde el dashboard de Lemonsqueezy.

## 5. Stack de pagos

**Lemonsqueezy como Merchant of Record** (MoR).

**Por qué:**
- Una sola integración cubre ventas globales (LATAM, USA, EU, Asia)
- Se encargan de IVA / VAT / GST por país (esto sería un dolor de cabeza fiscal sin equipo de compliance)
- Suscripciones, trials, refunds, dunning, customer portal — todo incluido
- Comisión ~5% (mayor que Stripe directo ~3.9%) pero ahorra costos de contador internacional y compliance fiscal por país

**Setup:**
- 1 producto en Lemonsqueezy: "Kabbalah Space Premium"
- 2 variantes: Monthly USD 6.58 / Yearly USD 65.80
- Webhooks configurados a `POST /webhooks/lemonsqueezy`
- Trial NO configurado como default — se aplica dinámicamente con `subscription_trial_period_days` solo si hay promo válido

## 6. Modelo de datos

### Tabla nueva: `subscriptions`
```
id                            uuid PK
usuario_id                    int FK -> usuarios.id (UNIQUE — un usuario, una suscripción)
status                        enum('trial', 'active', 'past_due', 'canceled', 'expired')
plan                          enum('monthly', 'yearly')
lemonsqueezy_subscription_id  varchar
lemonsqueezy_customer_id      varchar
trial_ends_at                 timestamp nullable
current_period_start          timestamp
current_period_end            timestamp
canceled_at                   timestamp nullable
created_at                    timestamp
updated_at                    timestamp
```

### Tabla nueva: `promo_codes`
```
id           uuid PK
code         varchar UNIQUE
trial_days   int DEFAULT 7
max_uses     int nullable (NULL = ilimitado)
uses_count   int DEFAULT 0
expires_at   timestamp nullable
created_at   timestamp
```

### Tabla nueva: `email_preferences`
```
usuario_id              int PK + FK -> usuarios.id
weekly_summary          bool DEFAULT true
monthly_summary         bool DEFAULT true
imbalance_alerts        bool DEFAULT true
reflection_reminders    bool DEFAULT true
updated_at              timestamp
```
Row se crea al hacerse premium (todos los tipos en `true`).

### Tabla nueva: `email_log`
```
id                int PK
usuario_id        int FK
email_type        varchar
idempotency_key   varchar UNIQUE
status            enum('sent', 'delivered', 'bounced', 'complained', 'failed')
sent_at           timestamp
provider_event_id varchar nullable (Resend message ID)
```
Idempotency key formato: `{usuario_id}-{tipo}-{periodo}` (ej. `42-weekly-2026-W21`).

### Tabla nueva: `webhook_events`
```
id          int PK
provider    varchar (ej. 'lemonsqueezy', 'resend')
event_id    varchar
event_type  varchar
received_at timestamp
UNIQUE (provider, event_id)
```
Para deduplicar webhooks que el proveedor pueda reenviar. Antes de procesar un webhook, insertar acá; si la UNIQUE falla, ya estaba procesado y se ignora.

### Cambio en `usuarios`
Agregar `timezone varchar DEFAULT 'America/Argentina/Buenos_Aires'` para que los cron de emails respeten la hora local del usuario.

### NO se agrega `is_premium` a `usuarios`
La fuente de verdad es el join con `subscriptions`. Propiedad computada en el modelo SQLAlchemy:
```python
@property
def is_premium(self) -> bool:
    return self.subscription is not None and \
           self.subscription.status in ('trial', 'active')
```
**Por qué:** un boolean denormalizado se desincroniza con webhooks (ej. webhook llega tarde, usuario ya no es premium pero el bool dice que sí). Una sola fuente evita bugs caros.

## 7. Gating en backend

El gating se enforça en backend. Frontend solo muestra/oculta UI por conveniencia, pero la regla real está en endpoints.

### Helper: `Depends(require_premium)`
Dependency FastAPI análoga a `get_current_user`. Si el usuario actual no es premium → `402 Payment Required` con body `{"error": "premium_required", "reason": <string>}`.

### Endpoints afectados

**`POST /actividades`**
- Si free y `len(actividades_activas) >= 10` → 402 `{reason: "actividad_limit", current: 10, max: 10}`
- Si free y payload contiene RRULE → 402 `{reason: "recurrence_premium"}`

**`POST /reflexiones-libres` (nuevo)**
- Body: `{tipo: "sefira"|"arbol", sefira_id?: int, contenido: text}`
- Si free y ya hay 1 reflexión libre del mes calendario actual → 402 `{reason: "free_reflection_limit"}`
- El "mes" se mide por timezone del usuario

**`POST /respuestas`**
- Cooldown parametrizado: 7 días si premium, 30 días si free
- Sigue siendo backend-enforced

**`GET /evolucion/*` y `GET /respuestas`**
- Free: filtro automático de últimos 12 meses
- Premium: sin filtro

### Estado del trial
Durante `status='trial'`, el usuario se trata como premium completo. El trial NO bloquea acceso a IA, emails, ni nada de premium.

### Migración de usuarios existentes
Todos los usuarios actuales pasan automáticamente a free (no tienen row en `subscriptions`). No requiere cambios en sus datos. La migración Alembic solo crea las tablas nuevas y la columna `timezone`.

## 8. Integración Lemonsqueezy

### Flujo de checkout
1. Usuario hace click "Suscribirse" en frontend
2. Frontend → `POST /billing/checkout {plan: "monthly"|"yearly", promo_code?: string}`
3. Backend:
   - Si vino `promo_code`: validar (existe, no expiró, `uses_count < max_uses`)
   - Llamar a Lemonsqueezy API para crear Checkout Session con:
     - `variant_id` correspondiente al plan
     - `custom_data: {usuario_id, promo_code?}`
     - `subscription_trial_period_days: 7` solo si promo válido
     - `redirect_url: /billing/success`
   - Devolver `{checkout_url}` al frontend
4. Frontend redirige a `checkout_url`
5. Usuario completa el pago en hosted page de Lemonsqueezy
6. Lemonsqueezy redirige de vuelta a `/billing/success` (esto es UX puro — la fuente de verdad es el webhook)

### Webhook handler `POST /webhooks/lemonsqueezy`

**Seguridad:** validar firma HMAC con `LEMONSQUEEZY_WEBHOOK_SECRET`. Sin firma válida = 401, no procesar.

**Eventos manejados:**
- `subscription_created` → crear row en `subscriptions`. `status='trial'` si tiene `trial_ends_at` en payload, sino `status='active'`. Crear row en `email_preferences` con defaults `true`. Incrementar `uses_count` en `promo_codes` si aplica.
- `subscription_updated` → sincronizar status, plan, period_end
- `subscription_cancelled` → `status='canceled'`, `canceled_at=now()`. **Mantiene acceso hasta `current_period_end`**.
- `subscription_expired` → `status='expired'`, usuario vuelve a tratarse como free
- `subscription_payment_failed` → `status='past_due'`, mandar email al usuario avisando que la tarjeta falló
- `subscription_payment_recovered` → `status='active'`

**Idempotencia:** Lemonsqueezy puede reenviar webhooks. Usar el `event_id` del payload para deduplicar (tabla `webhook_events` con UNIQUE constraint).

### Customer portal
Endpoint `GET /billing/portal` → genera URL del portal de Lemonsqueezy con `customer.get()` y redirige al usuario. Desde ahí el usuario puede ver facturas, cambiar tarjeta, cancelar.

## 9. UI: modales y páginas premium

### Página `/premium`
- **Hero**: "Profundizá en vos. Acá están las herramientas." (copy aspiracional, no agresivo)
- **Tabla comparativa Free vs Premium** prominente, side-by-side, con checkmarks
- **Toggle Mensual / Anual** (anual destacado con "-2 meses gratis")
- **CTA principal**: "Suscribirse" → `POST /billing/checkout`
- **Banner condicional**: si llega con `?promo=XYZ` válido, mostrar "7 días gratis con este enlace"
- **FAQ** corta (4-5 preguntas: ¿cómo cancelo?, ¿qué pasa con mis datos si cancelo?, ¿cuándo se cobra?, ¿reembolsos?)
- **Footer** con links a términos y privacidad

### Componente `<PremiumGate reason="..." />`
Modal reusable que se abre desde cualquier gate. Estructura:
1. Mensaje contextual según `reason`:
   - `actividad_limit`: "Alcanzaste el límite de 10 actividades en tu cuenta gratuita"
   - `recurrence_premium`: "Las actividades recurrentes son parte de Premium"
   - `free_reflection_limit`: "Ya hiciste tu reflexión libre del mes. Premium te da reflexión sin límite"
   - `cooldown`: "Premium acorta el cooldown de 30 a 7 días"
   - `historico`: "Tu historial completo está disponible en Premium"
2. Mini-resumen de Premium (3-4 bullets, no la página entera)
3. Botón primario "Ver planes" → navega a `/premium`
4. Botón secundario "Ahora no" → cierra

### Gancho de conversión: reflexión libre post-escritura
1. Usuario hace click "Nueva reflexión libre" — **no hay gate al abrir** (la fricción mata el engagement)
2. Escribe su reflexión completa en el editor
3. Hace click "Guardar"
4. Backend responde 402 si ya gastó la del mes
5. Frontend muestra `<PremiumGate reason="free_reflection_limit" />` **sin perder el contenido escrito** (queda en draft local, se restaura al volver)
6. Si convierte y vuelve, el draft se guarda automático

### Sección "Mi Cuenta → Suscripción"
Nueva subsección en cuenta. Muestra:
- Si free: "Sos usuario Free" + CTA "Ver Premium"
- Si premium o trial: tipo de plan, próxima fecha de cobro, botón "Gestionar suscripción" → portal Lemonsqueezy
- 4 toggles de preferencias de email (independientes de cancelación)

## 10. Sistema de emails

### Stack
**Resend** como proveedor.
- $0 hasta 3k emails/mes, $20/mes hasta 50k
- React Email para templates (mismas convenciones que el frontend)
- Manejo automático de bounces/complaints

### Templates (React Email)
- `WeeklySummaryEmail`: top sefirot de la semana del usuario, actividades, reflexiones, insight de IA, link al app
- `MonthlySummaryEmail`: evolución del mes con sparkline por sefirá, comparativa con mes anterior, insight de IA más largo
- `ImbalanceAlertEmail`: corto. "Hace 14 días que [Sefirá] no recibe atención"
- `ReflectionReminderEmail`: pregunta guía disponible, fragmento de su última reflexión para reconectar

**Footer común:** link "Gestionar preferencias" + link "Cancelar suscripción".
**Tono:** acorde al diseño Templo Digital — sobrio, no marketinero, gold-on-black.

### Jobs programados (APScheduler)
APScheduler dentro del proceso FastAPI. Suficiente para los volúmenes esperados de un MVP/early-stage. Si en el futuro el volumen supera ~1000 usuarios premium activos o aparecen problemas de reliability con restarts, considerar migrar a Celery + Redis o cron externo del sistema (fuera de scope de este spec).

- `cron_weekly_summary`: domingos 09:00 en timezone del usuario
- `cron_monthly_summary`: día 1 de cada mes 09:00 en timezone del usuario
- `cron_imbalance_check`: cada noche 02:00 UTC. Para cada premium, evalúa si alguna sefirá tiene >14 días sin actividad o reflexión. Si sí, manda alerta (con dedupe — no manda 2 alertas por la misma sefirá en menos de 7 días)
- `cron_reflection_reminder`: cada noche 02:00 UTC. Manda solo si el usuario no entró en >=7 días Y hay preguntas guía disponibles

### Generación de contenido con IA
Contrato con el motor de IA (rama paralela):
- Endpoint interno `POST /ai/insight`
- Input: `{usuario_id, tipo: "weekly"|"monthly"|"imbalance"|"reminder", periodo_start, periodo_end}`
- Output: `{insight: string}` (1-3 párrafos en español, tono cabalístico, máx 800 chars)

**Fallback (Fase 1, sin IA):** si el endpoint IA aún no responde, los templates usan plantillas con datos crudos ("Esta semana sumaste 5 actividades en Tiferet, 3 en Jesed"). Funcional pero no es la promesa completa.

### Idempotencia
Cada email tiene `idempotency_key = {usuario_id}-{tipo}-{periodo}`. UNIQUE constraint en `email_log`. Si el cron corre dos veces, no se envía duplicado.

### Tracking y deliverability
- Webhook de Resend → registramos `delivered`, `bounced`, `complained` en `email_log`
- Si un usuario acumula 3 bounces (hard bounces), pausamos envíos automáticamente y marcamos en su cuenta

## 11. Rollout en 2 fases

### Fase 1 — Infraestructura premium (esta rama)
**Salida:** premium se puede activar pero NO se lanza al público. Funcionalmente entrega "sin topes + emails con datos crudos". No es la promesa completa.

Incluye:
- Migración: 3 tablas nuevas + columna `timezone` + tabla `webhook_events`
- Endpoints de gating (`require_premium`, conteos, `/billing/*`)
- Integración Lemonsqueezy (checkout + webhooks + portal)
- UI: `/premium` + `PremiumGate` + sección "Mi Cuenta → Suscripción"
- Modal de paywall post-escritura en reflexión libre
- Sistema de emails con templates y plantillas genéricas (sin IA generativa)
- Cron jobs implementados y operativos, pero `/premium` aún no aparece en la navegación pública: solo se accede con URL directa + código promo. Esto permite probar end-to-end con un grupo cerrado de usuarios reales antes del launch público.

### Fase 2 — Plug del motor de IA (cuando la rama paralela esté lista)
- Endpoint `POST /ai/insight` reemplaza plantillas genéricas
- Devoluciones personalizadas en reflexiones (libres y de pregunta guía)
- Emails toman insights de IA
- **Launch público:** campaña con códigos promo activos, página `/premium` en navegación

## 12. Configuración necesaria fuera del código

- Cuenta de **Lemonsqueezy** + producto + 2 variantes + webhook configurado
- Cuenta de **Resend** + dominio verificado (DKIM + SPF + DMARC)
- Variables de entorno en backend:
  - `LEMONSQUEEZY_API_KEY`
  - `LEMONSQUEEZY_STORE_ID`
  - `LEMONSQUEEZY_VARIANT_MONTHLY`
  - `LEMONSQUEEZY_VARIANT_YEARLY`
  - `LEMONSQUEEZY_WEBHOOK_SECRET`
  - `RESEND_API_KEY`
  - `FROM_EMAIL` (ej. "Kabbalah Space <hola@kabbalahspace.app>")
  - `FRONTEND_URL` (ya existe, se reutiliza)

## 13. Tests críticos

- **Webhook handler**: cada evento de Lemonsqueezy con payload real (de docs) — `subscription_created`, `_updated`, `_cancelled`, `_expired`, `payment_failed`, `payment_recovered`
- **Webhook security**: payload con firma inválida → 401
- **Webhook idempotency**: mismo `event_id` 2 veces → procesa 1 sola vez
- **Gating actividades**: free user con 10 actividades → 402 al postear la 11ma; con RRULE → 402 inmediato
- **Gating reflexión libre**: 1 free/mes — la 2da del mismo mes calendario en timezone del usuario → 402
- **Gating cooldown**: free 30d / premium 7d / trial 7d
- **Gating histórico**: free recibe 12 meses, premium recibe todo
- **Promo codes**: válido, expirado, max_uses excedido, inválido
- **Email idempotency**: cron 2 veces → 1 solo envío por idempotency_key
- **Cancelación**: usuario cancela, `current_period_end` futuro → sigue siendo premium hasta esa fecha; después de esa fecha → free

## 14. Decisiones registradas

| Decisión | Razón |
|---|---|
| Un solo tier (no Lite + Pro) | Simplicidad de comunicación. Dos tiers confunde al usuario y complica el copy. |
| Lemonsqueezy en vez de Stripe directo | MoR ahorra el infierno de impuestos internacionales. Vale la diferencia de comisión. |
| Trial solo con código promo | Trial como activo de marketing controlado, no default. Quien llega orgánico paga directo. |
| Sync gcal en Free | Funcionalidad ya construida + funciona como gancho de adopción. |
| Recurrencias en Premium | Cualquier RRULE = premium. Más simple de comunicar que "contar instancias". |
| Histórico 12 meses Free | "No se cobra por ver el propio historial" — generosidad que mantiene confianza. |
| Cooldown 7d Premium / 30d Free | Premium acelera la práctica para quien lo necesita; free mantiene la disciplina espaciada. |
| No `is_premium` denormalizado en usuario | Fuente única de verdad evita desincronización con webhooks. |
| APScheduler para Fase 1 | Más simple que Celery. Migrar si crece el volumen. |
| Gating siempre backend-enforced | Frontend puede omitirse con DevTools. Solo backend es regla real. |

## 15. Ganancia y gastos estimados

Estas son **estimaciones**, no proyecciones. Basadas en pricing público de cada provider a 2026-05-21. La realidad puede variar — sirven para dimensionar decisiones, no para reportes financieros.

### 15.1 Costos fijos mensuales (independientes del nº de usuarios)

| Ítem | Monto USD/mes | Notas |
|---|---|---|
| Hosting backend (Railway / Render / Fly) | $5 – $20 | Plan starter alcanza para hasta ~500 usuarios activos |
| Postgres (managed) | $5 – $20 | Neon o Supabase tienen tier free, pago empieza cuando crece |
| Dominio | $1 | $12/año amortizado |
| Resend (emails) | $0 → $20 | Free hasta 3k emails/mes; plan $20 hasta 50k |
| Lemonsqueezy fee fijo | $0 | No tiene costo fijo, solo % por transacción |
| **Total estimado** | **~$15 – $60** | Depende del stage (early: $15, growth: $60) |

### 15.2 Costos variables por usuario premium activo

| Ítem | Costo / usuario / mes | Cómo se calcula |
|---|---|---|
| Lemonsqueezy (mensual) | ~$0.83 | 5% de $6.58 + $0.50 fee transaccional |
| Lemonsqueezy (anual amortizado) | ~$0.32 | (5% de $65.80 + $0.50) / 12 |
| LLM (Claude Sonnet) | ~$0.20 – $0.50 | ~8 reflexiones + 4 semanales + 1 mensual + alertas. Usando GPT-4o-mini bajaría 10x |
| Email envío (marginal) | ~$0.04 | Solo cuenta cuando se supera el tier free de Resend |

**Costo total promedio por usuario:**
- Mensual: ~$1.17 ($0.83 + $0.30 LLM + $0.04 email)
- Anual: ~$0.66 ($0.32 + $0.30 LLM + $0.04 email)

### 15.3 Unit economics (revenue − costo por usuario)

| Plan | Precio mensual efectivo | Costo total | **Margen neto / usuario / mes** |
|---|---|---|---|
| Mensual ($6.58) | $6.58 | $1.17 | **$5.41** (82% margen) |
| Anual ($65.80 → $5.48/mes) | $5.48 | $0.66 | **$4.82** (88% margen) |

El anual tiene precio efectivo menor pero **mejor margen** porque la comisión de Lemonsqueezy amortizada es mucho más baja (1 transacción al año en vez de 12). Además: cash flow up-front y churn anual mucho menor que mensual.

### 15.4 Escenarios de revenue neto

Asumiendo un mix realista de 70% suscriptores mensuales y 30% anuales:

| Escenario | Premium activos | Revenue mensual bruto | Costos variables | Costos fijos | **Revenue neto mensual** | Anual |
|---|---|---|---|---|---|---|
| **Conservador** | 50 (35m + 15a) | $312.50 | $50.85 | $30 | **~$232** | ~$2,780 |
| **Moderado** | 200 (140m + 60a) | $1,250 | $203.40 | $50 | **~$997** | ~$12,000 |
| **Optimista** | 1,000 (700m + 300a) | $6,250 | $1,017 | $100 | **~$5,133** | ~$61,600 |

### 15.5 Break-even

Cuántos suscriptores premium hacen falta para cubrir los costos fijos del proyecto:

- Costos fijos early-stage (~$30/mes): **~6 usuarios mensuales** o **~7 anuales**
- Costos fijos growth-stage (~$60/mes): **~12 usuarios mensuales** o **~13 anuales**

El break-even es alcanzable con un grupo pequeño de usuarios reales. Esto importa porque significa que la app puede sostenerse económicamente desde muy temprano, sin presión para optimizar conversión agresivamente.

### 15.6 Costos durante desarrollo (pre-launch)

Mientras no haya usuarios premium reales, casi todo está en tier free:
- Hosting + DB: ~$0 – $10 (tiers free de Railway/Render/Neon)
- Lemonsqueezy: $0 (sin transacciones, sin costo)
- Resend: $0 (testing con tier free)
- LLM: variable según testing, $5 – $20 mientras se desarrolla la IA real
- Dominio: ~$1

**Total durante desarrollo:** ~$10 – $35/mes.

### 15.7 Costos no contemplados

Cosas que pueden aparecer y no están en este cálculo:
- **Soporte al cliente**: si suben los volúmenes, podría hacer falta un servicio tipo Crisp o Intercom. Tier free alcanza al inicio.
- **Monitoring / observabilidad**: Sentry tiene free tier suficiente para empezar.
- **Marketing / ads**: completamente discrecional, no es parte del costo de operar.
- **Asesoría legal / contable inicial**: ~$200-500 una sola vez para revisar Términos y Condiciones de premium.
- **Refunds / chargebacks**: ~1-2% del revenue, lo absorbe Lemonsqueezy.
- **Si el motor IA pasa de Sonnet a Opus** o aumenta el uso por usuario: el costo LLM puede subir 3-5x. Variable más sensible del modelo.

### 15.8 Sensibilidad: ¿qué pasa si el costo LLM se dispara?

El LLM es la variable más volátil. Stress test:

| Costo LLM por usuario/mes | Margen mensual | Margen anual |
|---|---|---|
| $0.30 (base) | $5.41 | $4.82 |
| $1.00 (uso intenso) | $4.71 | $4.12 |
| $2.00 (Opus o uso muy alto) | $3.71 | $3.12 |
| $5.00 (descontrolado) | $0.71 | $0.12 |

Mientras el costo LLM por usuario se mantenga bajo $3/mes, el modelo es sostenible. Si trepa, conviene revisar:
- Cachear devoluciones similares
- Bajar a modelo más barato (GPT-4o-mini o Haiku) para alertas no críticas
- Limitar generaciones por usuario/mes (premium "fair use")

---

## Próximo paso

Plan de implementación detallado en `docs/superpowers/plans/2026-05-21-sistema-premium.md` (a crear con writing-plans).
