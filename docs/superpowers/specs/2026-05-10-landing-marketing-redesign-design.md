# Landing rediseño — marketing page con CSS framework dorado

**Fecha:** 2026-05-10
**Alcance:** Reemplazar completamente la vista `inicio` (manifiesto contemplativo, PR #40) por una landing marketing-style basada en el CSS framework provisto por el usuario. Nuevo hero, nav, sección de premisa condensada, grid de módulos, grid de sefirot, marquee, CTA final, footer. Usa el logo oficial de Kabbalah Space adaptado a fondo oscuro. Conserva `LoadingScreen` y `CosmicBackground` del enhance previo. Cierra PR #40 sin mergear, arranca branch nuevo.

---

## 1. Objetivo y motivación

El manifiesto contemplativo de PR #40 es bello pero no funciona como landing para alguien que llega por primera vez al dominio: faltan contexto, módulos, CTA claro. La nueva landing comunica el producto en ~30 segundos de scroll:

1. Quién — "Kabbalah Space" + tagline.
2. Por qué — premisa filosófica condensada.
3. Qué hace — tres módulos (Espejo, Calendario, Evolución).
4. Cómo está estructurado — las 10 sefirot.
5. Acción — "Entrar al Árbol".

El estilo visual viene del HTML que el usuario compartió: dorado sobre negro, tipografía Newsreader serif para títulos, Manrope sans para body, Space Grotesk monospace para eyebrows y pills. Sin glow excesivo ni efectos que distraigan — el árbol del producto en sí es el efecto visual fuerte.

---

## 2. Decisiones tomadas

| Eje | Decisión |
|---|---|
| Default view | Sigue siendo `'inicio'` |
| Vista anterior | Se descarta. PR #40 se cierra sin mergear |
| Branch | Nueva `feat/inicio-landing` desde `main`. PR #41 nuevo |
| Logo | Se renderiza inline en el nav con el árbol del SVG tinted dorado + wordmark en HTML (no se usa el SVG completo porque incluye texto en navy oscuro que no se ve sobre negro) |
| Paleta | Dorado/ámbar sobre negro casi total (`#050507`). `--gold: #e9c349`, `--gold-deep: #9a7c1f` |
| Fuentes | Newsreader (serif), Manrope (sans), Space Grotesk (mono) — ya cargadas en `index.css` |
| CSS framework | Las clases `.ks-*` del HTML se traducen a utility classes en `index.css`. Las variables se registran en el `@theme` block de Tailwind 4 |
| Reveal-on-scroll | Implementado con `useInView` de framer-motion, no con IntersectionObserver global |
| LoadingScreen | Se conserva (primera visita por sesión). Loading flag = `kabbalah-loading-done` |
| CosmicBackground | Se conserva pero solo en la vista `inicio` y con menor intensidad — sirve de base sutil; el verdadero protagonismo lo lleva el contenido |
| Sefirot grid | Reutiliza los `SEFIRA_COLORS` que ya están en `frontend/src/shared/tokens.ts` |
| Anchors | `Manifiesto` y `Sefirot` en el nav son anchors (`#premisa`, `#sefirot`) que hacen scroll suave dentro de la página |
| Out of scope | Internacionalización, página `/filosofia` separada con el manifiesto largo, animaciones GSAP, módulos con assets de video real |

---

## 3. Arquitectura

### 3.1 Tear down

Borrar de `frontend/src/inicio/components/`:
- `Section1Hook.tsx`
- `Section2Promise.tsx`
- `Section3Path.tsx`
- `Section4Bridge.tsx`
- `Section5Tool.tsx`
- `Section6Cta.tsx`
- `InicioSection.tsx`

Conservar:
- `LoadingScreen.tsx` (sin cambios).
- `CosmicBackground.tsx` (sin cambios — sigue funcionando como base atmosférica).

Reescribir desde cero:
- `InicioModule.tsx` — orquestador nuevo.

Nada del routing en `App.tsx` cambia. `activeView === 'inicio'` sigue renderizando `<InicioModule />` con prop `onEnterEspejo`.

### 3.2 Nuevos componentes en `frontend/src/inicio/components/`

**`KabbalahLogo.tsx`** — Logo wordmark adaptado a dark mode. Recibe `size?: 'sm' | 'md'`. Renderiza:
- Un `<svg viewBox="0 0 100 90">` con el árbol simplificado (10 círculos dorados pequeños + 22 conexiones doradas semi-transparentes) escalado a ~32-40px de alto.
- Junto al árbol, un `<span>` con "Kabbalah" en Newsreader serif + "✦" dorado + "Space" en Newsreader italic dorado claro.
- Layout `flex items-center gap-3`.

**`InicioNav.tsx`** — Nav fija en `top-0` con `backdrop-blur-md bg-bg/60 border-b border-white/5`. Props: `onEnterEspejo: () => void`. Contenido:
- Izquierda: `<KabbalahLogo size="sm" />`.
- Centro / derecha: tres elementos
  - `<a href="#premisa" className="ks-nav-link">Manifiesto</a>`
  - `<a href="#sefirot" className="ks-nav-link">Sefirot</a>`
  - `<button onClick={() => useAuth().openLoginModal('manual')} className="ks-nav-cta">Iniciar sesión ↗</button>` — pero si ya está autenticado, oculto y reemplazado por "Entrar al Árbol" link directo. (Implementado vía `useAuth()` directo.)
- Responsive: en mobile, los nav links se ocultan; queda logo + CTA solamente.

**`InicioHero.tsx`** — Section 1 full-viewport. Contenido:
- Pill: `<span className="ks-pill">ALEPH 1</span>`.
- Título: `<h1 className="ks-serif ks-name-reveal">Kabbalah Space</h1>` — tamaño `text-7xl md:text-9xl`, italic.
- Subtítulo: `<p className="ks-serif ks-blur-in italic text-2xl md:text-4xl">Inteligencia del Ser.</p>`.
- Body: dos líneas Manrope, `ks-blur-in` con delay mayor, ~`max-w-md`.
- CTAs:
  - Primary `<button className="ks-btn-primary" onClick={onEnterEspejo}>Entrar al Árbol →</button>`.
  - Ghost `<a href="#premisa" className="ks-btn-ghost">Cómo funciona ↓</a>`.
- Indicador de scroll abajo-centro: línea vertical 40px con animación `ks-scroll-down` + eyebrow "SCROLL".
- Padding superior `pt-32 md:pt-48` para no quedar pegado al nav.

**`InicioPremisa.tsx`** — Section 2 con id `premisa`. Reveal-on-scroll vía `useInView`. Contenido:
- Eyebrow: "Premisa".
- Título serif italic: "El conocimiento del universo empieza por adentro."
- 2 párrafos cortos:
  - Párrafo 1: "Llegará un día en que la humanidad entera conocerá el misterio en el que vive. Pero ese día no nace de la multitud — nace en cada persona que decide mirar adentro."
  - Párrafo 2: "Kabbalah Space mapea las diez dimensiones del alma — las sefirot — para que veas, día a día, cuál vibra y cuál se calla."

**`InicioModulos.tsx`** — Section 3. Contenido:
- Eyebrow: "Módulos".
- Título serif: "Tres dimensiones del trabajo."
- Grid `grid-cols-1 md:grid-cols-3 gap-5` de 3 `<div className="ks-module-card">`:
  - **Espejo Cognitivo** — art: orbe dorado pulsante + 3 puntos conectados. Body: "Reflexión guiada por las preguntas de cada sefirá. La IA observa lo que escribís y devuelve un score de coherencia."
  - **Calendario Cabalístico** — art: 7×4 grid de cuadritos con uno destacado dorado. Body: "Mapeá tus actividades semanales a las dimensiones del alma. Vé el volumen energético de cada sefirá."
  - **Mi Evolución** — art: una curva ascendente dorada. Body: "Curvas mensuales por sefirá: cómo te movés en el tiempo. Score IA vs. score propio, lado a lado."
- Cada card termina con un eyebrow link "EXPLORAR →" que (por ahora) hace scroll al hero o muestra "soon".

**`InicioSefirot.tsx`** — Section 4 con id `sefirot`. Contenido:
- Eyebrow: "El árbol".
- Título serif: "Diez dimensiones del alma."
- Grid `grid-cols-2 md:grid-cols-5 gap-3` de 10 `<div className="ks-sef-card">`:
  - Cada card: un punto de color `w-2 h-2 rounded-full` con `bg` del `SEFIRA_COLORS[id]`, después el nombre español en serif (`Keter`, `Jojmá`, etc.) y una descripción de una línea.
  - Datos hardcodeados desde un array local (`SEFIROT_INFO`) — no fetch al backend en la landing.

**`InicioMarquee.tsx`** — Section 5. Una franja `bg-gold/10 border-y border-gold/20 py-6 overflow-hidden`. Contenido: un `<div className="ks-marquee flex gap-12 whitespace-nowrap">` con la frase "El conocimiento del universo empieza por adentro • ✦ • " repetida 6 veces. Animación CSS `ksMarquee` (60s linear infinite). Texto en Newsreader serif italic, color dorado.

**`InicioCtaFinal.tsx`** — Section 6. Contenido:
- Eyebrow: "Comenzá".
- Título serif italic grande: "Tu árbol te espera."
- CTAs idénticos al hero — primary + ghost.

**`InicioFooter.tsx`** — Footer simple `py-12 border-t border-line text-center`. Contenido:
- Logo pequeño + "Kabbalah Space © 2026 • Hecho con ✦"
- Links rápidos centrados: Manifiesto · Sefirot · GitHub (link al repo).

### 3.3 InicioModule reescrito

```tsx
export default function InicioModule({ onEnterEspejo }: Props) {
  const [loadingDone, setLoadingDone] = useState(() => shouldSkipLoading());
  const handleLoadingComplete = () => { /* same as before */ };

  return (
    <>
      <CosmicBackground />
      <AnimatePresence>
        {!loadingDone && <LoadingScreen key="loading" onComplete={handleLoadingComplete} />}
      </AnimatePresence>
      <InicioNav onEnterEspejo={onEnterEspejo} />
      <InicioHero onEnterEspejo={onEnterEspejo} />
      <InicioPremisa />
      <InicioModulos />
      <InicioSefirot />
      <InicioMarquee />
      <InicioCtaFinal onEnterEspejo={onEnterEspejo} />
      <InicioFooter />
    </>
  );
}
```

El módulo arma la página en orden. Cada section maneja su propio padding interno; no hay un wrapper `<motion.main>` con `max-w-2xl` como antes — cada section define su propio max-width porque algunos (módulos grid, sefirot grid, marquee) van full-width y otros (premisa, hero) van centrados.

### 3.4 Tipografía + paleta en `index.css`

#### Variables nuevas en el `@theme {}` block

```css
@theme {
  /* existing tokens stay */

  --color-bg:        #050507;
  --color-surface:   #0e0e10;
  --color-ink:       #e5e2e1;
  --color-ink-glow:  #fff5e4;
  --color-gold:      #e9c349;
  --color-gold-deep: #9a7c1f;
  --color-line:      rgba(120,113,90,0.22);
}
```

(Tailwind 4 auto-genera `bg-bg`, `bg-surface`, `text-ink`, `text-gold`, `border-line`, etc.)

#### Utility classes globales (al final de `index.css`)

Sigo el patrón del HTML provisto. Todas las clases `.ks-*` van al final del archivo:

- `.ks-serif` — `font-family: 'Newsreader', serif;`
- `.ks-eyebrow` — Space Grotesk mono, 10px, uppercase, tracking 0.28em, color stone-muted.
- `.ks-body` — Manrope 300, color stone con opacity 0.92, line-height 1.7.
- `.ks-nav-link` y `.ks-nav-cta` — los del HTML, con tweaks de hover.
- `.ks-btn-primary` — gradient dorado completo + shadow glow.
- `.ks-btn-ghost` — outlined con backdrop-blur.
- `.ks-pill` — pequeñísimo, gold sobre transparent gold bg.
- `.ks-module-card` — Surface con border, hover lift + glow.
- `.ks-sef-card` — Surface más sutil, hover gold border.
- `.ks-halftone` — overlay pattern de puntos.

#### Keyframes nuevos

- `@keyframes ksScrollDown` (1.6s) — el indicador del hero.
- `@keyframes ksRoleFade` (0.5s) — fade-in con y-translate sutil.
- `@keyframes ksBlurIn` (1.1s) — fade + blur + y-translate.
- `@keyframes ksMarquee` (60s linear infinite) — translateX 0 → -50%.
- `@keyframes ksPulse` (2-3s ease-in-out infinite) — opacity y scale.

Y las utility classes `.ks-blur-in`, `.ks-name-reveal`, `.ks-role-fade`, `.ks-scroll-down`, `.ks-marquee`, `.ks-reveal`.

### 3.5 Reveal-on-scroll con framer-motion

Cada section que no es el hero usa el mismo patrón:

```tsx
const ref = useRef(null);
const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' });

return (
  <motion.section
    ref={ref}
    initial={{ opacity: 0, y: 28 }}
    animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
  >
    {/* content */}
  </motion.section>
);
```

Si `useReducedMotion()` está activo, se anula la `y` translate. El `opacity` se preserva.

### 3.6 Logo adaptado

`KabbalahLogo.tsx` renderiza un SVG inline. NO importa el archivo `kabbalah-space-logo.svg` original porque tiene colores (navy) que no funcionan sobre negro. En su lugar:

- Inline JSX que dibuja un mini árbol de 10 círculos `#e9c349` con stroke `rgba(233,195,73,0.4)` para las 22 conexiones. Las posiciones son las mismas que usa `SefirotInteractiveTree` (proporcionalmente escaladas a un viewBox 100×90).
- Junto al SVG, `<span className="ks-serif">Kabbalah</span><span className="text-gold">✦</span><span className="ks-serif italic text-ink-glow">Space</span>`.

El logo SVG original se preserva en disco (`kabbalah-space-logo.svg`) — sigue siendo el logo oficial para fondos claros (favicon eventualmente, materiales impresos, etc.). Solo no se usa en la app dark.

---

## 4. Tokens visuales reusados / nuevos

| Token | Source | Uso |
|---|---|---|
| `SEFIRA_COLORS` | `frontend/src/shared/tokens.ts` | Puntos de color en `InicioSefirot` |
| `--color-gold` y deep | nuevo en `@theme` | Todos los acentos |
| `--color-line` | nuevo en `@theme` | Border de cards y separadores |
| Newsreader / Manrope / Space Grotesk | ya en `index.css` | Tipografía completa |
| LoadingScreen + CosmicBackground | del enhance previo | Conservados intactos |

---

## 5. Tests / verificación

- **Out of scope**: tests automatizados.
- **Manual**:
  1. Pestaña fresca → loading screen (000→100) → landing.
  2. Hero visible primero, nav fija arriba con backdrop-blur cuando scroll > 100.
  3. Click "Manifiesto" en el nav → smooth scroll a Section 2.
  4. Click "Sefirot" en el nav → smooth scroll a Section 4.
  5. Click "Entrar al Árbol" → cambia a vista Espejo (intro animada si primera vez).
  6. Click "Iniciar sesión" (anon) → LoginModal abre.
  7. Logueado: el botón del nav cambia a "Entrar al Árbol" directo.
  8. Marquee corre suave, texto loopea sin saltos.
  9. Hover sobre las 3 module cards: border dorado + lift suave.
  10. Hover sobre las 10 sef cards: border dorado.
  11. CTAs en hero y footer-cta lucen iguales (primary + ghost).
  12. Mobile (430px viewport): grid de módulos colapsa a 1 col, sefirot grid 2 cols, nav links se ocultan dejando logo + CTA, marquee sigue funcionando.
  13. `prefers-reduced-motion: reduce`: scroll reveals son fade simple, marquee se desactiva (CSS lo permite via `@media (prefers-reduced-motion: reduce) { .ks-marquee { animation: none } }`).
- `tsc -b --noEmit` clean, `vite build` clean.

---

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Reemplazar la landing del PR #40 implica perder el spec + plan + 8 task commits + las 7 commits de enhance ya hechos | Quedan en la historia del git remoto bajo la branch + en el PR #40 cerrado. Si más adelante queremos rescatar texto del manifiesto, está ahí |
| Marquee infinito puede irritar después de 30s en pantalla | `prefers-reduced-motion: reduce` lo apaga. Si más feedback negativo, lo cambiamos a una sola pasada con pause-on-hover |
| El SVG del logo no se usa — desperdicio | El SVG se conserva en disco como asset oficial para futuros usos (favicon, redes sociales, presentaciones). En la app dark se usa una versión inline simplificada |
| El loading screen sigue siendo molesto en testing iterativo | Se mantiene la sessionStorage flag — primera vez por tab-group solamente. En dev se puede borrar manualmente desde DevTools |
| Algún sefiroth-en-grid no tiene descripción canónica corta | Hardcodeo descripciones a partir del campo `description` ya existente en el array `SEFIROT` de `App.tsx`. Si suena chocante, las refino después |

---

## 7. Out of scope / Future

- Página `/filosofia` separada con el manifiesto contemplativo completo.
- Galería / parallax tipo "Explorations" del template original.
- Stats con números ("X reflexiones esta semana", "Y usuarios activos").
- Sección Journal con últimas reflexiones públicas / blog.
- Email signup form integrado.
- Internacionalización (i18n).
- A/B testing de la copy del hero.
- Variantes responsive más afinadas (el spec asume el grid colapsa razonablemente).
