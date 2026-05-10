# Manifiesto enhance — loading screen + Instrument Serif + cosmic background

**Fecha:** 2026-05-09
**Alcance:** Subir el nivel cinematográfico de la página de bienvenida (`InicioModule`) sin cambiar su contenido. Agrega un loading screen previo, una fuente serif italic distintiva (Instrument Serif), un fondo cósmico animado, y un accent gradient ámbar/dorado registrado en Tailwind. Las 6 secciones de contenido que ya están en PR #40 quedan intactas.

---

## 1. Objetivo y motivación

PR #40 entregó el manifiesto con su narrativa de seis secciones, sus orbes pulsantes y sus animaciones de fade-up por sección. Funcionalmente está completo y emocionalmente es correcto, pero visualmente "se siente" como una landing genérica encima de un fondo plano. La referencia que el usuario mandó (Árbol de la Vida cósmico glow) y el prompt técnico del template apuntan a un nivel de polish que la versión actual no alcanza: arranque cinematográfico, tipografía display más expresiva, fondo atmosférico, transiciones más curadas.

Este spec aplica cuatro mejoras concretas sobre el manifiesto:

1. **Loading screen** que aparece UNA vez por sesión antes del manifiesto.
2. **Fuente Instrument Serif italic** para los headlines de display.
3. **CosmicBackground animado** detrás del manifiesto (CSS puro, sin video).
4. **Accent gradient ámbar/dorado** registrado en Tailwind y reusable.

Las secciones del manifiesto y su contenido NO cambian. Sólo se enriquece su entrada y su entorno.

---

## 2. Decisiones tomadas

| Eje | Decisión |
|---|---|
| Paleta del accent gradient | Ámbar/dorado (`#e9c349 → #b8860b`) — coherente con el árbol del Espejo |
| Loading screen | Sí, sólo primera vez por sesión (`sessionStorage` flag `kabbalah-loading-done`) |
| Duración del loading | 2700 ms desde 000 hasta 100, + 400 ms de fade-out |
| Tipografía display | Instrument Serif (italic 400) vía Google Fonts |
| Tipografía cuerpo | Se mantiene la `font-serif` actual del Tailwind default |
| Fondo cósmico | CSS puro — gradiente radial + estrellas estáticas con flicker + manchas de polvo cósmico con `mix-blend-screen`. SIN video HLS |
| Animación de entrada del Hero | `framer-motion` (sin GSAP) — blur + y-translate |
| Scope de aplicación | Sólo cuando `activeView === 'inicio'` |
| Decisión sobre PR #40 | Se cierra sin mergear. Este enhance se abre como PR nuevo encima del estado actual de la rama `feat/inicio-manifiesto` |
| Out of scope | HLS video, GSAP, secciones de portfolio (Works, Journal, Stats, marquee, footer de contacto) |

---

## 3. Arquitectura

### 3.1 Nuevo módulo: `frontend/src/inicio/components/LoadingScreen.tsx`

Componente que aparece encima de todo (`fixed inset-0 z-[9999] bg-bg`). Recibe `onComplete: () => void`. Internamente:

- Usa `requestAnimationFrame` o `setTimeout` para contar de 0 a 100 en 2700 ms (~28-30 frames).
- Mantiene `state.count` que se actualiza ~36 veces (cada ~75ms).
- Layout:
  - **Top-left**: `"KABBALAH SPACE"` en `text-xs uppercase tracking-[0.3em] text-stone-500`.
  - **Centro**: tres palabras `["Despertar", "Reflejar", "Crecer"]` cycling cada 900 ms. Usa `AnimatePresence mode="wait"` con `y: 20 → 0 → -20`. Estilo `font-display italic text-5xl md:text-7xl text-amber-100/80`.
  - **Bottom-right**: contador `count.toString().padStart(3, '0')` en `font-display text-6xl md:text-8xl tabular-nums text-amber-100/90`.
  - **Bottom edge**: barra de progreso `h-[3px] bg-stone-800/50`, con `<div>` interno usando `.accent-gradient` y `transform: scaleX(count/100)` desde `transform-origin: left`. Sombra `box-shadow: 0 0 8px rgba(233, 195, 73, 0.35)`.
- Cuando `count === 100`: `setTimeout(onComplete, 400)`.
- Al desmontar: fade-out 400 ms en el overlay completo (vía AnimatePresence en el caller).

### 3.2 Nuevo módulo: `frontend/src/inicio/components/CosmicBackground.tsx`

Componente decorativo que se renderiza ANTES de las secciones dentro de `InicioModule`. Posición `fixed inset-0 -z-10 pointer-events-none` para no interferir con scroll/clicks.

Tres capas apiladas (top→bottom de stack):

