# Espejo Mobile — Responsive Redesign

**Fecha:** 2026-05-31
**Alcance:** Hacer usable el módulo Espejo (Mi Árbol de la Vida) en pantallas <768px. El cambio principal es convertir el `SefiraDetailPanel` en bottom sheet full-screen cuando el usuario hace tap en una sefirá (en lugar de mostrarlo apilado debajo del árbol). Además: invertir el orden del body de `AnswersGridModal` para que sefirá + scores + reflexión queden arriba en mobile, ocultar las cards flotantes del árbol en mobile, estandarizar botones de cierre en los modales, y agrandar levemente el árbol. Desktop intacto.

---

## 1. Objetivo y motivación

El Espejo es el corazón ritual del producto. En mobile hoy:

- El layout es `flex flex-col md:flex-row` — el árbol arriba, el `SefiraDetailPanel` apilado verticalmente debajo. Cuando el usuario hace tap en una sefirá, **tiene que scrollear lejos** para ver las preguntas + reflexión + historial. Pierde el contexto del árbol y el flujo "tap → ver detalle" se rompe.
- El árbol está escalado a `0.7` para entrar en mobile (280px de ancho efectivo) — las sefirot quedan chiquitas y difíciles de tappear con precisión.
- Las cards flotantes que aparecen al lado de cada sefirá (descripción + preview) están posicionadas con `LEFT_GUTTER=180` en desktop pero `0` en mobile, así que se cortan o se desbordan.
- En el `AnswersGridModal`, el body apila en mobile con las respuestas arriba y la sefirá + scores + reflexión abajo — el usuario quiere ver primero el resumen de la sefirá y después el detalle.

