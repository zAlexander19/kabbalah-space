# Rediseño Espejo Cognitivo — Spec

**Fecha:** 2026-04-25
**Alcance:** Rediseñar el módulo "Espejo Cognitivo" (vista de árbol Sefirótico interactivo + panel de evaluación) para combinar refinamiento estético tipo "Templo digital", flujo unificado sin tabs, ver respuestas previas integradas, persistencia de scores IA, cooldown de 30 días en preguntas guía, y "susurros del árbol" — cards animadas rotativas con fragmentos de reflexiones.

---

## 1. Objetivo

Hoy el Espejo Cognitivo es funcional pero plano:
- Click sefirá → preview con descripción → "Iniciar Análisis" → tabs (Preguntas / Reflexión).
- Las respuestas guardadas no se ven más después de escribirlas.
- El score IA se devuelve pero no se persiste.
- El árbol no refleja el estado de tu trabajo introspectivo.

Esta feature transforma la vista en un espacio que **respira con tu actividad**: el árbol comunica visualmente dónde está fresco tu trabajo y dónde necesita visita; el panel muestra tu trayectoria; y un sistema de "susurros" rotativos muestra fragmentos de tus reflexiones pasadas, ordenados por score, durante el estado idle.

---

## 2. Decisiones tomadas (de la fase brainstorming)

| Eje | Decisión |
|---|---|
| Estética | Templo digital (consistente con el calendario) |
| Flujo | Sin tabs ni paso intermedio "preview". Click sefirá → panel scrolleable directo. |
| Empty state por sefirá | Solo header + bloque "Nueva reflexión". Resto de secciones se renderizan cuando hay data. |
| Cooldown | Solo aplica a preguntas guía: 30 días desde última respuesta por pregunta. Reflexión global libre. |
| Ventana de "fresco" | Últimos 30 días (alineado con el cooldown). |
| Persistencia | `/evaluate` ahora persiste a `RegistroDiario`. |
| Visualización del árbol | Tinting (intensidad de orbes y halos) según ratio `preguntas_frescas / preguntas_total`. Sin números encima. |
| Cards rotativas | Sí — un susurro por sefirá, ~5s cada una, orden por score IA descendente, pausa en hover/selección. |
| Out of scope | Auth/multi-user, gráficos de evolución temporal completos (sparkline solo en stat de score promedio), edición de respuestas pasadas, exportación. |

---

## 3. Arquitectura de componentes

Hoy todo vive en `frontend/src/App.tsx` (~390 líneas que mezclan App, navegación, espejo, fetch, evaluate, slider con manipulación directa de DOM). Repetimos el patrón del refactor del calendario.

### 3.1 Estructura propuesta

```
frontend/src/
  shared/
    tokens.ts                          ← migrado desde calendar/tokens.ts
  espejo/
    EspejoModule.tsx                   ← orquestador, ~150 líneas
    types.ts                           ← tipos: SefiraSummary, QuestionState, Registro
    hooks/
      useEspejoSummary.ts              ← fetch /espejo/resumen
      useSefiraData.ts                 ← fetch /respuestas/{id} + /registros/{id}
      useReflectionRotation.ts         ← timer + cursor del carrusel de susurros
    components/
      SefirotInteractiveTree.tsx       ← árbol grande con tinting
      EmptyState.tsx                   ← lado derecho cuando no hay sefirá seleccionada
      RotatingReflectionPreview.tsx    ← card flotante de susurros
      SefiraDetailPanel.tsx            ← contenedor scrolleable
      SefiraHeader.tsx                 ← nombre + descripción + 3 stats con sparkline
      LastReflection.tsx               ← card colapsada de la última reflexión
      GuideQuestionsList.tsx           ← preguntas con cooldown
      QuestionCard.tsx                 ← una pregunta (3 estados: nueva/vencida/bloqueada)
      ReflectionEditor.tsx             ← slider + textarea + evaluate
      HistoryList.tsx                  ← lista colapsable de reflexiones pasadas
```

`App.tsx` queda ~140 líneas (App shell + navegación + bug del título corregido). El módulo `espejo/` importa tokens compartidos de `shared/`.

### 3.2 Migración de tokens compartidos

Mover `frontend/src/calendar/tokens.ts` → `frontend/src/shared/tokens.ts`. Actualizar todos los imports del módulo calendar (uso de search-and-replace). Los tokens son:

- `ink` (colores: void, obsidian, basalt, ash, bone, ember, emberSoft, border)
- `motion` (timings: swift, flowing, unveil, breath, stagger)
- `space`
- `SEFIRA_COLORS`
- `CONNECTIONS`
- `API_BASE`

Sin cambios de contenido, solo de path.

---

## 4. Backend

### 4.1 Schema sin cambios

Las tablas `RegistroDiario` y `RespuestaPregunta` ya existen en [backend/models.py](backend/models.py) con todos los campos necesarios (`sefira_id`, `puntuacion_usuario`, `puntuacion_ia`, `reflexion_texto`, `fecha_registro`, `respuesta_texto`, `pregunta_id`, `usuario_id`).

Como no hay autenticación en el sistema actual, todas las queries y escrituras van con `usuario_id = NULL`. El campo queda en el schema para la futura migración a multi-user; las queries simplemente lo ignoran (no filtran por usuario).

### 4.2 Endpoint modificado: `POST /respuestas` (cooldown 30d)

```python
@app.post("/respuestas")
async def save_respuesta(rep: RespuestaCreate, db: AsyncSession = Depends(get_db)):
    last = (await db.execute(
        select(RespuestaPregunta)
        .where(RespuestaPregunta.pregunta_id == rep.pregunta_id)
        .order_by(RespuestaPregunta.fecha_registro.desc())
        .limit(1)
    )).scalars().first()

    if last:
        next_available = last.fecha_registro + timedelta(days=30)
        if next_available > datetime.utcnow():
            raise HTTPException(
                status_code=409,
                detail=f"Esta pregunta vuelve a estar disponible el {next_available.date().isoformat()}",
            )

    nueva = RespuestaPregunta(pregunta_id=rep.pregunta_id, respuesta_texto=rep.respuesta_texto)
    db.add(nueva)
    await db.commit()
    await db.refresh(nueva)
    return nueva
```

### 4.3 Endpoint modificado: `POST /evaluate` (persistencia)

```python
class EvaluationRequest(BaseModel):
    sefira: str          # nombre, mantenido por compat con frontend actual
    sefira_id: str       # nuevo, requerido para persistir
    text: str
    score: float

@app.post("/evaluate", response_model=EvaluationResponse)
async def evaluate(request: EvaluationRequest, db: AsyncSession = Depends(get_db)):
    await asyncio.sleep(1)
    ai_score = min(10.0, max(1.0, request.score + random.choice([-1.5, -0.5, 0.0, 0.5, 1.5])))
    feedback = (
        f"Análisis del Espejo Cognitivo para {request.sefira}:\n"
        f"El texto '[...]' denota una energía particular que requirió un ajuste áurico."
    )

    registro = RegistroDiario(
        sefira_id=request.sefira_id,
        reflexion_texto=request.text,
        puntuacion_usuario=int(round(request.score)),
        puntuacion_ia=int(round(ai_score)),
    )
    db.add(registro)
    await db.commit()

    return EvaluationResponse(ai_score=ai_score, feedback=feedback)
```

### 4.4 Endpoints nuevos

**`GET /respuestas/{sefira_id}`** — preguntas con su estado de cooldown:

```python
class PreguntaConEstado(BaseModel):
    pregunta_id: str
    texto_pregunta: str
    ultima_respuesta: Optional[str] = None
    fecha_ultima: Optional[datetime] = None
    siguiente_disponible: Optional[date] = None
    bloqueada: bool = False
    dias_restantes: Optional[int] = None

@app.get("/respuestas/{sefira_id}", response_model=list[PreguntaConEstado])
async def get_respuestas_estado(sefira_id: str, db: AsyncSession = Depends(get_db)):
    preguntas = (await db.execute(
        select(PreguntaSefira).where(PreguntaSefira.sefira_id == sefira_id)
    )).scalars().all()

    today = datetime.utcnow()
    out: list[PreguntaConEstado] = []
    for p in preguntas:
        last = (await db.execute(
            select(RespuestaPregunta)
            .where(RespuestaPregunta.pregunta_id == p.id)
            .order_by(RespuestaPregunta.fecha_registro.desc())
            .limit(1)
        )).scalars().first()

        if last is None:
            out.append(PreguntaConEstado(
                pregunta_id=p.id, texto_pregunta=p.texto_pregunta,
            ))
            continue

        next_avail = last.fecha_registro + timedelta(days=30)
        bloqueada = next_avail > today
        dias = max(0, (next_avail.date() - today.date()).days) if bloqueada else None
        out.append(PreguntaConEstado(
            pregunta_id=p.id,
            texto_pregunta=p.texto_pregunta,
            ultima_respuesta=last.respuesta_texto,
            fecha_ultima=last.fecha_registro,
            siguiente_disponible=next_avail.date() if bloqueada else None,
            bloqueada=bloqueada,
            dias_restantes=dias,
        ))
    return out
```

