# Onboarding Tour del Espejo (MVP)

**Fecha:** 2026-05-30
**Alcance:** Tour interactivo de 5 pasos para usuarios nuevos cuando entran por primera vez al módulo Espejo. Coachmarks contextuales con flechas apuntando a elementos reales del árbol y del flujo de reflexión. Mientras está activo, bloquea la navegación a otros módulos. No cubre Calendario, Evolución, Premium ni Cuenta — son out of scope para v1.

---

## 1. Objetivo y motivación

Kabbalah Space hoy aterriza al usuario nuevo en una landing extensa (`InicioModule` con hero + premisa + módulos + sefirot + marquee) y, una vez que entra al Espejo, ve la animación cinemática `EspejoIntro` que es coreográfica pero no enseña qué hacer. Después de eso, queda solo frente a un árbol de 10 puntos dorados sin pistas sobre dónde apretar ni qué se espera de él.

El flujo crítico del producto — click en una sefirá → responder preguntas guía → escribir reflexión libre → ver su historial — no es descubrible sin guía. El usuario nuevo que no entiende el modelo se va antes de completar el primer ciclo, perdiendo el momento "aha" que justifica volver.

Este spec define un MVP de tour que cubre ese único flujo crítico del Espejo. No intenta enseñar Calendario, Evolución o Premium — eso lo manejan los emails (`gcal_link_suggestion`, `evolucion_nudge` ya implementados) y futuros tours por módulo. La apuesta es: si el usuario entiende el ciclo del Espejo, el resto se descubre solo.

---

## 2. Decisiones tomadas

| Eje | Decisión |
|---|---|
| Alcance | MVP solo Espejo. Otros módulos quedan para tours futuros independientes |
| Trigger | Primera vez que el usuario entra al Espejo, después de que termina `EspejoIntro`. No hay botón "Ver tour" on-demand en v1 |
| Formato | Coachmarks contextuales: tooltip con flecha apuntando a elementos reales. Sin backdrop oscuro. Sin spotlight cinemático |
| Dinámica | Mixta: pasos 1-2 lineales (botón Siguiente / Saltar), pasos 3-5 contextuales (sin botones, dismiss al interactuar con el target) |
| Persistencia | `localStorage.tour_espejo_done = '1'`. No cross-device. Patrón consistente con `LOADING_FLAG` y `INTRO_FLAG` de la app |
| Stack | Custom — Framer Motion + portal. Sin librería externa (Driver.js, Shepherd.js) |
| Posicionamiento | `getBoundingClientRect()` + `placement` declarativo con fallback al opuesto cuando hay overflow. Sin Floating UI |
| Navegación durante el tour | Bloqueada visualmente (opacity + cursor) e interceptada en `setActiveView`. El único escape es "Saltar tour" |
| Reduced motion | Respetado vía `useReducedMotion()` de Framer Motion — entries/exits instantáneos |
| Out of scope | Tours de otros módulos, tour on-demand repetible, persistencia cross-device, A/B testing del copy, tour multi-idioma |

---

## 3. Arquitectura

### 3.1 Layout de archivos nuevos

```
frontend/src/onboarding/
├── TourEspejoContext.tsx       # Provider + hook useTourEspejo
├── TourTooltip.tsx              # El único tooltip que se renderiza (a nivel root vía portal)
├── tour-espejo-steps.ts        # Config declarativa de los 5 pasos
└── useTourStep.ts              # Hook que cada componente del Espejo usa para anunciarse como target
```

### 3.2 Componentes modificados

