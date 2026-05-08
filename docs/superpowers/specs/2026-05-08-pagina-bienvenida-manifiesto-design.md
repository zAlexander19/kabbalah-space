# Página de bienvenida — Manifiesto Kabbalah Space

**Fecha:** 2026-05-08
**Alcance:** Nueva vista de bienvenida (long-scroll) que sirve de pórtico filosófico a la app. Se vuelve la vista default (en vez del Árbol). Comunica la idea central: el conocimiento del universo empieza por el autoconocimiento. Tres voces se intercalan — narrativa propia + dos citas verbatim de la tradición + un cierre poético que amarra el árbol como herramienta.

---

## 1. Objetivo y motivación

Hoy la app abre directamente en el Árbol de la Vida (`activeView = 'espejo'`). Un usuario nuevo aterriza en una pantalla cargada de contenido (orbes, sefirot, panel lateral, intro animada) sin saber por qué importa. La app **funciona** pero no se **explica**.

Esta página de bienvenida es el contexto que hoy falta: ancla la propuesta filosófica antes de meter al usuario en la herramienta. La tesis a comunicar:

- Hay una promesa colectiva (la humanidad llegará a conocer el misterio).
- Pero esa promesa se realiza siempre primero en el individuo (en cada generación, algunos despiertan).
- Por lo tanto: conocer el universo es indistinguible de conocerte a vos mismo.
- Kabbalah Space es la herramienta que mapea las diez dimensiones (sefirot) para que recorras ese trabajo.

El usuario sale del manifiesto con un click claro: *"Entrar al Árbol de la Vida"*.

---

## 2. Decisiones tomadas

| Eje | Decisión |
|---|---|
| Vista default | Pasa de `'espejo'` a `'inicio'` |
| Acceso desde el sidebar | Nuevo ícono (primer ítem del rail) — `auto_stories` (libro abierto) |
| Estado de auth | Disponible para anónimos y logueados — el contenido no cambia |
| Layout | Long-scroll vertical, ritmo controlado por el lector |
| Animaciones | Fade-in + draw-on-enter por sección (`useInView` de framer-motion) |
| Tono del texto | Híbrido: voz contemporánea propia + dos citas verbatim como anclas |
| Idioma | Español (sin i18n por ahora) |
| Mobile | Responsive con Tailwind; misma estructura, tipografía más chica |
| Intro animada del Espejo | Sigue existiendo, se dispara solo cuando el user entra al Árbol por primera vez en la sesión |
| Out of scope | Tracking de scroll-depth, A/B testing, vídeo de fondo, traducciones |

---

## 3. Arquitectura

### 3.1 Cambios en `App.tsx`

- `ViewKey` agrega un nuevo valor: `'inicio'`.
- `NAV_ITEMS` arranca con `{ key: 'inicio', icon: 'auto_stories', label: 'Bienvenida' }` antes del árbol.
- `useState<ViewKey>('espejo')` → `useState<ViewKey>('inicio')`.
- `VIEW_TITLES` agrega entrada para `'inicio'`. Pero **la nueva vista usa su propio header completo** (no el `<header>` genérico), así que cuando `activeView === 'inicio'` el layout esconde el header genérico de `App.tsx` y deja que `InicioModule` ocupe la altura completa. (Se usa una condición `{activeView !== 'inicio' && <header>...</header>}`.)
- La intro animada del Espejo (`introPlaying`) sigue existiendo. La sessionStorage flag `espejo-intro-done` se respeta como hasta ahora; entrar primero al manifiesto y luego al árbol no la dispara dos veces.

### 3.2 Módulo nuevo: `frontend/src/inicio/`

Tres archivos. Cada sección es un componente chico que acepta los mismos props base, así no se acumulan estilos en un solo archivo gigante.

**`InicioModule.tsx`** — el contenedor. Importa los seis componentes de sección y los apila en orden. Recibe un callback `onEnterEspejo: () => void` que el botón final dispara.

**`components/InicioSection.tsx`** — wrapper común para todas las secciones (nombre evita confusión con la `Section` privada que ya existe en `SefiraDetailPanel.tsx`). Encapsula:
- Padding vertical generoso (`py-24 md:py-32`).
- `useInView` con `once: true, margin: '-15%'` — la animación se dispara cuando la sección está mayormente visible y no se repite.
- Variantes de framer-motion para fade-in + slide-up suave.