Nota: el endpoint `GET /preguntas/{sefira_id}` actual queda en uso para AdminPanel.tsx (que solo necesita la lista cruda). No se toca para no romper esa vista.

**`GET /registros/{sefira_id}`** — historial de reflexiones:

```python
class RegistroOut(BaseModel):
    id: str
    reflexion_texto: str
    puntuacion_usuario: Optional[int]
    puntuacion_ia: Optional[int]
    fecha_registro: datetime

@app.get("/registros/{sefira_id}", response_model=list[RegistroOut])
async def get_registros(sefira_id: str, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(RegistroDiario)
        .where(RegistroDiario.sefira_id == sefira_id)
        .order_by(RegistroDiario.fecha_registro.desc())
    )).scalars().all()
    return [
        RegistroOut(
            id=r.id, reflexion_texto=r.reflexion_texto,
            puntuacion_usuario=r.puntuacion_usuario,
            puntuacion_ia=r.puntuacion_ia, fecha_registro=r.fecha_registro,
        )
        for r in rows
    ]
```

**`GET /espejo/resumen`** — agregado por sefirá para alimentar tinting + carrusel:

```python
class SefiraResumen(BaseModel):
    sefira_id: str
    sefira_nombre: str
    preguntas_total: int
    preguntas_frescas: int
    preguntas_disponibles: int
    score_ia_promedio: Optional[float] = None
    score_ia_ultimos: list[int] = []          # últimos 8, oldest→newest, para sparkline
    ultima_reflexion_texto: Optional[str] = None
    ultima_reflexion_score: Optional[int] = None
    ultima_actividad: Optional[datetime] = None
    intensidad: float = 0.0                   # 0..1, para tinting

@app.get("/espejo/resumen", response_model=list[SefiraResumen])
async def espejo_resumen(db: AsyncSession = Depends(get_db)):
    sefirot = (await db.execute(select(Sefira).order_by(Sefira.nombre))).scalars().all()
    today = datetime.utcnow()
    treshold = today - timedelta(days=30)

    out: list[SefiraResumen] = []
    for s in sefirot:
        preguntas = (await db.execute(
            select(PreguntaSefira.id).where(PreguntaSefira.sefira_id == s.id)
        )).scalars().all()
        total = len(preguntas)

        frescas = 0
        disponibles = 0
        for pid in preguntas:
            last = (await db.execute(
                select(RespuestaPregunta.fecha_registro)
                .where(RespuestaPregunta.pregunta_id == pid)
                .order_by(RespuestaPregunta.fecha_registro.desc()).limit(1)
            )).scalars().first()
            if last is None:
                disponibles += 1
                continue
            if last >= treshold:
                frescas += 1
            else:
                disponibles += 1

        regs = (await db.execute(
            select(RegistroDiario)
            .where(RegistroDiario.sefira_id == s.id)
            .order_by(RegistroDiario.fecha_registro.desc())
        )).scalars().all()

        ia_scores = [r.puntuacion_ia for r in regs if r.puntuacion_ia is not None]
        score_promedio = round(sum(ia_scores) / len(ia_scores), 1) if ia_scores else None
        ultimos = [r.puntuacion_ia for r in regs[:8] if r.puntuacion_ia is not None][::-1]

        ultima = regs[0] if regs else None

        intensidad = (frescas / total) if total > 0 else 0.0

        out.append(SefiraResumen(
            sefira_id=s.id, sefira_nombre=s.nombre,
            preguntas_total=total, preguntas_frescas=frescas, preguntas_disponibles=disponibles,
            score_ia_promedio=score_promedio,
            score_ia_ultimos=ultimos,
            ultima_reflexion_texto=ultima.reflexion_texto if ultima else None,
            ultima_reflexion_score=ultima.puntuacion_ia if ultima else None,
            ultima_actividad=ultima.fecha_registro if ultima else None,
            intensidad=intensidad,
        ))
    return out
```

