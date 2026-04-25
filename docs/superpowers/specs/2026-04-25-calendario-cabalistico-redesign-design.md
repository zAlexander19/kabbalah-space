# Rediseño del Calendario Cabalístico — Spec

**Fecha:** 2026-04-25
**Alcance:** Rediseño integral del módulo `CalendarModule` (calendario + árbol Sefirótico + panel lateral) con estética "Templo digital" y sistema de animaciones basado en Framer Motion.

---

## 1. Objetivo y dirección

Transformar el módulo de calendario actual (funcional pero visualmente plano y sin orquestación de animaciones) en una experiencia profesional y elegante, inspirada en la metáfora de un "templo digital": minimalismo místico, mucho espacio negativo, dorado ámbar como acento contenido, animaciones lentas y respirantes que mantengan el flujo del usuario.

### Decisiones tomadas

| Eje | Decisión |
|---|---|
| Estética | Templo digital (minimalista místico) |
| Alcance | Módulo completo: calendario + árbol Sefirótico + panel lateral |
| Animaciones | Framer Motion (full) |
| Intensidad | Vivas pero contenidas — micro-respiración ambiental + transiciones de estado |
| Calendario base | Custom (sustituye `react-big-calendar`) |
| Layout | 7 columnas calendario / 5 columnas árbol (mantiene proporción actual) |
| Transición vistas | Morph dirigido (zoom-in/zoom-out tipo iOS Calendar) |

---

## 2. Arquitectura

### 2.1 Estado actual

`frontend/src/CalendarModule.tsx` — 829 líneas, monolítico. Mezcla: estado, fetching, calendario (vía `react-big-calendar`), árbol Sefirótico, panel lateral, formulario. Difícil de animar y de mantener.

### 2.2 Estructura propuesta

```
frontend/src/calendar/
  CalendarModule.tsx        — orquestador (~150 líneas)
  hooks/
    useActivities.ts        — fetch actividades + volumen
    useCalendarRange.ts     — visibleStart/end + navegación
  views/
    WeekView.tsx
    MonthView.tsx
    YearView.tsx
    ViewMorph.tsx           — wrapper de transición entre vistas
  components/
    CalendarToolbar.tsx
    CalendarEvent.tsx
    SefirotTree.tsx
    SefirotLegend.tsx
    ActivityPanel.tsx
    ActivityForm.tsx
  motion/
    transitions.ts          — variants reutilizables
    breath.ts               — variants de respiración ambiental
  tokens.ts                 — design tokens (color, motion, spacing)
```

El archivo viejo `CalendarModule.tsx` se elimina al final de la migración. `App.tsx` importa desde `./calendar`.

### 2.3 Sistema de tokens — `calendar/tokens.ts`

```ts
// Color
export const ink = {
  void:      '#0e1014',  // fondo absoluto
  obsidian:  '#15181d',  // paneles
  basalt:    '#1b1f25',  // cards internas
  ash:       '#252a32',  // hovers/borders activos
  bone:      'rgba(245,243,235,0.92)',
  ember:     '#e9c349',
  emberSoft: 'rgba(233,195,73,0.18)',
};

// Motion
export const motion = {
  swift:   { duration: 0.22, ease: [0.22, 1, 0.36, 1] },         // micro-interacciones
  flowing: { duration: 0.6,  ease: [0.16, 1, 0.3, 1] },          // transiciones de estado
  unveil:  { duration: 0.9,  ease: [0.16, 1, 0.3, 1] },          // entrada de eventos
  breath:  { duration: 8,    ease: 'easeInOut',
             repeat: Infinity, repeatType: 'mirror' as const },
  stagger: 0.04,
};

export const space = { xs: 4, sm: 8, md: 13, lg: 21, xl: 34, '2xl': 55 };
```

Toda animación nueva consume del objeto `motion` para garantizar coherencia rítmica.

### 2.4 Dependencia nueva

- `framer-motion` (v11+). Se añade a `frontend/package.json`.

---

## 3. Calendario custom

### 3.1 Vista Semana — `views/WeekView.tsx`