**`components/Section1Hook.tsx` ... `Section6Cta.tsx`** — una por sección.

Cada sección tiene una pieza visual distinta:

| Sección | Componente | Pieza visual |
|---|---|---|
| 1 — Hook | `Section1Hook` | Orbe pulsante centrado (radial-gradient ámbar + glow); se anima `scale` + `opacity` en loop suave |
| 2 — La promesa | `Section2Promise` | Línea dorada horizontal que se "dibuja" left→right (`pathLength` de framer-motion) |
| 3 — El camino | `Section3Path` | Tres puntos de luz que aparecen secuenciales y se conectan con líneas finas (mini-constelación) |
| 4 — El puente | `Section4Bridge` | Orbe central que crece (`scale` 0.4→1.2) mientras se hace visible |
| 5 — La herramienta | `Section5Tool` | Silueta del Árbol de la Vida: SVG con los 10 nodos (círculos vacíos + las 22 conexiones), trazadas con `pathLength` cuando entra el viewport. Sin colores — solo trazos finos amarillo claro |
| 6 — CTA | `Section6Cta` | Dos botones grandes en stack vertical |

### 3.3 Contenido textual

Versiones finales (los componentes los tienen hardcodeados, no leen de un archivo de strings — YAGNI hasta que necesitemos i18n).

**Sección 1 — Hook:**
```
El viaje hacia el universo
empieza adentro.
```

**Sección 2 — La promesa (general):**
```
Llegará un día en que la humanidad entera
conocerá el misterio en el que vive.

— "Porque la tierra será llena del conocimiento
del Señor, como las aguas cubren el mar."
   Isaías 11.9
```

**Sección 3 — El camino (particular):**
```
Pero ese día no nace de la multitud.
Cada generación lleva sus despiertos —
pocos, suficientes — que ya viven
el conocimiento como ojo,
no como rumor.

— "No hay generación en la cual
no haya alguien como Abraham y Jacob."
   Sabios de la tradición
```

**Sección 4 — El puente:**
```
Conocer el universo empieza
por conocerte a vos mismo.
Cada dimensión del alma
es un pliegue del cosmos.
```

**Sección 5 — La herramienta:**
```
Kabbalah Space mapea diez dimensiones del alma
— las sefirot del Árbol de la Vida —
para que observes cómo se mueve cada una
en tu vida diaria.

Reflexionás, registrás actividades,
y el árbol te devuelve lo que está vibrando
y lo que está callado.
```

**Sección 6 — CTA:**
```
[ Entrar al Árbol de la Vida ]      ← botón primario, ámbar
[ Iniciar sesión ]                   ← solo visible si !auth.user
```

### 3.4 CTA: detalles

- "Entrar al Árbol de la Vida" llama a un callback `onEnterEspejo` que cambia `activeView` a `'espejo'` (el módulo no toca App state directo — recibe la callback como prop).
- "Iniciar sesión" llama a `auth.openLoginModal('manual')` (el flag `'manual'` es importante — sin el `'gated-save'` no estaríamos forzando ningún save). Solo se renderiza cuando `auth.status === 'anonymous'`.

---

## 4. Tokens visuales reusados

- Color del orbe (Sección 1, 4): `ink.ember` (`#e9c349`) con su `emberSoft` para el glow.
- Tipografía: la misma `font-serif` que ya usa el header del App (`Mi Árbol de la Vida`).
- Color de texto principal: `text-amber-100/90` (mismo que el header).
- Color de texto secundario / cita: `text-stone-400` con `italic`.
- Color de la línea dorada: `border-amber-300/40`.
- Color del Árbol silueteado (Sección 5): `stroke-amber-100/30` (sutil).
- Tamaños tipográficos:
  - Sección 1 (hook): `text-5xl md:text-7xl`
  - Sección 4 (puente): `text-3xl md:text-5xl`
  - Resto: `text-lg md:text-xl` para narrativa, `text-base` italic para citas.

---

## 5. Animación