- **Capa 1 — Gradiente radial pulsante**: `bg-gradient-radial` (Tailwind 4 lo soporta nativo) con `from-stone-950 via-[#0a0a0e] to-black`, animación de `background-position` 12s ease-in-out infinite. Aplicado al div con `absolute inset-0`.
- **Capa 2 — Estrellas con flicker**: array de 80 puntos generados al montaje (positions/sizes/delays). Cada estrella es un `<span>` absoluto con `w-[1px] h-[1px]` o `w-[2px] h-[2px]` y `bg-white/70`. Animación CSS keyframe `flicker` de opacidad `0.3 → 1 → 0.3`, duración 3-8s aleatoria, delay aleatorio. Las posiciones son estables por mount — no se regeneran entre renders.
- **Capa 3 — Manchas de polvo cósmico**: dos divs grandes con `mix-blend-screen`:
  - Bottom-left: `bg-amber-900/15 blur-[140px]`, posición `bottom-[-15%] left-[-10%]`, `w-[600px] h-[600px]`.
  - Top-right: `bg-indigo-900/12 blur-[120px]`, posición `top-[-10%] right-[-5%]`, `w-[500px] h-[500px]`.

Estas tres capas reusan el mismo lenguaje de los gradientes que ya existen en el root de `App.tsx`, pero más ricas (estrellas, pulso) y aplicadas sólo al `inicio`.

`prefers-reduced-motion`: si está activo, la capa 1 no pulsa (background-position estático) y las estrellas no parpadean (opacidad fija en 0.6). Las manchas de capa 3 quedan iguales.

### 3.3 Modificaciones tipográficas

#### `frontend/index.html`

Agregar import de Google Fonts en `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@1&display=swap" rel="stylesheet">
```

#### `frontend/tailwind.config` (o el equivalente en Tailwind 4)

Verificar primero si el proyecto usa Tailwind 3 (con `tailwind.config.{js,ts}`) o Tailwind 4 (con `@theme` en CSS). En cualquier caso, registrar:

```
fontFamily: {
  display: ['"Instrument Serif"', 'Georgia', 'serif'],
}
```

(En Tailwind 4 + Vite, esto vive en `@theme` dentro de `src/index.css`:)

```css
@theme {
  --font-display: 'Instrument Serif', Georgia, serif;
}
```

Para no romper nada existente, NO se reemplaza la `font-serif` del tailwind default. La clase `font-display italic` es NUEVA y opcional.

#### Aplicación en los componentes

- `LoadingScreen.tsx`: la palabra rotante y el contador usan `font-display italic`.
- `Section1Hook.tsx`: el `<h1>` cambia de `font-serif` a `font-display italic`.
- `Section4Bridge.tsx`: el `<h2>` cambia de `font-serif` a `font-display italic`.
- El resto de secciones (Section 2, 3, 5, 6) mantiene `font-serif` para los párrafos narrativos. El contraste serif-roman (cuerpo) vs serif-italic (display) genera ritmo.

### 3.4 Accent gradient

#### En `frontend/src/index.css`

Agregar utility class:

```css
.accent-gradient {
  background-image: linear-gradient(90deg, #e9c349 0%, #b8860b 100%);
}
```

#### Aplicación

- Barra de progreso del `LoadingScreen` (capa interna).
- Ring de hover de `Section6Cta`'s "Entrar al Árbol de la Vida" (botón primario). Se implementa con un wrapper `relative` que tiene un `<span>` absoluto con `.accent-gradient inset-[-2px] rounded-xl opacity-0 group-hover:opacity-100`. El botón en sí va con `bg-stone-950/80 backdrop-blur-md`. Esto reemplaza el `shadow-[0_0_18px_rgba(233,195,73,0.18)]` actual con un ring degradado animado.

### 3.5 Entrada cinematográfica de Section 1

Modificación a `Section1Hook.tsx`. Actualmente: la sección entra vía el wrapper `InicioSection` (fade-up genérico). El enhance suma una capa por encima:

- El headline `<h1>` recibe sus propios `initial` / `animate`: `opacity: 0 → 1`, `y: 30 → 0`, `filter: 'blur(10px)' → 'blur(0px)'`, duración 1.2 s, delay 0.1 s, ease `[0.16, 1, 0.3, 1]`. Esto se ejecuta cuando el componente monta — efectivamente al terminar el loading screen.
- El orbe pulsante mantiene su loop, pero la primera aparición se demora 0.6 s después del headline (`delay: 0.6` en el `animate`).

`useReducedMotion`: el blur se omite, el `y` se omite. Sólo queda el opacity 0→1 en 0.4 s.

### 3.6 Integración en `InicioModule.tsx`

