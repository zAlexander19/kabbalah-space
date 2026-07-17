# Diseño — Activación del Árbol (info, navegación, correos, indicador)

**Fecha:** 2026-07-16
**Rama:** `feat/activacion-arbol` (desde `feat/gcal-sync`)
**Estado:** aprobado para escribir plan

## Contexto

Tras una semana de uso en producción (kabbalahspace.com), se busca mejorar la
activación y el completado del Árbol de la Vida (módulo Espejo Cognitivo). Cuatro
cambios independientes, todos apuntando a que el usuario entienda mejor cada
dimensión y complete el árbol:

1. Info ampliada de cada sefirá antes de las preguntas.
2. Navegación libre entre las preguntas de la dimensión (+ ver respondidas/cooldown).
3. Tres correos de activación según en qué etapa del embudo esté el usuario.
4. Indicador visual sobre el árbol de qué dimensiones faltan.

**Definición transversal — "completar/llenar una dimensión":** el usuario respondió
las preguntas guía de esa sefirá y la IA la clasificó (existe un `RegistroDiario`
con `puntuacion_ia`). Sumar actividad en el calendario es el paso siguiente, no
parte de "completar".

---

## Feature 1 — Info ampliada de cada sefirá

### Objetivo
Al abrir una sefirá, mostrar contenido rico sobre la dimensión **arriba** de las
preguntas guía. Hoy solo se muestra una `description` de una línea
(`SEFIROT` en `frontend/src/App.tsx`, renderizada en `SefiraHeader`).

### Enfoque
Archivo de contenido nuevo y aislado: **`frontend/src/espejo/sefirotContent.ts`**.
Registro tipado por id de sefirá (los 10 ids ya existentes: `keter`, `jojma`,
`bina`, `jesed`, `gevura`, `tiferet`, `netzaj`, `hod`, `yesod`, `maljut`).

Se mantiene **separado de `App.tsx`** (que solo tiene coordenadas de layout) para
que sea un único archivo fácil de reemplazar cuando el usuario entregue sus textos
definitivos.

```ts
// frontend/src/espejo/sefirotContent.ts
export type SefiraContenido = {
  esencia: string;         // 2-3 frases que expanden la línea actual
  palabrasClave: string[]; // ej. ["Voluntad", "Vacío", "Origen"]
  queObserva: string;      // párrafo: qué invita a mirar de tu vida
};
export const SEFIROT_CONTENIDO: Record<string, SefiraContenido> = { /* 10 entradas */ };
```

### Componentes
- Nuevo **`SefiraInfoCard`** (`frontend/src/espejo/components/SefiraInfoCard.tsx`):
  bloque colapsable "Sobre esta dimensión", **abierto por defecto**. Muestra
  `esencia`, chips de `palabrasClave` y `queObserva`.
- Se inserta en el componente compartido de detalle, de modo que aparezca tanto en
  desktop (`SefiraDetailPanel`) como en mobile (`SefiraDetailMobileSheet`), entre
  el `SefiraHeader` y la sección "Preguntas guía".
- Lookup por `resumen.sefira_id`; si no hay entrada en `SEFIROT_CONTENIDO`
  (defensa), no se renderiza la card (fallback a la `description` corta actual).

### Contenido inicial
Se redactan las 10 entradas ahora (revisables por el usuario). Estilo on-brand,
en español rioplatense, alineado al tono actual de las descripciones.

---

## Feature 2 — Navegación libre por las preguntas

### Objetivo
Hoy `QuestionCarousel` (a) filtra solo preguntas no bloqueadas y (b) obliga a
responder la actual para avanzar. Se quiere: moverse libre por **todas** las
preguntas de la dimensión y ver las ya respondidas / en cooldown en modo lectura.
(No se navega entre dimensiones.)

### Cambios en `QuestionCarousel.tsx`
- **Universo de items = todas las preguntas** de la dimensión (no solo
  `!p.bloqueada`). Se conserva el orden estable.
- **Anterior/Siguiente siempre habilitados** dentro de límites — se elimina el gate
  `canAdvance` sobre la navegación (antes exigía texto para pasar de card).
- **Modo lectura** para preguntas respondidas o en cooldown (`p.bloqueada` o con
  `p.ultima_respuesta`): se muestra la pregunta + `ultima_respuesta` + chip
  "respondida · vuelve en {dias_restantes} días", con textarea deshabilitado/oculto.
  Preguntas disponibles (`!p.bloqueada`): textarea editable como hoy.