Todas las secciones usan el mismo patrón vía `InicioSection.tsx`:

```tsx
const ref = useRef(null);
const inView = useInView(ref, { once: true, margin: '-15% 0%' });
return (
  <motion.section
    ref={ref}
    initial={{ opacity: 0, y: 24 }}
    animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
    transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
  >
    {children}
  </motion.section>
);
```

Adicional por sección (cada componente lo gestiona internamente, encadenado al `inView` que recibe del wrapper):

- **Sección 1:** orbe con `scale: [1, 1.08, 1]` en loop infinito (4s).
- **Sección 2:** línea con `pathLength: [0, 1]` en 1.2s, eased.
- **Sección 3:** los tres puntos aparecen escalonados (delays 0, 0.3, 0.6s); las dos líneas que los conectan se dibujan después (delay 0.9s, 0.4s cada una).
- **Sección 4:** orbe con `scale: [0.4, 1.2]` y `opacity: [0, 1]`, 1.5s.
- **Sección 5:** el árbol silueteado dibuja sus 22 conexiones con `pathLength` (50ms stagger), después aparecen los 10 círculos con un fade-in (200ms cada uno escalonado).
- **Sección 6:** botones con stagger entry (0.1s entre uno y otro).

`prefers-reduced-motion`: se respeta vía el hook `useReducedMotion` de framer-motion. Si está activado, todas las animaciones se reducen a `opacity` (sin movimiento, sin draws).

---

## 6. Mobile y responsive

Todo el módulo se adapta automáticamente con clases responsivas de Tailwind:

- `max-w-2xl mx-auto px-6 md:px-8` en el contenedor de cada sección.
- Tipografía: usa `md:` prefix para crecer en desktop.
- El SVG del árbol silueteado (Sección 5) ocupa `w-full max-w-md` y mantiene aspect ratio.
- Los botones del CTA: en mobile uno debajo del otro, en `md+` quedan en fila (con `flex-col md:flex-row`).
- En mobile la altura de las secciones se mantiene generosa (`py-20`) pero menos que en desktop (`md:py-32`) para que se sienta más fluido el scroll.

---

## 7. Tests / verificación

- **Out of scope**: tests automatizados (el frontend sigue sin vitest setup; igual que el resto del proyecto).
- **Verificación**: `tsc -b --noEmit` clean, `vite build` clean, manual:
  1. Abrir la app: aterrizás en el manifiesto.
  2. Scroll hasta abajo: cada sección anima al entrar.
  3. Click "Entrar al Árbol de la Vida": cambia a Espejo. Si es la primera vez en la sesión, la intro animada se dispara.
  4. Click el ícono `auto_stories` desde cualquier vista: vuelve al manifiesto.
  5. Anónimo: ve el botón "Iniciar sesión". Logueado: NO lo ve.
  6. `prefers-reduced-motion: reduce`: las animaciones se simplifican.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Hacer el manifiesto la página default puede frustrar a usuarios recurrentes que ya conocen la propuesta y quieren ir directo al árbol | El ícono `auto_stories` queda en el rail, accesible siempre, pero el primer landing siempre es bienvenida. Si se acumulan quejas, fácil cambiar el default a recordar la última vista visitada |
| Las animaciones de scroll-driven pueden lagear en mobile de gama baja | `useInView` con `once: true` evita re-disparos, y `prefers-reduced-motion` cubre el peor caso |
| El texto se siente largo si está mal espaciado | Cada sección tiene `py-24 md:py-32` — el espacio vertical fuerza un ritmo que evita la sensación de "muro de texto" |
| El árbol silueteado de la Sección 5 podría chocar visualmente con el árbol real del Espejo | Es deliberadamente más simple (sin colores, trazos finos) para que cuando el user llegue al árbol real sienta el contraste — el silueteado es la promesa, el real es la herramienta |

---

## 9. Out of scope / Future

- Tracking de scroll-depth (cuánto leyó el user antes del CTA).
- A/B testing del copy.
- Vídeo o partículas animadas en el background.
- Internacionalización (i18n).
- Audio narrativo o música ambiente.
- Variantes del texto según el estado del user (ej. más corta para usuarios recurrentes).