Estado nuevo en `InicioModule`: `[loadingDone, setLoadingDone] = useState<boolean>(...)` inicializado leyendo `sessionStorage.getItem('kabbalah-loading-done') === '1'`. Si `true`, salteamos el loading. Si `false`, lo mostramos.

Render:

```tsx
<>
  <CosmicBackground />
  <AnimatePresence>
    {!loadingDone && (
      <LoadingScreen
        onComplete={() => {
          sessionStorage.setItem('kabbalah-loading-done', '1');
          setLoadingDone(true);
        }}
      />
    )}
  </AnimatePresence>
  <motion.main className="... existing ...">
    <Section1Hook />
    {/* ...rest unchanged */}
  </motion.main>
</>
```

El `<CosmicBackground />` se renderiza siempre que el módulo esté montado (cuando `activeView === 'inicio'`). El `LoadingScreen` aparece sólo en la primera carga de la sesión, y se desmonta vía `AnimatePresence` con un exit fade-out de 400 ms al disparar `onComplete`.

---

## 4. Tokens visuales reusados / nuevos

| Token | Donde | Valor |
|---|---|---|
| `--font-display` | Tailwind theme + `index.css` `@theme` | `'Instrument Serif', Georgia, serif` |
| `.accent-gradient` | `index.css` utility | `linear-gradient(90deg, #e9c349 0%, #b8860b 100%)` |
| Estrellas | `CosmicBackground` local constant | 80 puntos posición/tamaño/delay aleatorios estables por mount |
| Sombra del progress bar | inline en `LoadingScreen` | `0 0 8px rgba(233, 195, 73, 0.35)` |
| `kabbalah-loading-done` | `sessionStorage` flag | `'1'` después de completar |

---

## 5. Tests / verificación

- **Out of scope**: tests automatizados (sin vitest aún).
- **Verificación manual**:
  1. Refrescar la app por primera vez en la sesión: aparece el loading screen, contador 000→100 en ~3s, fade-out, manifiesto aparece detrás del fondo cósmico.
  2. Navegar a otra vista y volver al manifiesto: el loading screen NO se vuelve a disparar (flag de sessionStorage).
  3. Cerrar pestaña, abrir nueva pestaña, ir a localhost: loading SÍ se vuelve a disparar (sessionStorage es per-tab-group, por defecto).
  4. Section 1 al entrar: headline aparece con blur fading + y-translate.
  5. Hover en "Entrar al Árbol de la Vida": ring de hover con accent gradient ámbar.
  6. `prefers-reduced-motion: reduce`: loading screen sigue funcionando pero sin las animaciones de palabras/blur — sólo el contador progresa; estrellas estáticas; orbe pulsante sin pulso; blur del headline omitido.
  7. `tsc -b --noEmit` clean.
  8. `npm run build` clean (bundle deberá crecer ~5-10 KB por la fuente y el CSS adicional).

---

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Google Fonts adds external dependency / CSP issues | Usar `<link>` standard. Si más adelante hace falta self-host, se documenta como follow-up |
| Loading screen se siente molesto a quien viene a usar la app, no a contemplar | Sessionstorage flag — sólo una vez por sesión. Y el contador es rápido (3s). El user que cierra pestaña aún ve el flag, pero sólo dentro del mismo tab-group |
| Las 80 estrellas con animación pueden lagear en mobile de gama baja | Animaciones CSS puras (no JS), GPU-accelerated. `prefers-reduced-motion` desactiva el flicker |
| `mix-blend-screen` en las manchas de polvo no funciona bien sobre todos los browsers (Safari < 15 tenía bugs) | Si se ve mal, el fallback (sin mix-blend) sigue siendo aceptable porque las manchas tienen colores oscuros |
| Tailwind 4 vs Tailwind 3: el proyecto puede estar usando uno u otro y la sintaxis de registro de fuentes cambia | Investigar en el momento de implementar y aplicar la sintaxis correcta. Si es Tailwind 3, ir a `tailwind.config.ts`; si es Tailwind 4, `@theme` en `src/index.css` |
| El blur de Section 1 puede causar paint cost alto si las cards de las secciones son muchas | Sólo el `<h1>` lleva el blur, no las secciones enteras. Y el blur dura 1.2 s |

---

## 7. Out of scope / Future

- HLS video background (necesita un asset de video real, posiblemente del Tree of Life cosmic glow).
- GSAP — sólo si más adelante se quiere parallax scroll-driven complejo.
- Self-hosting de Instrument Serif (mejor performance si se sirve desde el mismo origen).
- Cursor custom para inicio (cursor en formato orbe). Tentador pero distrae.
- Audio ambient sutil en loading screen. Out of scope, riesgo de fricción mayor que beneficio.