| Archivo | Cambio |
|---|---|
| `frontend/src/App.tsx` | Envuelve `<TourEspejoProvider>` adentro del `<PremiumGateProvider>`. Renderiza `<TourTooltip />` a nivel root. Intercepta `setActiveView` para bloquear navegación cuando el tour está activo |
| `frontend/src/espejo/EspejoModule.tsx` | En `handleIntroComplete`, chequea `localStorage.tour_espejo_done` y llama a `tour.start()` si no está marcado. Llama a `tour.skip()` en cleanup si se desmonta con tour activo |
| `frontend/src/espejo/components/SefirotInteractiveTree.tsx` | Llama `useTourStep('espejo-tree-root', treeRef)`. La sefirá Tiferet recibe `useTourStep('espejo-sefira-tiferet', tiferetRef)` |
| `frontend/src/espejo/components/QuestionCard.tsx` | Recibe nueva prop opcional `isFirstVisible?: boolean`. Cuando es `true`, el textarea registra `useTourStep('espejo-pregunta-textarea', textareaRef)`. El parent (probablemente `QuestionCarousel` o el `.map()` en `SefiraDetailPanel`) le pasa `isFirstVisible={i === 0}` solo a la primera card. Esto evita que múltiples QuestionCards peleen por ser el target del paso 3 |
| `frontend/src/espejo/components/ReflectionEditor.tsx` | Root del editor registra `useTourStep('espejo-reflection-editor', editorRef)` |
| `frontend/src/espejo/components/HistoryList.tsx` | Root del list registra `useTourStep('espejo-history-list', listRef)` |
| `frontend/src/inicio/components/InicioNav.tsx` | Lee `useTourEspejo().isActive`. Cuando true, los tabs no-Espejo del array `SECTIONS` (Calendario, Evolución) se renderizan con `opacity-40 pointer-events-none aria-disabled="true"` + atributo `title="Termina el tour antes de salir"`. El dropdown del avatar mantiene su lógica normal pero el `onNavigate` que dispara está cubierto por el guard de `App.tsx` (capa 2) |

### 3.3 TourEspejoContext — API

```tsx
type StepId = 1 | 2 | 3 | 4 | 5;

interface TourEspejoContextValue {
  isActive: boolean;
  currentStep: StepId | null;
  start: () => void;
  next: () => void;
  skip: () => void;
  registerTarget: (stepId: StepId, ref: RefObject<HTMLElement>) => () => void;
  getTargetRef: (stepId: StepId) => RefObject<HTMLElement> | null;
}
```

**Comportamiento:**
- `start()` — setea `isActive=true`, `currentStep=1`. No-op si ya está activo o si `localStorage.tour_espejo_done='1'`.
- `next()` — incrementa `currentStep`. Si pasa del 5, llama internamente a `_finish()` que setea el flag y cierra.
- `skip()` — marca flag + cierra inmediatamente. Único punto de salida que el usuario tiene.
- `registerTarget(stepId, ref)` — devuelve función de cleanup. Internamente guarda en un `Map<StepId, RefObject>`. Si el target del paso actual cambió, dispara re-render.
- `getTargetRef(stepId)` — devuelve `null` si nadie se registró todavía. Útil porque permite que el tooltip espere sin error cuando el target tarda en montarse (ej. el carrusel no existe hasta que el usuario clickea una sefirá).
- El value se memoíza con `useMemo` (patrón aplicado en el perf audit reciente al `PremiumGateContext`).

### 3.4 tour-espejo-steps.ts — config declarativa

```ts
export const STEPS = [
  {
    id: 1,
    targetId: 'espejo-tree-root',
    copy: 'Este es tu Árbol de la Vida. 10 dimensiones del alma.',
    placement: 'right' as const,
    mode: 'linear' as const,
  },
  {
    id: 2,
    targetId: 'espejo-sefira-tiferet',
    copy: 'Hacé click en cualquier sefirá para entrar.',
    placement: 'right' as const,
    mode: 'linear' as const,
    advanceOn: 'target-click' as const,
  },
  {
    id: 3,
    targetId: 'espejo-pregunta-textarea',
    copy: 'Respondé desde lo que estás viviendo.',
    placement: 'bottom' as const,
    mode: 'contextual' as const,
    advanceOn: 'target-focus' as const,
  },
  {
    id: 4,
    targetId: 'espejo-reflection-editor',
    copy: 'Acá escribís tu reflexión libre y nivelás la energía.',
    placement: 'left' as const,
    mode: 'contextual' as const,
    advanceOn: 'target-click' as const,
  },
  {
    id: 5,
    targetId: 'espejo-history-list',
    copy: 'Acá vas a ver todas tus reflexiones pasadas. Click en cualquiera para revisitarla.',
    placement: 'top' as const,
    mode: 'contextual' as const,
    advanceOn: 'target-click' as const,
    autoCloseAfterMs: 30000,
  },
] as const;
```

### 3.5 TourTooltip — diseño visual y comportamiento

**Estructura DOM (vía `createPortal(document.body)`):**