- **Grid CSS**: 1 columna gutter (60px) + 7 columnas día (1fr cada una). 24 filas horarias, `min-height: 56px` por slot.
- **Step inicial**: 60 minutos (igual al actual). Estructura permite migrar a 30 minutos en el futuro sin reescritura.
- **Header de día**: día abreviado uppercase tracking ancho + número en círculo. Día actual con anillo dorado de 1px que respira (`breath`, opacity 0.5↔1).
- **Línea del ahora**: `<motion.div>` horizontal posicionada por `top: <hora-actual>%`, opacity 0.6, color `ink.ember`, actualizada cada 60s con `motion.flowing`.
- **Día sábado**: gradiente vertical ámbar→transparente sobre la columna (opacity 0.04). Marca conceptual de Shabat.

### 3.2 Vista Mes — `views/MonthView.tsx`

- **Grid 7×6**: 6 filas siempre (evita saltos al cambiar mes; rellena con días del mes anterior/siguiente con `opacity: 0.35`).
- **Celda**: número del día arriba-izquierda + hasta 3 chips de eventos + indicador `+N más` si hay más.
- **Día actual**: número con anillo dorado breathing.

### 3.3 Vista Año — `views/YearView.tsx`

- **Grid 3×4** de mini-cards mensuales.
- Cada card: nombre del mes en serif, mini-grid 7×6 no-interactiva con puntos dorados donde hay actividades, total de actividades en el pie.
- Hover: lift `y: -2` + sombra crece + glow ámbar tenue.
- Click → morph a `MonthView` en ese mes.

### 3.4 Eventos (chips) — `components/CalendarEvent.tsx`

| Vista | Renderizado |
|---|---|
| Semana | Bloque vertical, altura = duración × pixelsPorHora, borde-izquierdo 2px color sólido, fondo 20% opacity. Hover: borde 3px + fondo +10%. |
| Mes | Chip horizontal de 1 línea, truncado. |

- **`layoutId = "event-${activity.id}"`** → al cambiar de vista, el chip "vuela" a su nueva posición (Framer layout animations).
- **Entrada**: `staggerChildren: motion.stagger`. Cada chip: `opacity 0→1, y 8→0` en `motion.unveil`.
- Color base: primera Sefirá del array `activity.sefirot`.

### 3.5 Toolbar — `components/CalendarToolbar.tsx`

- Título serif grande (mes y año o rango de semana).
- Sub-label uppercase tracking ancho.
- Flechas circulares con hover desplazado (`x: ±2`).
- **Selector Semana/Mes/Año**: indicador deslizante con `layoutId="view-pill"` — el fondo dorado se mueve a la opción activa con `motion.flowing`. Animación insignia del componente.

### 3.6 Morph dirigido entre vistas — `views/ViewMorph.tsx`

Wrapper que aloja la vista activa dentro de `<AnimatePresence mode="wait">`. La dirección (`in`/`out`) se infiere del cambio de `mapFilter`.

| Transición | Comportamiento |
|---|---|
| Año → Mes | Tarjeta del mes se expande a ocupar el viewport; las otras 11 hacen fade-out con stagger inverso; cross-fade a `MonthView` real. |
| Mes → Semana | Fila de la semana clickeada se expande verticalmente al 100%; las otras 5 colapsan (`scaleY 1→0`); cross-fade a `WeekView`. |
| Semana → Mes | Inverso del anterior (zoom-out vertical). |
| Mes → Año | Inverso del primero (la vista se "encoge" al lugar correspondiente en la grid de meses). |

Duración: `motion.flowing` (600ms). Cross-fade ocurre a mitad de animación (~300ms).

### 3.7 Estados de carga y vacío

- **Loading**: vista actual con `opacity: 0.7` + barra de shimmer dorado horizontal (gradiente que recorre la grilla de izquierda a derecha en 1.5s, ciclo continuo mientras dura la carga). Sin spinners.
- **Vacío**: mensaje centrado vertical "El templo descansa. Crea tu primera actividad." con glow ámbar pulsante en el botón "Crear actividad".

---

## 4. Árbol Sefirótico — `components/SefirotTree.tsx`

### 4.1 Render

- **SVG nativo** en vez de divs absolutos. Permite `<feGaussianBlur>` para halos suaves, gradientes radiales en cada nodo, y filtros compositados.
- **Líneas de conexión**: gradiente lineal con opacity base 0.18. Cada línea tiene un shimmer dorado que la recorre cada ~6s con `delay` aleatorio entre líneas.
- **Nodos**: círculo con gradiente radial (centro luminoso → borde oscuro) en el color de la sefirá. Halo externo `<feGaussianBlur stdDeviation="6">` cuya intensidad escala con `actividades_total`.

