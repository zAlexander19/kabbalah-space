# Espejo Mobile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer el módulo Espejo usable en mobile. Cuando el usuario tap en una sefirá, abrir un bottom sheet full-screen (no apilado debajo del árbol). Invertir el orden del body del AnswersGridModal en mobile (sefirá arriba). Ocultar cards flotantes del árbol en mobile. Agrandar levemente el árbol (TREE_SCALE 0.7 → 0.85).

**Architecture:** Reusa el patrón de `ActivityPanelMobile` (PR #42 — Calendar Mobile) — bottom sheet con `useScrollLock`, `useReducedMotion`, drag-to-close, slide-up animation con Framer Motion. Componente nuevo `SefiraDetailMobileSheet.tsx` envuelve el existente `SefiraDetailPanel`. Switch desktop/mobile en `EspejoModule.tsx` via `useMediaQuery` (hook compartido ya creado).

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind 4 + Framer Motion. Sin tests automatizados (no hay framework configurado en el frontend) — verificación por **TypeScript compile** (`tsc -b`), **build OK** (`npm run build`), y **smoke test manual** con checklist de 16 puntos al final.

**Spec de referencia:** [docs/superpowers/specs/2026-05-31-espejo-mobile-design.md](../specs/2026-05-31-espejo-mobile-design.md)

---

## File Structure

### Archivos nuevos
- `frontend/src/espejo/components/SefiraDetailMobileSheet.tsx` — bottom sheet que envuelve `SefiraDetailPanel` para mobile

### Archivos modificados
- `frontend/src/espejo/EspejoModule.tsx` — usa `useMediaQuery` para switch desktop/mobile. Renderiza `SefiraDetailMobileSheet` cuando isMobile + selectedNode. TREE_SCALE 0.85 en mobile. Pasa `enableFloatingCards={!isMobile}` al árbol
- `frontend/src/espejo/components/AnswersGridModal.tsx` — agrega clases `order-1 lg:order-2` al aside y `order-2 lg:order-1` al div de respuestas para invertir el orden en mobile
- `frontend/src/espejo/components/SefirotInteractiveTree.tsx` — agrega prop opcional `enableFloatingCards?: boolean` (default `true`). Cuando false, no renderiza las cards flotantes que aparecen junto a cada sefirá

### Verificación (puede no requerir cambio)
- `frontend/src/espejo/ReflexionLibreEditor.tsx` — verificar que tiene X visible. Si no, agregarla

### NOT en este plan
- Otros módulos mobile (Inicio, Evolución, Cuenta, Premium)
- Redesign del árbol mismo (SVG layout)
- Drag de sefirot
- Animación de "morph" del tap al sheet
- Backend (cero cambios — solo UI)

---

## Task 1: SefirotInteractiveTree — prop `enableFloatingCards`

**Files:**
- Modify: `frontend/src/espejo/components/SefirotInteractiveTree.tsx`

- [ ] **Step 1: Leer el archivo para identificar dónde se renderizan las cards flotantes**

```bash
grep -n "absolute\|CARD\|tooltip\|description\|x - 30" "c:/Users/123/Desktop/Kabbalah Space/frontend/src/espejo/components/SefirotInteractiveTree.tsx" | head -20
```

Las cards flotantes son los elementos posicionados con `position: absolute` que aparecen al lado izquierdo/derecho de cada sefirá con preview de descripción/score. Usualmente vienen después del SVG del árbol y antes del cierre del div principal.

Identificar el bloque JSX que renderiza ese conjunto de cards. Puede ser un `{sefirot.map(s => <div className="absolute ...">...</div>)}` o un componente separado.

- [ ] **Step 2: Agregar prop opcional**

Buscar el Props type (línea ~15-25). Agregar:

```tsx
type Props = {
  // ... props existentes
  /** Si false, no renderiza las cards flotantes de descripción al lado de cada
   *  sefirá. Usado en mobile donde no hay espacio horizontal. Default true. */
  enableFloatingCards?: boolean;
};
```

En la función del componente, destructurar la prop con default true:

```tsx
export default function SefirotInteractiveTree({
  sefirot,
  selectedId,
  onSelect,
  enableFloatingCards = true,
}: Props) {
```

(Adaptar al orden exacto de destructuring actual.)

- [ ] **Step 3: Envolver el bloque de cards flotantes con la condición**

Localizar el bloque JSX identificado en Step 1. Envolverlo:

```tsx
{enableFloatingCards && (
  /* ...existing floating cards block... */
)}
```

Si las cards están en un `.map()`, envolver el `.map` entero. Si están en un componente `<FloatingCards />`, envolver ese componente.

- [ ] **Step 4: Verificar tsc + build**

```bash
cd frontend && npx tsc -b && npm run build
```
Expected: PASS. Desktop sigue mostrando las cards (default true, EspejoModule todavía no pasa la prop). No hay regresión visual.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/espejo/components/SefirotInteractiveTree.tsx
git commit -m "feat(espejo): SefirotInteractiveTree acepta enableFloatingCards opcional"
```

---

## Task 2: AnswersGridModal — invertir orden mobile via CSS `order`

**Files:**
- Modify: `frontend/src/espejo/components/AnswersGridModal.tsx`

- [ ] **Step 1: Localizar el grid del body**

El bloque está en línea ~270 con:

```tsx
<div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div className="lg:col-span-2">
    {/* Answers area */}
  </div>
  <aside className="lg:col-span-1 space-y-6">
    {/* Sidebar */}
  </aside>
</div>
```

- [ ] **Step 2: Agregar clases `order-*`**

Modificar las 2 clases:

```tsx
<div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div className="lg:col-span-2 order-2 lg:order-1">
    {/* Answers area */}
  </div>
  <aside className="lg:col-span-1 order-1 lg:order-2 space-y-6">
    {/* Sidebar */}
  </aside>
</div>
```

Cambios exactos:
- En el `<div className="lg:col-span-2">`: agregar ` order-2 lg:order-1`
- En el `<aside className="lg:col-span-1 space-y-6">`: agregar ` order-1 lg:order-2`

Resultado:
- Mobile (<lg, sin `lg:` clases activas): aside con `order-1` (arriba), div con `order-2` (abajo)
- Desktop (lg+): div con `lg:order-1` (a la izquierda, primera col), aside con `lg:order-2` (a la derecha, última col) — exactamente igual que ahora

- [ ] **Step 3: Verificar tsc + build**

```bash
cd frontend && npx tsc -b && npm run build
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/espejo/components/AnswersGridModal.tsx
git commit -m "feat(espejo): AnswersGridModal sidebar va arriba en mobile (sefirá + scores + reflexión)"
```

---

## Task 3: SefiraDetailMobileSheet — crear bottom sheet

**Files:**
- Create: `frontend/src/espejo/components/SefiraDetailMobileSheet.tsx`

- [ ] **Step 1: Crear el archivo con este contenido EXACTO:**

```tsx
// frontend/src/espejo/components/SefiraDetailMobileSheet.tsx
//
// Bottom sheet que envuelve SefiraDetailPanel para mobile. Misma estructura
// que ActivityPanelMobile del Calendar Mobile (PR #42):
// - slide-up con spring
// - backdrop tap cierra
// - drag handle arriba
// - drag-to-close (offset.y > 100px)
// - X arriba a la izquierda
// - useScrollLock para body
// - useReducedMotion respetado

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useScrollLock } from '../../shared/hooks/useScrollLock';
import SefiraDetailPanel from './SefiraDetailPanel';
import type { SefiraResumen, PreguntaConEstado, Registro } from '../types';