```
<div className="fixed z-[80]" style={{ top: X, left: Y }}>
  <motion.div className="ks-tour-tooltip">  ← card amber-300/40 border, bg stone-950/95
    <p className="ks-tour-label">Paso N de 5</p>
    <p className="ks-tour-copy">{step.copy}</p>
    {step.mode === 'linear' && (
      <div className="ks-tour-actions">
        <button onClick={tour.skip}>Saltar</button>
        <button onClick={tour.next}>Siguiente</button>
      </div>
    )}
    <div className="ks-tour-arrow" data-placement={placement} />  ← triángulo CSS
  </motion.div>
</div>
```

**Cálculo de posición:**
- `target = getTargetRef(currentStep).current`
- `rect = target.getBoundingClientRect()`
- Por `placement` preferido: tooltip se ancla 8px del lado correspondiente del rect
- Fallback: si el tooltip se sale del viewport en el lado preferido, se intenta el opuesto. Si tampoco entra, fallback final a `placement='bottom'` con `scrollIntoView({ block: 'center' })`
- En mobile (`window.innerWidth < 640`), `placement` siempre forza `'bottom'` y el ancho del tooltip es `90vw`

**Animaciones:**
- Entry: `initial={{ opacity: 0, scale: 0.95 }}` → `animate={{ opacity: 1, scale: 1 }}` con `transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}`
- Cross-fade entre pasos: `<AnimatePresence mode="wait">` con `key={currentStep}`
- Reduced motion: `useReducedMotion()` → animaciones instantáneas (`duration: 0`)

**Mecánica de avance contextual:**
- `mode === 'contextual'` + `advanceOn === 'target-focus'`: se agrega un `'focus'` listener al target. Al primer focus, llama `tour.next()` y se quita.
- `mode === 'contextual'` + `advanceOn === 'target-click'`: idem con `'click'`.
- `mode === 'linear'` + `advanceOn === 'target-click'`: idem, pero ADEMÁS muestra el botón Saltar. El listener convive con el click handler propio del target (no usamos `stopPropagation`).
- `autoCloseAfterMs`: si el paso no avanza en ese tiempo, se autocierra y marca done. Solo en paso 5.

**Pausa por modales:**
- El tooltip lee `document.querySelector('[aria-modal="true"]')` antes de renderizar. Si encuentra uno (PremiumGate, ConfirmSaveDialog, etc.) con z-index > 80, se renderiza con `opacity: 0` y `pointer-events: none` hasta que se cierre.
- Implementación: un `MutationObserver` sobre `document.body` que setea un state local `isPaused`. Cleanup al unmount.

### 3.6 useTourStep — hook de registro

```tsx
export function useTourStep(stepId: StepId, ref: RefObject<HTMLElement>) {
  const tour = useTourEspejo();
  useEffect(() => {
    if (!tour.isActive) return;
    const cleanup = tour.registerTarget(stepId, ref);
    return cleanup;
  }, [tour.isActive, stepId, ref, tour.registerTarget]);
}
```

Notar: el efecto solo corre cuando el tour está activo. Esto evita overhead cuando el tour no se está usando (mayoría de las visitas).

### 3.7 Bloqueo de navegación

**En `App.tsx`**, después del provider:

```tsx
function AppInner() {
  const [activeView, setActiveViewRaw] = useState<ViewKey>('inicio');
  const tour = useTourEspejo();

  const setActiveView = useCallback((target: ViewKey) => {
    if (tour.isActive && target !== 'espejo' && target !== 'inicio') {
      return; // bloqueado
    }
    setActiveViewRaw(target);
  }, [tour.isActive]);

  // ... el resto del componente usa setActiveView normal
}
```

Los custom events `navigate:cuenta` y `navigate:calendario` que ya existen pasan por este `setActiveView` envuelto, así que también quedan cubiertos sin tocar el dropdown del avatar.

**En `InicioNav.tsx`**, los 3 tabs del array `SECTIONS` (Espejo, Calendario, Evolución) leen `tour.isActive`. Cuando true:
- El tab activo (Espejo) queda con su estado visual normal — el usuario sigue ahí
- Los otros dos (Calendario, Evolución) se renderizan con `opacity-40 cursor-not-allowed pointer-events-none aria-disabled="true"` y atributo HTML `title="Termina el tour antes de salir"` para el tooltip nativo del browser
- No se cambia el `label` ni se agrega ícono nuevo — los tabs son text-only y mantener el estilo simple respeta la estética Templo Digital