- **Guardar desacoplado de "última card":** el botón "Guardar respuestas" aparece
  cuando hay ≥1 respuesta nueva no vacía en `answers` (para preguntas disponibles),
  sin importar el índice actual. En cards no-última con pregunta disponible se
  mantiene "Siguiente"; el guardado en lote + evaluación IA + gated-save quedan
  igual que hoy (siguen en `SefiraDetailPanel.performBatchSave`).
- **Contador**: "Pregunta X de N" sobre el total; se marca cuántas están
  respondidas.

### Cambios en `SefiraDetailPanel.tsx`
- La rama actual `hasUnblocked ? <QuestionCarousel/> : <AllAnsweredEmptyState/>`
  se simplifica: **el carrusel se renderiza siempre** que haya ≥1 pregunta (maneja
  internamente el estado mixto disponible/lectura). `AllAnsweredEmptyState` puede
  retirarse o quedar como fallback cuando el carrusel no aplique.
- Se preserva `AnswersGridModal` ("Ver mis respuestas") sin cambios de contrato.

### Riesgos / cuidado
- El draft persistido (`useDraftPersistence`) sigue namespaced por sefirá; solo
  guarda respuestas de preguntas disponibles. Verificar que el `initialIndex` y el
  reset por `itemKey` sigan coherentes al incluir bloqueadas en el universo.

---

## Feature 3 — Correos de activación (embudo)

### Etapas (mutuamente excluyentes por precedencia)

| Etapa | Clave | Condición | CTA |
|---|---|---|---|
| **A** | `activation_no_start` | 0 filas `RespuestaPregunta` del usuario | Responder tu primera dimensión |
| **B** | `activation_tree_incomplete` | ≥1 respuesta, pero < 10 sefirot clasificadas | Terminar de clasificar el árbol |
| **C** | `activation_no_activity` | árbol completo (10/10 clasificadas) y 0 actividades | Registrar actividades |

"Clasificada" = existe `RegistroDiario` con `puntuacion_ia` para esa sefirá del
usuario (misma señal que Feature 4).

### Precedencia (aprobada): A → B → C
Se evalúa por usuario y se envía **como mucho un correo de activación por ciclo**:
- 0 preguntas → A.
- si no → si < 10 clasificadas → B.
- si no (10/10 clasificadas) → si 0 actividades → C.
- si no → nada.

Esto evita que un usuario reciba dos correos el mismo día y difiere el nudge de
actividad hasta que el árbol esté completo.

### Ritmo
- Primer envío a los **2 días** de quedar trabado en la etapa.
- Reintento cada ~3 días mientras siga trabado.
- **Tope de 3 envíos por etapa**, luego para.
- Implementación del intento/tope: contar `EmailLog` `sent` del usuario para ese
  `email_type`; si ≥ 3 → skip; si el último envío fue hace < ~3 días → skip; si no,
  enviar con idempotency `f"{uid}-{email_type}-{n}"` donde `n = enviados_previos+1`.
- Base temporal de "trabado":
  - A: `days_since_signup >= 2`.
  - B/C: sin nueva `RespuestaPregunta` (B) / sin nueva actividad (C) en los últimos
    2 días **y** ya pasaron 2 días desde signup. (El espaciado real entre correos
    lo garantiza la regla de "último envío hace < 3 días".)

### Alcance y gating (free + premium, con toggle propio)
Requiere que **todo usuario** tenga fila `EmailPreferences` (hoy solo se crea en el
webhook de suscripción → premium). Cambios:

- **Migración Alembic:** nueva columna `activation_nudges BOOLEAN NOT NULL DEFAULT
  true` en `email_preferences`.
- **Helper `get_or_create_email_preferences(db, usuario_id)`** (en `billing` o
  `emails`), usado en:
  - creación de usuario Google (`auth.py`, tras `db.add(user)`).
  - `GET`/`PUT /email/preferences` (lazy-create → los free existentes obtienen fila
    al entrar a `/cuenta`; se elimina el 404 para usuarios sin fila).
  - el sender de activación (get-or-create antes de chequear la preferencia).
- **Hard-bounce auto-pause** (`emails/router.py`): sumar `activation_nudges=False`
  al set de flags que se apagan tras 3 bounces.