### 4.2 Tamaño según volumen

- **Hoy**: `52 + (count/max) * 38` (lineal).
- **Nuevo**: `48 + sqrt(count/max) * 44` (raíz cuadrada). Las sefirot inactivas no se ven aplastadas; las muy activas no eclipsan a las demás.

### 4.3 Respiración ambiental — `motion/breath.ts`

```ts
breathScale: { scale: [1, 1.025, 1] }      // 8s, mirror
breathHalo:  { opacity: [0.4, 0.7, 0.4] }  // 8s, desfasado 2s
```

Cada nodo recibe un `delay` aleatorio (0–2s) al montar, asignado una sola vez. No respiran al unísono.

### 4.4 Filtrado por sefirá

Click en nodo → `filterSefira` cambia. Efectos sincronizados:

- **Sefirá activa**: `scale 1.12` + halo dorado pulsante (`breath` acelerado: 3s, opacity 0.6→1).
- **Sefirot inactivas**: `opacity 0.25, scale 0.95` en `motion.flowing`.
- **Líneas de conexión**: las que tocan la sefirá activa mantienen opacity; las demás bajan a 0.05.
- **Calendario**: chips no relacionados hacen fade-out en cascada inversa con `AnimatePresence mode="popLayout"`.

### 4.5 Tooltip al hover

Card flotante con: nombre, descripción, horas totales, actividades. Aparece con `opacity 0→1, y 4→0` en `motion.swift`.

### 4.6 Leyenda inferior — `components/SefirotLegend.tsx`

Reemplaza el grid 2-row scrollable horizontal actual por una **lista vertical compacta** debajo del árbol, ordenada por `actividades_total` descendente. Cada fila:

- Punto de color de la sefirá.
- Nombre.
- Barra de progreso fina (sobre `maxActivityCount`).
- Contadores: `{count} act. / {hours} h`.

Sin scroll horizontal. Click en fila = mismo filtrado que click en nodo. Nodo y fila correspondiente comparten estado visual sincronizado (cuando una sefirá está filtrada, el punto de su fila pulsa con el mismo `breath` acelerado que su nodo en el árbol). No se usa `layoutId` aquí porque ambos elementos son visibles simultáneamente; basta con `animate` condicionado al estado `filterSefira`.

---

## 5. Panel lateral y formulario — `components/ActivityPanel.tsx`, `components/ActivityForm.tsx`

### 5.1 Entrada/salida del panel

- **Entrada**: spring de Framer Motion (`type: 'spring', damping: 28, stiffness: 220`). Sensación de "se posa", no de "desliza".
- **Salida**: `motion.flowing` (más rápida que la entrada — regla de UX para no entorpecer el cierre).
- **Overlay**: `backdrop-blur` intensifica de 0px → 12px durante la entrada (200ms desfase). No aparece de golpe.

### 5.2 Header del panel

- Divisor tenue dorado (1px, opacity 0.15) en lugar del border-stone actual.
- Título en serif grande, coherente con el resto del módulo.
- Botón cerrar: ícono `X` de `lucide-react` (ya está instalado) que rota 90° en hover con `motion.swift`.

### 5.3 Formulario

- **Inputs**: borde inferior dorado de 1px que crece a 2px en focus (en lugar del border completo actual). Más limpio.
- **Chips de Sefirot**: usan los mismos puntos de color del árbol (coherencia visual). Click → pulse rápido `scale 1 → 1.08 → 1` en 200ms.
- **Validación inline**: si el usuario intenta guardar sin sefirot, el bloque hace shake horizontal sutil `x: [-3, 3, -2, 2, 0]` en 300ms.
- **Botón Guardar/Crear con loading**: el texto se reemplaza por 3 puntos pulsantes en cascada (delay 0.15s entre puntos).
- **Toast de éxito**: aparece arriba-centro `y: -40 → 0`, dura 2.5s, salida `y: 0 → -40`.

### 5.4 Borrar actividad

Two-step inline (no modal):

1. Primer click: el botón cambia a "Confirmar borrado" en rojo.
2. 3 segundos para confirmar — si no, vuelve al estado original con `motion.flowing`.
3. Segundo click: ejecuta delete + cierra panel.

---

## 6. Sistema de animaciones globales