---

## 4. Data flow del tour completo

```
1. Usuario entra a /espejo por primera vez
   └─ EspejoIntro corre (~3.5s)
       └─ onIntroComplete() → EspejoModule chequea localStorage
           └─ no encuentra 'tour_espejo_done' → tour.start()
               └─ isActive=true, currentStep=1

2. TourTooltip detecta currentStep=1
   └─ Lee getTargetRef('espejo-tree-root') → SefirotInteractiveTree ya está montado, ref existe
   └─ Calcula posición → renderiza tooltip con copy + botón Siguiente + Saltar
   └─ Usuario aprieta Siguiente → tour.next() → currentStep=2

3. currentStep=2: tooltip apunta a Tiferet (target ya registrado)
   └─ Linear con advanceOn:'target-click' → muestra botón Saltar + listener temporal en Tiferet
   └─ Usuario clickea Tiferet → SefirotInteractiveTree dispara su onClick normal (abre carrusel)
                              + listener del tour dispara tour.next() → currentStep=3

4. SefiraDetailPanel se renderiza con el carrusel
   └─ QuestionCard (la primera visible) llama useTourStep(3, textareaRef)
   └─ registerTarget se ejecuta → context emite re-render → TourTooltip ahora tiene target para currentStep=3
   └─ Contextual + advanceOn:'target-focus' → tooltip aparece sin botones
   └─ Usuario tipea en el textarea → focus → tour.next() → currentStep=4

5. Tooltip apunta al ReflectionEditor (paso 4)
   └─ Mismo patrón: contextual, target-click. Usuario clickea editor → tour.next() → currentStep=5

6. Usuario guarda su reflexión → HistoryList aparece (ahora con su entrada nueva)
   └─ HistoryList llama useTourStep(5, listRef)
   └─ TourTooltip estaba currentStep=5 esperando → ahora puede posicionarse
   └─ Contextual + target-click + autoCloseAfterMs=30000
   └─ Usuario clickea historial → tour.next() → como es el último, _finish() seteа flag + cierra
       O: 30s sin acción → autoclose silencioso + flag seteado

7. Próxima visita al Espejo: localStorage tiene el flag → tour.start() es no-op
```

---

## 5. Edge cases y consideraciones

### 5.1 Target todavía no montado
`getTargetRef(N)` devuelve `null` si nadie se registró → `TourTooltip` retorna `null` (no renderiza nada). Cuando el target se monta, el `registerTarget` dispara re-render del context → el tooltip aparece. Es esperado y silencioso, no es un bug.

### 5.2 Usuario salta del Espejo a otro módulo durante el tour
**No puede.** La navegación está bloqueada. El único escape es Saltar.

### 5.3 Usuario cierra el navegador en medio del tour
El flag `tour_espejo_done` NO se setea (solo se setea al completar paso 5 O al skip explícito). Próxima visita → el tour vuelve a arrancar desde paso 1. Esto es deseado: si cerró en medio, no entendió.

### 5.4 Paso 5 sin historial (usuario no guardó nada)
Si el usuario llegó al paso 5 sin guardar (escenario teórico: skipped los pasos por código stale), el target `espejo-history-list` no existe. Salvaguarda: `autoCloseAfterMs: 30000` cierra el tour silenciosamente y marca done.

### 5.5 Pantalla mobile / pantalla pequeña
- Tooltip ancho: `90vw` máximo, `max-width: 320px`
- Placement: siempre fallbackea a `'bottom'` con `scrollIntoView`
- Position: calculada con viewport, no document
- Tap del usuario en el target todavía funciona — el tooltip no captura el evento (no usa `pointer-events: all` en una capa overlay)

### 5.6 Modales que aparecen durante el tour
`PremiumGate`, `ConfirmSaveDialog`, `AnswersGridModal` tienen z-index 90, 100, 110, 115, 120 respectivamente — todos por encima del tooltip (z-80). Cuando alguno está abierto, el tooltip se auto-pausa (opacity 0). Al cerrarse el modal, vuelve. Implementación: `MutationObserver` sobre body buscando `[aria-modal="true"]`.

### 5.7 Reduced motion
`useReducedMotion()` de Framer Motion → si está activo, todas las transitions del tooltip pasan a `duration: 0`. El usuario igual ve los tooltips, sin animación.