Performance: con 10 sefirot, este endpoint hace ~30 queries (3 por sefirá). Aceptable para el scope (1 user, SQLite). Si crece, optimizar con joins agregados.

---

## 5. Frontend — Árbol con tinting (`SefirotInteractiveTree.tsx`)

Mantengo el árbol grande actual (vidrio glossy, letras hebreas en conexiones) — es la identidad visual del módulo. Cambios:

### 5.1 Tinting por intensidad

Cada nodo recibe `intensidad: number` (0..1). Aplico:

```tsx
opacityFinal = 0.4 + intensidad * 0.6
haloScale    = 1 + intensidad * 0.8       // halo crece según actividad
```

El halo es un círculo SVG con `feGaussianBlur stdDeviation="8"` del color de la sefirá. Sin actividad: halo casi invisible. Con actividad plena: halo radiante.

### 5.2 Hover sobre nodo

Mismo tooltip flotante que ya tiene el árbol del calendario:

```
┌──────────────────────────────────┐
│ JÉSED                            │
│ La Misericordia. Generosidad...  │
│ 3 disponibles · IA 7.4 · hace 3d │
└──────────────────────────────────┘
```

Aparece con `cal-fade-in`. Position: arriba del orbe, alineado al centro.

### 5.3 Sefirá seleccionada

Se mantiene: scale 1.10 + ring dorado. Ring usa `cal-breath-ring` (CSS) para respiración suave.

### 5.4 Animación al recibir nueva data

Cuando el resumen se refresca (después de guardar respuesta o evaluar reflexión), si la `intensidad` de una sefirá subió, animo:

- `motion.animate` sobre el halo: glow pulsa una vez (scale 1 → 1.4 → 1, opacity 0.6 → 1 → 0.6, 1.5s).
- Esto da feedback visual de "tu acción iluminó esa parte del alma".

### 5.5 Letras hebreas en conexiones

Mantengo el rendering actual (text-anchor middle, fill ámbar tenue). No animar — quedan como decoración estática del templo.

---

## 6. Frontend — Panel de detalle (`SefiraDetailPanel.tsx`)

Layout vertical scrolleable. Render con `staggerChildren: 0.05` para que las secciones aparezcan en cascada al seleccionar la sefirá.

### 6.1 SefiraHeader

```
┌──────────────────────────────────────────────────────┐
│ Jésed                                                │  serif 4xl, glow
│ ─────────                                            │  divisor dorado fino
│ La Misericordia. Generosidad y amor incondicional.   │
│                                                      │
│ ┌─────────┐  ┌──────────────────┐  ┌──────────────┐ │
│ │  3/5    │  │  IA 7.4  ▂▃▅▆▇  │  │ hace 3 días  │ │
│ │ disp.   │  │  promedio sparkl.│  │ últ. activ.  │ │
│ └─────────┘  └──────────────────┘  └──────────────┘ │
└──────────────────────────────────────────────────────┘
```

- **Stat 1**: `preguntas_disponibles / preguntas_total` con label "Reflexiones disponibles".
- **Stat 2**: `score_ia_promedio` con sparkline mini horizontal de 8 puntos (canvas o SVG simple, ~80×20px) usando `score_ia_ultimos`.
- **Stat 3**: "hace N días" calculado desde `ultima_actividad`. Si no hay actividad: "Sin reflexiones aún".
- Las stats con `cal-fade-in` al cambiar de sefirá. El número del score promedio anima un count-up rápido (200ms) cuando cambia.

### 6.2 LastReflection (colapsable)

Solo se renderiza si `ultima_reflexion_texto != null`.

```
┌──────────────────────────────────────────┐
│ ▼ Tu última reflexión · hace 3d · IA 7.5 │
│                                          │
│ "Esta semana sentí que mi jésed estaba   │
│  un poco bloqueado por agotamiento..."   │
│                                          │
│ Score IA: 7/10                           │
│ "El texto denota una energía particular  │
│  que requirió un ajuste áurico."         │
└──────────────────────────────────────────┘
```