### Piezas backend
- Templates: `emails/templates/activation_no_start.py`,
  `activation_tree_incomplete.py`, `activation_no_activity.py` (render funcs con la
  estética de `templates/base.py`, cada uno con su CTA a la URL del árbol / calendario).
- Sender: `send_activation_no_start`, `send_activation_tree_incomplete`,
  `send_activation_no_activity` en `emails/sender.py`. Gateados por
  `activation_nudges`. Idempotencia + tope como arriba.
- Scheduler: `nightly_activation_nudge_tick` + `_activation_for_now(db, now)` en
  `scheduler/jobs.py`. Itera **todos** los usuarios, calcula la etapa por
  precedencia, aplica ritmo/tope, llama al sender correspondiente. Registrar el job
  en `scheduler/scheduler.py` (nightly).

### Endpoints/DTO
- `emails/router.py`: `EmailPreferencesOut` y `EmailPreferencesPatch` incluyen
  `activation_nudges`.

### Frontend
- `frontend/src/premium/types.ts`: agregar `activation_nudges` a `EmailPreferences`
  y `EmailPreferenceKey`.
- `frontend/src/cuenta/EmailPreferencesSection.tsx`: nuevo toggle "Recordatorios de
  activación" ("Mientras completás el árbol, te recordamos por dónde seguir").
  Asegurar que la sección se muestre a usuarios free (antes 404 → ahora devuelve
  fila por lazy-create).

### Tests (espejando `backend/tests/emails/`)
- Condición de cada etapa y **precedencia** (usuario en B no recibe A ni C; C solo
  con árbol completo).
- Tope de 3 envíos y espaciado.
- Idempotencia (`EmailLog` UNIQUE).
- Gating por `activation_nudges` (off → no envía).
- `get_or_create_email_preferences` para free y premium.

---

## Feature 4 — Indicador visual sobre el árbol

### Objetivo
Que el usuario vea qué dimensiones faltan completar, para motivar el llenado.
Ubicación: **sobre el árbol mismo** (decisión tomada).

### Señal de datos
Agregar campo **`clasificada: boolean`** a `SefiraResumen` en `GET /espejo/resumen`
(`main.py`): `clasificada = len(ia_scores) > 0` (ya se computa `ia_scores` en el
loop). Reflejar el campo en `frontend/src/espejo/types.ts`.

### UI
- **Contador de progreso** "X de 10 dimensiones exploradas" + barra fina, en la
  barra superior de `EspejoModule` (donde hoy está "Nueva reflexión libre"). Estado
  celebratorio sutil al llegar a 10/10.
- **Marcas en el árbol** (`SefirotInteractiveTree`): recibe el set de ids
  clasificados (derivado de `summary`). Sefirot **sin clasificar** → marca sutil
  on-brand (anillo tenue / pulso suave / atenuado); clasificadas → "encendidas".
  Nada estridente; respeta el look glass/ámbar existente.
- **Anónimos** (sin `summary`): estado neutro, sin marcas ni contador (o contador
  0/10 discreto). No romper el flujo de intro.

### Data flow
`EspejoModule` ya carga `summary` vía `useEspejoSummary`. Se deriva
`clasificadasSet` + `count` y se pasan como props a `SefirotInteractiveTree` y al
contador. Sin llamadas nuevas más allá del campo agregado al resumen.

---

## Orden de implementación

1. **F3 backend** (correos): migración + helper prefs + templates + sender +
   scheduler + tests. Es lo más independiente y con más cobertura.
2. **F3 frontend**: toggle en `/cuenta` + types.
3. **F1**: `sefirotContent.ts` + `SefiraInfoCard` + inserción en detalle.
4. **F2**: refactor de `QuestionCarousel` + simplificación de `SefiraDetailPanel`.
5. **F4**: campo `clasificada` en resumen + contador + marcas en el árbol.

## No-objetivos (YAGNI)
- No se editan contenidos de sefirot desde el panel admin/DB (queda en archivo TS).
- No se navega entre dimensiones desde el panel de una sefirá.
- No se agrega opt-out por-etapa: un solo toggle "activación" cubre los 3 correos.
- No se cambia la lógica de cooldown de 30 días ni el guardado en lote.

## Verificación
- Backend: `pytest` (suite de emails + nuevos tests de activación).
- Frontend: build + verificación manual del carrusel (navegación libre, lectura de
  respondidas), la info card, el toggle y el indicador del árbol.
- `graphify update .` tras los cambios para mantener el grafo al día.