Este spec define los 5 cambios que dejan el Espejo verdaderamente mobile-native. Sigue el patrón del Calendar Mobile (PR #42): componentes mobile separados via `useMediaQuery`, sin afectar desktop.

---

## 2. Decisiones tomadas

| Eje | Decisión |
|---|---|
| Breakpoint | `useMediaQuery('(max-width: 767px)')` — mismo cutoff que Calendar Mobile |
| SefiraDetailPanel en mobile | Bottom sheet full-screen (~92vh) con backdrop + drag handle + X arriba a la izquierda. Reusa el componente `SefiraDetailPanel` adentro |
| Patrón del sheet | `Framer Motion` slide-up + drag-to-close, mismo patrón que `ActivityPanelMobile` |
| TREE_SCALE en mobile | Subir de `0.7` a `0.85` (340px de ancho — mejor touch target sin desbordar 375px viewport) |
| Cards flotantes del árbol | Ocultas en mobile via prop `enableFloatingCards={!isMobile}` |
| AnswersGridModal body | Mobile: sidebar (sefirá+scores+reflexión) arriba via `order-1 lg:order-2`, respuestas abajo via `order-2 lg:order-1`. Desktop intacto |
| Botones de cierre | Estandarizados en mobile: X arriba a la izquierda + drag handle. Todos los modales lo respetan |
| Out of scope | Otros módulos (Inicio, Calendario ya hecho, Evolución, Cuenta, Premium), redesign del árbol mismo, drag de sefirot, gestos avanzados |

---

## 3. Arquitectura

### 3.1 Layout de archivos

**Nuevos:**
- `frontend/src/espejo/components/SefiraDetailMobileSheet.tsx` — bottom sheet que envuelve `SefiraDetailPanel` para mobile

**Modificados:**
- `frontend/src/espejo/EspejoModule.tsx` — cuando `isMobile && selectedNode`, renderiza el sheet en lugar de la columna apilada. Ajusta `TREE_SCALE` a 0.85 en mobile. Reusa el `useMediaQuery` del shared hooks (Task 1 de Calendar Mobile ya lo creó)
- `frontend/src/espejo/components/AnswersGridModal.tsx` — agrega `order-1`/`order-2` con `lg:` reverses para invertir el orden mobile sin afectar desktop
- `frontend/src/espejo/components/SefirotInteractiveTree.tsx` — acepta prop `enableFloatingCards?: boolean` (default true). Cuando false, no renderiza las cards flotantes de cada sefirá

**Sin tocar:**
- `SefiraDetailPanel.tsx` — se reusa dentro del sheet mobile sin cambios
- `QuestionCarousel.tsx`, `ReflectionEditor.tsx`, `HistoryList.tsx`, `HistorialEntryModal.tsx` — ya manejan su propio responsive correctamente
- `ReflexionLibreEditor.tsx` — auditar la X de cierre durante implementación. Si la X no es visible/consistente en mobile, agregar el patrón estándar
- Backend (no hay cambios de API)

### 3.2 SefiraDetailMobileSheet — anatomía

```
┌─────────────────────────────────────────┐
│ ───── (drag handle)                     │
│ [X]                                     │ ← X arriba a la izquierda
│                                         │
│  <SefiraDetailPanel resumen=... />      │
│  ┌────────────────────────────────┐    │
│  │ SefiraHeader (nombre, score)   │    │
│  ├────────────────────────────────┤    │
│  │ QuestionCarousel               │    │
│  ├────────────────────────────────┤    │
│  │ HistoryList (si hay registros) │    │
│  └────────────────────────────────┘    │
│                                         │
│  (scrolleable adentro del sheet)       │
└─────────────────────────────────────────┘
```

### 3.3 Patrón técnico (idéntico a ActivityPanelMobile)

```tsx
<AnimatePresence>
  {open && (
    <motion.div className="fixed inset-0 z-[90] flex items-end">
      <motion.div                              // backdrop
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      />
      <motion.div                              // sheet
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.3}
        onDragEnd={handleDragClose}            // si offset.y > 100 → onClose
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative w-full bg-stone-950 rounded-t-3xl ... flex flex-col"
        style={{ height: '92vh' }}
      >
        {/* drag handle visible */}
        <div className="w-12 h-1 rounded-full bg-stone-600 mx-auto mt-3" />
        {/* close X */}
        <button onClick={onClose} className="absolute top-3 left-3 ..."><X /></button>
        {/* contenido scrolleable */}
        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3">
          <SefiraDetailPanel {...props} />
        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
```

Usa `useScrollLock(open)` para lockear el body cuando está abierto. Respeta `useReducedMotion()` (sin slide, solo opacity).

### 3.4 EspejoModule.tsx — integración

En el JSX donde hoy se renderiza el panel lateral (line ~205-242), agregar branching:

```tsx
{isMobile ? (
  <SefiraDetailMobileSheet
    open={selectedNode !== null && selectedResumen !== null}
    onClose={() => setSelectedId(null)}
    resumen={selectedResumen}
    description={selectedNode?.description ?? ''}
    preguntas={preguntas}
    registros={registros}
    onDataChanged={handleDataChanged}
  />
) : (
  // El panel actual (motion.div con SefiraDetailPanel adentro) queda intacto
  <motion.div className="w-full flex-1 max-w-md xl:max-w-lg mt-8 md:mt-0">...</motion.div>
)}
```

`onClose` setea `selectedId` a null → cierra el sheet + deselecciona la sefirá en el árbol.

`TREE_SCALE`:
```tsx
const TREE_SCALE = isMobile ? 0.85 : 0.95;
```

### 3.5 AnswersGridModal — order classes

En el body grid (line 270 actualmente):

```tsx
<div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div className="lg:col-span-2 order-2 lg:order-1">
    {/* Answers area */}
  </div>
  <aside className="lg:col-span-1 order-1 lg:order-2 space-y-6">
    {/* Sidebar: sefira + scores + reflexión */}
  </aside>
</div>
```

Solo agregamos `order-N lg:order-N` classes. Mobile: sidebar arriba (order-1), respuestas abajo (order-2). Desktop (lg): respuestas izquierda (lg:order-1), sidebar derecha (lg:order-2) — mismo layout actual.

### 3.6 SefirotInteractiveTree — prop opcional

Agregar a Props:
```tsx
enableFloatingCards?: boolean;  // default true
```

Donde se rendericen las cards flotantes (las que aparecen junto a cada sefirá con descripción/score preview), envolver con:
```tsx
{enableFloatingCards && /* ... existing floating cards ... */}
```

En `EspejoModule.tsx` mobile, pasar `enableFloatingCards={!isMobile}` (o `false` directo si el árbol solo se renderiza en mobile via esta prop). En desktop sigue sin cambios (default true).

---

## 4. Data flow

Desktop (sin cambios):
```
Tap sefirá → setSelectedId(id) → SefiraDetailPanel se renderiza en columna derecha
```

Mobile (nuevo):
```
Tap sefirá → setSelectedId(id) → selectedNode != null
            → SefiraDetailMobileSheet open=true → slide-up sheet
            → adentro: SefiraDetailPanel renderiza
Tap X o swipe down → onClose() → setSelectedId(null) → sheet exit anim
```

El estado `selectedId` sigue siendo la única fuente de verdad. El sheet se monta cuando `selectedId !== null && isMobile`.

---

## 5. Edge cases

### 5.1 Switching de sefirá con sheet abierto

En mobile, si el usuario está en el sheet de una sefirá y de alguna manera selecciona otra (ej. via navegación interna), el sheet debe re-renderizar con la nueva data. El `SefiraDetailPanel` ya tiene un `useEffect` con dep `[resumen.sefira_id]` que resetea modalOpen y autoOpenedFor. Solo hay que asegurar que el sheet container no remonte (key estable).

### 5.2 AutoOpen del AnswersGridModal cuando todas las preguntas están respondidas

`SefiraDetailPanel` tiene lógica para auto-abrir `AnswersGridModal` cuando `allAnswered`. En mobile, eso significa que un AnswersGridModal puede aparecer ENCIMA del SefiraDetailMobileSheet. Verificar z-indexes:

- SefiraDetailMobileSheet: z-[90] (nuevo)
- AnswersGridModal: z-[110] (ya existe)

OK — AnswersGridModal queda por encima. El MutationObserver del tour (si está activo) pausará automáticamente porque `AnswersGridModal` tiene `aria-modal="true"`.

### 5.3 Tour onboarding

El step 2 del tour (click en Tiferet) sigue funcionando — el `useTourStep(2, tiferetRef)` está en el árbol. Pero el step 3 (textarea del primer pregunta) está dentro del `QuestionCarousel`, que ahora vive dentro del sheet. El target del paso 3 (`espejo-pregunta-textarea`) sigue siendo el mismo elemento DOM — solo cambia el container. El tooltip se posicionará relativo al target sin importar dónde esté.

### 5.4 Reduced motion

Respetar `useReducedMotion()`:
- Sheet entry/exit: solo opacity, sin slide
- Backdrop: solo opacity
- Drag: deshabilitado

### 5.5 Body scroll lock

Usar `useScrollLock(open)` del shared hooks (creado en perf fixes anterior). Cuando el sheet abre, el body se lockea. Cuando cierra, se desbloquea. Si abrimos AnswersGridModal encima, su propio scroll lock counter incrementa — el body sigue lockeado hasta que ambos se cierren.

### 5.6 Cards flotantes en transición a/desde mobile

Si el usuario rota landscape ↔ portrait y cruza 768px, las cards flotantes aparecen/desaparecen. Sin animación de "morph" — solo un cambio limpio de render. Aceptable.

### 5.7 Drag-to-close vs scroll interno

El sheet tiene drag-y, pero su contenido también es scrolleable. Solución estándar: el drag se activa solo en el drag handle (los primeros ~40px del sheet). El contenido interno usa `overflow-y-auto` normal. Esto es lo que hace `ActivityPanelMobile` y funciona bien.

---

## 6. Testing

### 6.1 Automatizado

Frontend sin framework. Verificación por `tsc -b` + `vite build`.

### 6.2 Smoke test manual (devtools emulation 375px + idealmente mobile real)

```
[ ] 1. Entrar a /espejo en mobile (375px). El árbol se ve más grande que antes (~340px wide).
[ ] 2. No hay cards flotantes al lado de cada sefirá.
[ ] 3. Tap en Tiferet (centro) → bottom sheet slide-up. Backdrop oscurece el árbol.
[ ] 4. Sheet ocupa ~92vh, drag handle visible arriba.
[ ] 5. Adentro: SefiraDetailPanel completo (header, preguntas guía, historial si aplica).
[ ] 6. Tap en X arriba-izquierda → sheet cierra, vuelve al árbol con la sefirá deseleccionada.
[ ] 7. Tap otra sefirá, swipe down sobre el drag handle → sheet cierra.
[ ] 8. Tap sefirá → tap backdrop oscuro → sheet cierra.
[ ] 9. Responder preguntas → guardar → AnswersGridModal abre encima del sheet (z-110 > z-90).
[ ] 10. En el AnswersGridModal en mobile: la sefirá + scores + reflexión están ARRIBA, las respuestas debajo.
[ ] 11. Cerrar AnswersGridModal → vuelve al sheet de SefiraDetailPanel (no se cierra el sheet también).
[ ] 12. Cerrar el sheet → vuelve al árbol.
[ ] 13. Cambiar a desktop (≥768px): tap sefirá → SefiraDetailPanel aparece en columna lateral (no sheet). Cards flotantes vuelven.
[ ] 14. Desktop AnswersGridModal: layout original (respuestas izquierda, sidebar derecha).
[ ] 15. prefers-reduced-motion: ON → sheet aparece sin slide, solo opacity.
[ ] 16. Tour onboarding: limpiar localStorage.tour_espejo_done + reload → tour funciona en mobile (steps 1, 2 en árbol; step 3 dentro del sheet ahora).
```

---

## 7. Out of scope (Future)

- **Otros módulos mobile** (Inicio, Evolución, Cuenta, Premium) — solo Espejo en este spec
- **Redesign del árbol mismo** — el SVG con 10 sefirot queda igual. Solo cambia el escalado y se ocultan las cards flotantes
- **Drag de sefirot** (reordenar) — no aplica al modelo conceptual del Árbol de la Vida
- **Gestos avanzados** (pinch zoom en árbol, swipe entre sefirot dentro del sheet) — out of scope
- **Cards flotantes mobile-friendly** (ej. tooltip al lado de la sefirá tappeada) — el sheet ya da todo el contexto
- **Animación de "morph" entre árbol y sheet** (la sefirá tappeada se expande al sheet) — efecto polish, postpuesto

---

## 8. Relacionado

- [project_gcal_sync](memory) — PR #42 abierto con todo el trabajo previo incluyendo Calendar Mobile (mismo patrón)
- [2026-05-30-calendar-mobile-design.md](./2026-05-30-calendar-mobile-design.md) — spec del Calendar Mobile. Reusamos `useMediaQuery` y el patrón de bottom sheet (`ActivityPanelMobile`)
- [2026-04-25-espejo-cognitivo-redesign-design.md](./2026-04-25-espejo-cognitivo-redesign-design.md) — spec original del Espejo (desktop)
- [2026-05-30-onboarding-tour-espejo-design.md](./2026-05-30-onboarding-tour-espejo-design.md) — tour onboarding — sus targets siguen funcionando con el sheet (DOM targets persisten)