- Header siempre visible. Click sobre header expande/colapsa el cuerpo con `motion.div` `animate={{ height: 'auto' }}`.
- Default: colapsada.
- Solo muestra el texto truncado si está colapsada (no, mejor: solo header. Si querés ver, click).

### 6.3 GuideQuestionsList + QuestionCard

Lista vertical de las preguntas registradas para esa sefirá. Cada `QuestionCard` tiene 3 estados según el response del backend:

**Nueva** (`ultima_respuesta == null`):

```tsx
<div className="rounded-xl border border-stone-700/40 p-4 space-y-3">
  <p className="text-sm text-stone-200">{texto_pregunta}</p>
  <textarea
    value={localText}
    onChange={...}
    onBlur={handleSubmit}
    placeholder="Escribí tu reflexión..."
    className="w-full bg-[#1b1f25] ..."
  />
  {error409 && <p className="text-red-400 text-xs cal-fade-in">{error409}</p>}
</div>
```

**Vencida** (`ultima_respuesta != null && !bloqueada`):

```tsx
<div className="rounded-xl border border-stone-700/40 p-4 space-y-3">
  <p className="text-sm text-stone-200">{texto_pregunta}</p>
  <details className="text-xs text-stone-400">
    <summary className="cursor-pointer hover:text-stone-300">
      Tu última respuesta · {formatDate(fecha_ultima)}
    </summary>
    <p className="mt-2 italic text-stone-300/80 pl-2 border-l border-stone-700/40">
      {ultima_respuesta}
    </p>
  </details>
  <textarea ... placeholder="Nueva entrada..." />
</div>
```

**Bloqueada** (`bloqueada == true`):

```tsx
<div className="rounded-xl border border-stone-700/40 p-4 space-y-3 opacity-90">
  <p className="text-sm text-stone-200">{texto_pregunta}</p>
  <details className="text-xs text-stone-400">
    <summary className="cursor-pointer">
      Tu última respuesta · {formatDate(fecha_ultima)}
    </summary>
    <p className="mt-2 italic text-stone-300/80 pl-2 border-l border-stone-700/40">
      {ultima_respuesta}
    </p>
  </details>
  <div className="rounded-lg bg-stone-950/40 border border-stone-700/30 p-3 flex items-center gap-3">
    <Lock size={14} className="text-amber-300/60" />
    <div className="text-xs text-stone-400">
      Disponible nuevamente el <span className="text-amber-200/80">{formatDate(siguiente_disponible)}</span>
      <span className="block text-[10px] text-stone-500 mt-0.5">en {dias_restantes} días</span>
    </div>
  </div>
</div>
```

**Comportamiento**:

- `onBlur` del textarea → POST `/respuestas`. Si 200, refresca el resumen y la lista. Si 409 (cooldown), muestra error con `cal-shake` + mensaje en rojo durante 2s.
- Estado local optimista: el textarea no se vacía hasta confirmar 200, así no se pierde texto si falla.
- Auto-save indicator: pequeño `text-[10px] text-stone-500` "Guardado al salir del campo" debajo del textarea (igual que hoy).

### 6.4 ReflectionEditor

Sin restricción de cooldown. Migra de la implementación actual (que manipula DOM directo con `document.getElementById`) a state de React.

```tsx
const [score, setScore] = useState(5);
const [text, setText] = useState('');
const [submitting, setSubmitting] = useState(false);
const [feedback, setFeedback] = useState<{ score: number; text: string } | null>(null);
```

- Slider 1-10 con stops de 0.1, mismo tracking visual (track con gradiente ámbar, knob con shadow).
- Textarea grande (placeholder "Detalla globalmente cómo esta energía se manifiesta...").
- Botón "Recibir Diagnóstico IA":
  - Disabled mientras `submitting`.
  - Loading dots dentro del botón mientras espera (mismo `cal-loading-dot` del calendario).
  - On success → llena `feedback`, refresca resumen del árbol, anima el header del stat de score promedio.
- Render del feedback IA debajo del botón, con `cal-fade-in`. Card con borde dorado tenue, score IA grande, texto del feedback debajo.

### 6.5 HistoryList

Solo se renderiza si `registros.length > 1` (la "última" ya se muestra arriba; aquí mostramos las anteriores).

```
┌─────────────────────────────────────────┐
│ ▼ Ver historial completo (12 entradas)  │
└─────────────────────────────────────────┘
```