### 6.1 Variants reutilizables — `motion/transitions.ts`

```ts
fadeUp:      { initial: { opacity: 0, y: 8 },        animate: { opacity: 1, y: 0 } }
fadeIn:      { initial: { opacity: 0 },              animate: { opacity: 1 } }
scaleIn:     { initial: { opacity: 0, scale: 0.96 }, animate: { opacity: 1, scale: 1 } }
staggerKids: { animate: { transition: { staggerChildren: motion.stagger } } }
panelEnter:  { initial: { x: '100%' },               animate: { x: 0,
              transition: { type: 'spring', damping: 28, stiffness: 220 } } }
```

`viewMorph` (direccional) se define localmente en `ViewMorph.tsx` por su lógica específica.

### 6.2 Estados ambientales (siempre activos salvo reduced-motion)

1. Respiración del árbol Sefirótico.
2. Línea del ahora en `WeekView` (actualiza cada 60s).
3. Glow del día actual en `WeekView` y `MonthView`.
4. Shimmer de las líneas de conexión del árbol (cada 6s, desfasado entre líneas).
5. Gradiente del Shabat en la columna del sábado (estático, no animado).

### 6.3 Reduced motion

`useReducedMotion()` (hook nativo de Framer Motion). Cuando `prefers-reduced-motion: reduce` está activo:

- Respiraciones desactivadas.
- Transiciones reducidas a 150ms lineales.
- Shimmers congelados.
- Morphs de vista se reducen a crossfade simple.

### 6.4 Performance

- Todas las animaciones de respiración usan solo `transform` y `opacity` (composited; no triggerean layout).
- `will-change: transform` aplicado solo durante la respiración activa, no permanente.
- `AnimatePresence` con `mode="wait"` para vistas; `mode="popLayout"` para chips de eventos al filtrar.
- Las `layoutId` solo se usan en eventos visibles en la vista actual (no se mantienen para eventos fuera del rango visible).

---

## 7. Integración con backend

Sin cambios en la API. Endpoints consumidos (igual que hoy):

- `GET /actividades?start={iso}&end={iso}` → lista filtrada por rango.
- `GET /energia/volumen-semanal?fecha={iso-date}` → volumen agregado por sefirá.
- `POST /actividades`, `PUT /actividades/{id}`, `DELETE /actividades/{id}`.
- `GET /sefirot` → lista de sefirot (ya consumida en `App.tsx`).

`API_BASE` se mantiene en `http://127.0.0.1:8000` (idéntico al actual).

---

## 8. Plan de migración

Para evitar dejar la app rota durante el rediseño, la migración es **incremental con switch**:

1. Crear toda la nueva estructura en `frontend/src/calendar/` sin borrar nada.
2. `App.tsx` mantiene el import al `CalendarModule.tsx` viejo hasta que `frontend/src/calendar/CalendarModule.tsx` esté completo.
3. Cuando esté listo: cambiar el import en `App.tsx`, verificar regresión, eliminar el archivo viejo y `App_old.tsx` también si está obsoleto.

Esto permite implementar y probar en paralelo, y mantener un fallback funcional hasta el switch final.

---

## 9. Out of scope (explícito)

- Cambios al backend.
- Migración del DB schema.
- Internacionalización (queda en español).
- Soporte de múltiples usuarios / autenticación.
- Vista diaria (`day`) — actualmente no existe y no se pide.
- Drag & drop de eventos para mover horarios — no existe hoy y no se pide.
- Recurrencia de actividades — no existe hoy y no se pide.

---

## 10. Criterios de éxito

- El módulo entero (calendario + árbol + panel) renderiza con el nuevo diseño.
- Todas las acciones funcionales actuales siguen operativas: crear, editar, borrar actividad; filtrar por sefirá; navegar entre vistas; navegar en el tiempo.
- Las transiciones entre vistas (semana ↔ mes ↔ año) son morphs dirigidos sin saltos abruptos.
- El árbol Sefirótico tiene respiración ambiental visible pero no distractora.
- El panel lateral entra con spring y sale con flowing, no con CSS transitions.
- `prefers-reduced-motion: reduce` desactiva respiraciones y morphs.
- Performance: 60fps sostenidos en navegación normal en hardware promedio.
- `react-big-calendar` y su CSS asociado son removidos de `package.json` y `index.css`.