type Props = {
  open: boolean;
  onClose: () => void;
  resumen: SefiraResumen | null;
  description: string;
  preguntas: PreguntaConEstado[];
  registros: Registro[];
  onDataChanged: () => void;
};

const SHEET_HEIGHT_VH = 92;
const CLOSE_THRESHOLD_PX = 100;

export default function SefiraDetailMobileSheet({
  open,
  onClose,
  resumen,
  description,
  preguntas,
  registros,
  onDataChanged,
}: Props) {
  const reduced = useReducedMotion();
  useScrollLock(open);

  function handleDragEnd(_: unknown, info: { offset: { y: number } }) {
    if (info.offset.y > CLOSE_THRESHOLD_PX) onClose();
  }

  return createPortal(
    <AnimatePresence>
      {open && resumen && (
        <motion.div
          key="sefira-sheet-overlay"
          className="fixed inset-0 z-[90] flex items-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="sefira-sheet"
            drag={reduced ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.3}
            onDragEnd={handleDragEnd}
            initial={reduced ? { y: 0 } : { y: '100%' }}
            animate={{ y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: '100%' }}
            transition={reduced ? { duration: 0 } : { type: 'spring', damping: 30, stiffness: 300 }}
            className="relative w-full bg-[#15181d] rounded-t-3xl border-t border-stone-800/60 shadow-[0_-12px_40px_rgba(0,0,0,0.6)] flex flex-col"
            style={{ height: `${SHEET_HEIGHT_VH}vh` }}
            role="dialog"
            aria-modal="true"
            aria-label={`Detalle de ${resumen.sefira_nombre}`}
          >
            {/* Drag handle */}
            <div className="shrink-0 flex justify-center pt-3 pb-1">
              <div className="w-12 h-1 rounded-full bg-stone-600" />
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="absolute top-3 left-3 w-9 h-9 flex items-center justify-center rounded-full bg-stone-900/80 hover:bg-stone-800 text-stone-300 z-10"
            >
              <X size={18} />
            </button>

            {/* Sheet content — scroleable adentro */}
            <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3">
              <SefiraDetailPanel
                resumen={resumen}
                description={description}
                preguntas={preguntas}
                registros={registros}
                onDataChanged={onDataChanged}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
```

- [ ] **Step 2: Verificar tsc + build**

```bash
cd frontend && npx tsc -b && npm run build
```
Expected: PASS. Si falla por algún import, verificar:
- `useScrollLock` está en `frontend/src/shared/hooks/useScrollLock.ts`
- `SefiraDetailPanel` es default export de `./SefiraDetailPanel`
- Los types `SefiraResumen`, `PreguntaConEstado`, `Registro` están en `../types`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/espejo/components/SefiraDetailMobileSheet.tsx
git commit -m "feat(espejo): SefiraDetailMobileSheet bottom sheet con drag-to-close"
```

---

## Task 4: EspejoModule — integración switch desktop/mobile

**Files:**
- Modify: `frontend/src/espejo/EspejoModule.tsx`

- [ ] **Step 1: Reemplazar el `useState(isMobile)` manual por el hook compartido**

`EspejoModule.tsx` ya tiene su propio `useState` + `useEffect` que escucha `matchMedia('(max-width: 767px)')`. Reemplazarlo con el hook compartido `useMediaQuery` (creado en Calendar Mobile).

Buscar este bloque (alrededor de línea 134-143):

```tsx
const [isMobile, setIsMobile] = useState<boolean>(() =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
);
useEffect(() => {
  if (typeof window === 'undefined') return;
  const mq = window.matchMedia('(max-width: 767px)');
  const handler = () => setIsMobile(mq.matches);
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}, []);
```

Reemplazar por:

```tsx
const isMobile = useMediaQuery('(max-width: 767px)');
```

Agregar al import block al inicio del archivo:

```tsx
import { useMediaQuery } from '../shared/hooks/useMediaQuery';
```

(Adaptar la ruta relativa — desde `frontend/src/espejo/EspejoModule.tsx` la ruta correcta es `'../shared/hooks/useMediaQuery'`.)

- [ ] **Step 2: Subir TREE_SCALE en mobile**

Buscar la línea:

```tsx
const TREE_SCALE = isMobile ? 0.7 : 0.95;
```

Reemplazar por:

```tsx
const TREE_SCALE = isMobile ? 0.85 : 0.95;
```

- [ ] **Step 3: Agregar import de SefiraDetailMobileSheet**

En el bloque de imports al inicio del archivo, agregar:

```tsx
import SefiraDetailMobileSheet from './components/SefiraDetailMobileSheet';
```

- [ ] **Step 4: Pasar `enableFloatingCards={!isMobile}` al árbol**

Buscar el JSX donde se renderiza `<SefirotInteractiveTree>` (cerca de línea 172). Agregar la prop:

```tsx
<SefirotInteractiveTree
  sefirot={sefirot}
  selectedId={selectedId}
  onSelect={setSelectedId}
  enableFloatingCards={!isMobile}
/>
```

- [ ] **Step 5: Branchear el render del SefiraDetailPanel**

Buscar el bloque `<motion.div>` que envuelve `<SefiraDetailPanel>` (alrededor de línea 205-242):

```tsx
<motion.div
  initial={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : 30 }}
  animate={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : 30 }}
  transition={{ duration: 0.7, delay: pageRevealed ? 0.75 : 0, ease }}
  className="w-full flex-1 max-w-md xl:max-w-lg mt-8 md:mt-0"
>
  <div className={`p-8 sm:p-10 rounded-3xl min-h-[500px] ${glassEffect}`}>
    <AnimatePresence mode="wait">
      {selectedNode && selectedResumen ? (
        <motion.div key={selectedNode.id} ...>
          <SefiraDetailPanel ... />
        </motion.div>
      ) : (
        <motion.div key="empty" ...>
          <EmptyState />
        </motion.div>
      )}
    </AnimatePresence>
  </div>
</motion.div>
```

Reemplazar por (preservar el bloque existente como branch desktop):

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
  <motion.div
    initial={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : 30 }}
    animate={{ opacity: pageRevealed ? 1 : 0, x: pageRevealed ? 0 : 30 }}
    transition={{ duration: 0.7, delay: pageRevealed ? 0.75 : 0, ease }}
    className="w-full flex-1 max-w-md xl:max-w-lg mt-8 md:mt-0"
  >
    <div className={`p-8 sm:p-10 rounded-3xl min-h-[500px] ${glassEffect}`}>
      <AnimatePresence mode="wait">
        {selectedNode && selectedResumen ? (
          <motion.div
            key={selectedNode.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <SefiraDetailPanel
              resumen={selectedResumen}
              description={selectedNode.description}
              preguntas={preguntas}
              registros={registros}
              onDataChanged={handleDataChanged}
            />
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <EmptyState />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  </motion.div>
)}
```

Importante: copiar el contenido EXACTO del bloque desktop (no parafrasear). Lo que se está agregando es solo el `isMobile ? sheet : (... existing block ...)` ternario.

- [ ] **Step 6: Verificar tsc + build**

```bash
cd frontend && npx tsc -b && npm run build
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/espejo/EspejoModule.tsx
git commit -m "feat(espejo): EspejoModule mobile usa SefiraDetailMobileSheet + TREE_SCALE 0.85 + oculta cards flotantes"
```

---

## Task 5: ReflexionLibreEditor — verificar X visible

**Files:**
- Verify (possibly modify): `frontend/src/espejo/ReflexionLibreEditor.tsx`

- [ ] **Step 1: Inspeccionar el modal y buscar el botón de cierre**

```bash
grep -n "onClose\|<X\|aria-label.*Cerrar\|✕\|close" "c:/Users/123/Desktop/Kabbalah Space/frontend/src/espejo/ReflexionLibreEditor.tsx" | head -20
```

Mirar específicamente si hay un botón con ícono X o "Cerrar" visible en el header del modal, y si tiene posicionamiento `absolute top-X`.

- [ ] **Step 2: Decisión**

**Caso A**: si ya hay una X visible posicionada arriba (`top-3` o similar) con ícono claro → **NO HAY CAMBIO**. Saltar al Step 4 sin commit.

**Caso B**: si la X no está visible, está mal posicionada, o se confunde con otros elementos → agregar el patrón estándar mobile (X arriba a la izquierda):

Si el componente tiene un container raíz con position relative, agregar al inicio del contenido:

```tsx
<button
  type="button"
  onClick={onClose}
  aria-label="Cerrar"
  className="absolute top-3 left-3 w-9 h-9 flex items-center justify-center rounded-full bg-stone-900/80 hover:bg-stone-800 text-stone-300 z-10"
>
  <X size={18} />
</button>
```

Agregar el import de `lucide-react`:
```tsx
import { X } from 'lucide-react';
```

Si el componente NO tiene un container relative al borde superior, identificar el wrapper apropiado y agregarlo con `position: relative` antes de meter el botón.

- [ ] **Step 3: Verificar tsc + build (si hubo cambios)**

```bash
cd frontend && npx tsc -b && npm run build
```

- [ ] **Step 4: Commit (si hubo cambios)**

```bash
git add frontend/src/espejo/ReflexionLibreEditor.tsx
git commit -m "feat(espejo): ReflexionLibreEditor X de cierre visible en mobile"
```

Si no hubo cambios (Caso A), reportar el archivo como "no requiere cambios" y saltar al siguiente task.

---

## Task 6: QA final — build verde + smoke test manual + push

**Files:** ninguno modificado (solo verificación)

- [ ] **Step 1: Build limpio**

```bash
cd "c:/Users/123/Desktop/Kabbalah Space/frontend"
npm run build
```

Expected: PASS. Bundle delta esperado: ~+5-7 KB sobre los 593 KB actuales por el nuevo `SefiraDetailMobileSheet` (~150 líneas + reuso de hooks ya en bundle).

- [ ] **Step 2: Arrancar dev server + backend**

```bash
# Terminal 1 — backend
cd "c:/Users/123/Desktop/Kabbalah Space/backend"
venv/Scripts/python.exe -m uvicorn main:app --reload --port 8000
```

```bash
# Terminal 2 — frontend
cd "c:/Users/123/Desktop/Kabbalah Space/frontend"
npm run dev
```

- [ ] **Step 3: Smoke test mobile (devtools emulation 375px)**

Chrome → F12 → toggle device toolbar → iPhone SE (375×667). Login + entrar a `/espejo`.

```
[ ] 1. Entrar a /espejo en mobile. El árbol se ve más grande que antes (~340px wide en lugar de 280px).
[ ] 2. No hay cards flotantes al lado de cada sefirá (con descripción/score preview).
[ ] 3. Tap en Tiferet (centro) → bottom sheet slide-up con animación spring. Backdrop oscurece el árbol.
[ ] 4. Sheet ocupa ~92vh. Drag handle (barrita gris) visible arriba.
[ ] 5. Adentro: SefiraDetailPanel completo (header, preguntas guía, historial si aplica).
[ ] 6. Tap en X arriba-izquierda → sheet cierra con slide-down. Vuelve al árbol con la sefirá deseleccionada.
[ ] 7. Tap otra sefirá → swipe down sobre el drag handle (>100px) → sheet cierra.
[ ] 8. Tap sefirá → tap backdrop oscuro → sheet cierra.
[ ] 9. Tap sefirá → responder preguntas → guardar → AnswersGridModal abre encima del sheet.
[ ] 10. En el AnswersGridModal en mobile: SEFIRÁ + SCORES + REFLEXIÓN están ARRIBA, las respuestas DEBAJO.
[ ] 11. Cerrar AnswersGridModal → vuelve al sheet de SefiraDetailPanel (no se cierra el sheet también).
[ ] 12. Cerrar el sheet → vuelve al árbol.
```

- [ ] **Step 4: Smoke test desktop (verificar no regresión)**

Cerrar device toolbar (volver a ancho desktop ≥768px). Recargar /espejo.

```
[ ] 13. Cambiar a desktop (≥768px). Recargar.
[ ] 14. Árbol con TREE_SCALE 0.95. Cards flotantes vuelven a aparecer al hover/click sobre cada sefirá.
[ ] 15. Tap sefirá → SefiraDetailPanel aparece en COLUMNA LATERAL DERECHA (no sheet). Layout original intacto.
[ ] 16. AnswersGridModal desktop: respuestas izquierda (col-span-2), sidebar derecha (col-span-1). Layout original.
```

- [ ] **Step 5: Smoke test edge cases**

```
[ ] 17. Rotar a landscape (devtools): si <768px (ej. 667×375 mobile horizontal), sigue siendo sheet.
[ ] 18. Resize a tablet vertical (768px): pasa a columna lateral. Cards flotantes reaparecen.
[ ] 19. Enable prefers-reduced-motion → sheet aparece sin slide, solo opacity.
[ ] 20. Tour: limpiar localStorage.tour_espejo_done + reload. Step 1 (árbol), Step 2 (Tiferet) funcionan. Step 3 (textarea de pregunta dentro del sheet): tooltip se posiciona correctamente sobre el textarea aunque esté dentro del sheet.
```

Si alguno falla, NO marcar Task 6 como done. Diagnosticar + sub-task para fix + volver al checklist.

- [ ] **Step 6: Push del branch**

```bash
git push origin feat/gcal-sync
```

---

## Self-Review

### Spec coverage
- ✓ Sección 2 decisión "SefiraDetailMobileSheet" → Task 3
- ✓ Sección 2 decisión "TREE_SCALE 0.85" → Task 4 Step 2
- ✓ Sección 2 decisión "Cards flotantes ocultas" → Task 1 + Task 4 Step 4 (pasa la prop)
- ✓ Sección 2 decisión "AnswersGridModal sidebar arriba" → Task 2
- ✓ Sección 2 decisión "Botones de cierre estandarizados" → Task 3 (sheet tiene X arriba-izq) + Task 5 (verifica ReflexionLibreEditor)
- ✓ Sección 3.1 layout archivos → tasks 1-5 cubren los 3 modificados + 1 nuevo + 1 verificación
- ✓ Sección 3.2 anatomía del sheet → Task 3 código completo
- ✓ Sección 3.3 patrón técnico (idéntico a ActivityPanelMobile) → Task 3
- ✓ Sección 3.4 EspejoModule integración → Task 4
- ✓ Sección 3.5 AnswersGridModal order → Task 2
- ✓ Sección 3.6 SefirotInteractiveTree prop → Task 1
- ✓ Sección 5 edge cases → cubiertos en task 6 smoke test (puntos 17-20)
- ✓ Sección 6 testing → Task 6

### Type consistency
- `enableFloatingCards?: boolean` (default true) — Task 1 define, Task 4 Step 4 consume
- `SefiraDetailMobileSheetProps` (open, onClose, resumen, description, preguntas, registros, onDataChanged) — Task 3 define, Task 4 Step 5 consume con las mismas claves
- `useMediaQuery('(max-width: 767px)')` — Task 4 Step 1 lo usa, ya existe en `frontend/src/shared/hooks/useMediaQuery.ts` (de Calendar Mobile PR #42)
- `useScrollLock(open)` — Task 3 lo usa, ya existe en `frontend/src/shared/hooks/useScrollLock.ts` (de perf fixes anterior)

### Placeholder scan
- No "TBD" / "TODO" / "implement later" en steps
- Task 5 tiene un Decision branch (Caso A vs Caso B) — no es placeholder, es lógica condicional legítima dependiendo del estado actual del componente. El step describe ambos paths exactamente
- Task 6 es meta-task de QA — no requiere código