Click expande con `motion.div` `animate={{ height: 'auto' }}`. Render de tarjetas compactas:

```
┌─────────────────────────────────────────┐
│ 12 abril · IA 8/10                      │
│ "Comencé el día con apertura, sentí..."│
└─────────────────────────────────────────┘
```

Click en una tarjeta expande inline con texto completo + feedback IA.

---

## 7. Frontend — Susurros del árbol (`RotatingReflectionPreview.tsx`)

### 7.1 Comportamiento

- **Activo solo cuando** `selectedSefiraId === null` (estado idle).
- **Fuente de datos**: `summary` filtrado por `score_ia_promedio != null && ultima_reflexion_texto != null`, ordenado descendente por `score_ia_promedio` (empates resuelven por `ultima_actividad` desc).
- **Loop infinito** mientras esté idle. Reset al estado idle reanuda desde la siguiente sefirá del cursor.
- **Pausa**: hover sobre la card, sefirá seleccionada, o pestaña fuera de foco (Page Visibility API).

### 7.2 Hook `useReflectionRotation`

```ts
type RotationState = {
  current: SefiraResumen | null;
  index: number;
};

function useReflectionRotation(items: SefiraResumen[], active: boolean): {
  current: SefiraResumen | null;
  setHovered: (h: boolean) => void;
};
```

Internamente:
- `useState<number>(0)` para el cursor.
- `useEffect` con `setInterval` cada 5300ms (entrada 700 + quietud 3800 + salida 500 + gap 300) avanza el cursor.
- Cleanup del interval al desmontar o cuando `active` se vuelve false.
- Un segundo effect maneja `document.visibilitychange` para pausar.
- Hovered: ref booleano que el effect lee para skipear el avance del cursor.

### 7.3 Card visual

```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.94, y: 6 }}
  animate={{ opacity: 1, scale: 1, y: [0, -2, 0, 2, 0] }}    // y oscila en el quietud
  exit={{ opacity: 0, y: -6 }}
  transition={{
    opacity: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
    scale:   { duration: 0.7 },
    y:       { duration: 4, ease: 'easeInOut', repeat: Infinity },
  }}
  className="absolute pointer-events-auto bg-[#0e1014]/95 backdrop-blur-md
             border rounded-xl shadow-xl px-3.5 py-3 w-[280px]"
  style={{
    borderColor: `${color}33`,
    borderLeft: `2px solid ${color}`,
    ...positionStyle,
  }}
  onMouseEnter={() => setHovered(true)}
  onMouseLeave={() => setHovered(false)}
>
  <div className="flex items-center justify-between mb-2">
    <div className="flex items-center gap-2">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      <span className="text-[10px] uppercase tracking-wider text-stone-200">{nombre}</span>
    </div>
    <span className="text-[10px] tabular-nums px-2 py-0.5 rounded-full bg-amber-300/15 text-amber-200">
      {score_ia_promedio}
    </span>
  </div>
  <p className="text-xs text-stone-300/90 italic line-clamp-3 leading-snug mb-3">
    {snippet(ultima_reflexion_texto, 100)}
  </p>
  <button
    onClick={() => onSelectSefira(sefira_id)}
    className="text-[11px] text-amber-300/80 hover:text-amber-200 inline-flex items-center gap-1"
  >
    Ver más <span>→</span>
  </button>
</motion.div>
```

### 7.4 Línea conectora

SVG `<motion.path>` que va desde el centro del orbe (en coordenadas del viewBox 400×800 del árbol) hasta el borde de la card. Animación `pathLength: [0, 1]` durante phase 1 (entrada). Color dorado opacity 0.25, strokeWidth 1.

### 7.5 Posicionamiento

Para cada sefirá, calcular el anchor según su posición x:

```ts
function cardPosition(node: SefiraNode, treeRect: DOMRect): React.CSSProperties {
  const { x, y } = node;  // viewBox coords
  const xPct = (x / 400) * 100;
  const yPct = (y / 800) * 100;

  if (x < 160) {
    // sefirá a la izquierda → card a la derecha
    return { left: `calc(${xPct}% + 60px)`, top: `${yPct}%`, transform: 'translateY(-50%)' };
  }
  if (x > 240) {
    // sefirá a la derecha → card a la izquierda
    return { right: `calc(${100 - xPct}% + 60px)`, top: `${yPct}%`, transform: 'translateY(-50%)' };
  }
  // sefirá central (Keter, Tiferet, Yesod, Maljut)
  // si y < 400 → card abajo; si y >= 400 → card arriba
  if (y < 400) {
    return { left: `${xPct}%`, top: `calc(${yPct}% + 60px)`, transform: 'translateX(-50%)' };
  }
  return { left: `${xPct}%`, bottom: `calc(${100 - yPct}% + 60px)`, transform: 'translateX(-50%)' };
}
```

### 7.6 Reduced motion

Si `useReducedMotion() === true`, el componente retorna `null` (no se renderiza nada). El árbol queda quieto, sin susurros — respeto a usuarios sensibles.

### 7.7 Performance

- 1 sola card en el DOM gracias a `AnimatePresence mode="wait"`.
- La animación `y: [0, -2, 0, 2, 0]` corre por compositor (transform).
- `pathLength` GPU-accelerated en SVG.
- Timer cancelado en cleanup (no leak).
- Page Visibility pause evita CPU innecesario en background.

---

## 8. Cross-cutting

### 8.1 Bug del título (`App.tsx`)

Línea ~165, hardcodeado a "Calendario Cabalístico". Pasa a:

```tsx
const VIEW_TITLES = {
  espejo: { title: 'Espejo Cognitivo', subtitle: 'Reflexión guiada por las dimensiones del alma.' },
  calendario: { title: 'Calendario Cabalístico', subtitle: 'La organización es parte del camino de rectificación. Organiza tu semana y tus dimensiones.' },
  admin: { title: 'Panel de Administrador', subtitle: 'Gestión de preguntas guía por sefirá.' },
};
const current = VIEW_TITLES[activeView];
```

### 8.2 Transición entre vistas

Wrapper `<AnimatePresence mode="wait">` en App.tsx alrededor del `activeView` switch. Cada vista entra con `cal-fade-in` (180ms), sale con fade simple (120ms). Hoy es cambio abrupto.

### 8.3 Tokens compartidos

Ver Sección 3.2.

---

## 9. Out of scope (explícito)

- Autenticación / múltiples usuarios.
- Edición o borrado de respuestas pasadas (lectura-only).
- Gráficos de evolución temporal completos (solo el sparkline mini en el stat).
- Exportar reflexiones (PDF, JSON).
- Notificaciones de "tal sefirá vence en 3 días".
- Analytics: total de reflexiones del usuario, calendario de hábito, etc.
- Mejoras al `/evaluate` para que use IA real (sigue siendo mock random).
- Changes en `AdminPanel.tsx` — vive feliz como está.

---

## 10. Criterios de éxito

1. Bug del título corregido — al estar en Espejo Cognitivo el header dice "Espejo Cognitivo".
2. Click en sefirá → panel scrolleable directo (sin paso intermedio "Iniciar Análisis").
3. El panel renderiza header con stats + última reflexión + preguntas (con sus 3 estados) + reflexión nueva + historial. Cada bloque se renderiza solo si tiene data.
4. Cooldown de 30 días: una pregunta recién respondida queda bloqueada con mensaje de "Disponible el [fecha]" y `dias_restantes`.
5. Si intentás POST /respuestas dentro del cooldown, backend responde 409 y frontend muestra error con shake.
6. Reflexión global sin cooldown — podés evaluar las veces que quieras.
7. POST /evaluate persiste a `RegistroDiario`. Después de evaluar, refrescar la página muestra esa entrada en el historial.
8. El árbol tinta cada sefirá según su `intensidad` — sefirot con preguntas frescas brillan más, las "abandonadas" se atenúan.
9. Cuando se selecciona idle (sin sefirá), aparecen susurros animados ordenados por score IA descendente, ~5s cada uno, infinitos.
10. Hover sobre un susurro lo congela. Click "Ver más" selecciona esa sefirá.
11. Sin sefirá con reflexiones → no aparecen susurros, el árbol queda quieto.
12. `prefers-reduced-motion: reduce` → susurros desactivados, tinting estático sin animación de pulso.
13. `App.tsx` queda ~140 líneas. Toda la lógica del Espejo vive en `frontend/src/espejo/`.
14. AdminPanel sigue funcionando intacto.