### 5.8 EspejoIntro y tour superpuestos
No pueden estar a la vez. EspejoIntro tiene su propio `INTRO_FLAG` en sessionStorage. El tour solo arranca después del callback `onIntroComplete`. Sin overlap.

### 5.9 SSR / build inicial
Toda lógica de localStorage está dentro de `useEffect` o llamadas que solo ocurren en cliente. Sin acceso al storage en render. No rompe SSR (aunque hoy la app no usa SSR — defensa por las dudas).

---

## 6. Testing

### 6.1 Automatizado

El frontend no tiene framework de tests (verificado con grep — solo node_modules tienen tests, src está vacío). Para esta feature no se justifica traer Vitest solo por esto. Los chequeos automáticos son:

- **`tsc -b`**: signaturas de context, hooks y config tienen que cerrar
- **`vite build`**: no debe romper. Bundle no debería pasar de los 569 KB actuales en más de +3 KB

### 6.2 Smoke test manual

Checklist a correr al finalizar la implementación, en navegador limpio:

```
[ ] 1. localStorage.clear() en devtools
[ ] 2. /espejo → EspejoIntro corre (3-4s)
[ ] 3. Tour arranca → tooltip #1 sobre árbol → "Siguiente"
[ ] 4. Tooltip #2 apunta a Tiferet → click en Tiferet → carrusel abre + tour avanza
[ ] 5. Tooltip #3 sobre primer textarea → focus → auto-dismiss + avanza
[ ] 6. Tooltip #4 sobre ReflectionEditor → click → auto-dismiss + avanza
[ ] 7. Guardo reflexión → HistoryList aparece → tooltip #5 → click en historial → done
[ ] 8. Recargo página → entro a /espejo → tour NO aparece (flag seteado)
[ ] 9. localStorage.clear() de nuevo + entrar al Espejo + apretar "Saltar" en paso 1
[ ] 10. Recargo → confirmar que el skip también marca done
[ ] 11. Durante el tour: verificar que tabs Calendario/Evolución/Cuenta están disabled visual + interceptados
[ ] 12. Durante el tour: apretar Saltar → nav se desbloquea inmediatamente
[ ] 13. Resize a mobile (375px en devtools) → tooltips fallbackean a "bottom" sin overflow
[ ] 14. prefers-reduced-motion: ON → animaciones instantáneas
[ ] 15. Caso edge: limpiar localStorage + saltar al paso 5 sin tener historial → timeout 30s → auto-cierre silencioso
[ ] 16. Modal PremiumGate abierto durante el tour → tooltip se oculta → cerrar modal → tooltip reaparece
```

### 6.3 Follow-up opcional

Si más adelante se invierte en testing frontend, **Vitest + React Testing Library** es la elección natural (Vite ya está). Esa decisión queda fuera de este spec.

---

## 7. Out of scope (Future)

- **Tour de otros módulos** (Calendario, Evolución, Premium, Cuenta): cada uno merece su propio spec
- **Botón "Ver tour" on-demand**: feature de descubrimiento, no de retención. Puede vivir en `/cuenta` más adelante
- **Persistencia cross-device**: requiere migration backend + endpoint + sync con frontend. No justifica el costo en MVP
- **A/B testing del copy**: requiere experimentación instrumentada. Out of scope
- **Multi-idioma**: hoy la app es solo español
- **Tour skip parcial**: ej. saltar solo el paso 3 manteniendo activo el resto. Complejidad alta, beneficio bajo
- **Analítica del funnel del tour**: medir en qué paso la gente abandona. Requiere sistema de eventos que no existe hoy
- **Replay desde un paso específico**: para soporte. Out of scope para MVP

---

## 8. Relacionado

- [project_onboarding_pendiente](memory) — idea inicial anotada el 2026-05-29
- [project_emails_pendientes](memory) — el email `gcal_link_suggestion` ya implementado es el nudge externo equivalente; este tour es la cara interna
- [project_premium](memory) — copy del `PremiumGate` ya enseña qué es premium en sus modales. No hay overlap directo, pero conviene revisarlos para consistencia de tono
- [2026-04-25-espejo-cognitivo-redesign-design.md](./2026-04-25-espejo-cognitivo-redesign-design.md) — spec del Espejo, fuente del modelo conceptual que el tour enseña
