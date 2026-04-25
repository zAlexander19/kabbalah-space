# Actividades recurrentes — Spec

**Fecha:** 2026-04-25
**Alcance:** Permitir que una actividad se repita según un patrón configurable (RFC 5545 RRULE), inspirado en Google Calendar pero con scope acotado para single-user.

---

## 1. Objetivo

Hoy cada actividad existe como una sola fila. Para casos repetitivos reales (clases semanales, terapia quincenal, ciclos de N sesiones, hábitos diarios), el usuario tiene que recrear manualmente. Esta feature permite definir un patrón de recurrencia al crear y gestionar las series con un modal de scope al editar/borrar.

---

## 2. Decisiones tomadas (de la fase brainstorming)

| Eje | Decisión |
|---|---|
| Estándar | RFC 5545 RRULE (compat con iCal/Google) |
| Backend storage | Materialización ansiosa, sin tablas nuevas |
| Frecuencias soportadas | Diaria, semanal (con días específicos), mensual (por día del mes), días de semana (L-V) |
| UI custom | Inline expandible en el form (no modal sobre modal) |
| Cap de materialización | 365 días desde la fecha de inicio + auto-extensión al navegar |
| Edit/delete scope | Modal "Solo esta" (default) / "Toda la serie" |
| Comportamiento "Toda la serie" | Pisa modificaciones individuales (regenera desde nuevo RRULE) |
| Indicador visual | Doble borde-izquierdo en chip recurrente (sin ícono) |
| Out of scope | "Este y los siguientes", excepciones explícitas, import/export iCal |

---

## 3. Cambios de backend

### 3.1 Schema (`backend/models.py`)

Agregar 2 columnas a `Actividad`:

```python
class Actividad(Base):
    __tablename__ = "actividades"
    # ... columnas existentes sin tocar ...
    serie_id = Column(String(36), nullable=True, index=True)
    rrule    = Column(String(500), nullable=True)
```

Ambas son `nullable=True` para que las actividades existentes y las puntuales sigan funcionando sin migración. SQLite acepta `ALTER TABLE ADD COLUMN` con default null en una sola sentencia. Como el proyecto no usa Alembic, basta con que `Base.metadata.create_all` se ejecute al startup (ya pasa). Para la DB existente: borrar `kabbalah.db` o ejecutar el `ALTER TABLE` manual una vez.

Nota de implementación: `Base.metadata.create_all` no agrega columnas a tablas existentes. Para la DB existente (`backend/kabbalah.db`) hay que ejecutar las dos sentencias `ALTER TABLE` antes del primer arranque post-feature, o aceptar que el dev borra la DB de desarrollo.

### 3.2 Dependencia nueva

`python-dateutil` (parsea RRULE y expande ocurrencias). Agregar a `requirements.txt` (crear si no existe) o instalar en el venv.

### 3.3 Pydantic models nuevos (`backend/main.py`)

```python
class ActividadCreate(BaseModel):
    titulo: str
    descripcion: Optional[str] = None
    inicio: datetime
    fin: datetime
    sefirot_ids: list[str]
    rrule: Optional[str] = None  # nueva: si presente, materializa serie

class ActividadOut(BaseModel):
    # ... campos existentes ...
    serie_id: Optional[str] = None
    rrule: Optional[str] = None
```

### 3.4 Lógica de materialización

Función nueva en `main.py`:

```python
from dateutil.rrule import rrulestr

MATERIALIZATION_CAP_DAYS = 365

async def materialize_series(
    db: AsyncSession,
    payload: ActividadCreate,
    serie_id: str,
    until_cap: Optional[datetime] = None,
) -> list[Actividad]:
    """Genera y persiste las instancias de una serie a partir del RRULE.
    La PRIMERA instancia lleva el rrule completo; las siguientes solo el serie_id.
    Devuelve las instancias creadas (sin las sefirot todavía).
    """
    duration = payload.fin - payload.inicio
    base_start = normalize_datetime(payload.inicio)

    cap = until_cap or (base_start + timedelta(days=MATERIALIZATION_CAP_DAYS))
    rule = rrulestr(payload.rrule, dtstart=base_start)
    occurrences = list(rule.between(base_start, cap, inc=True))

    created: list[Actividad] = []
    for idx, occ_start in enumerate(occurrences):
        actividad = Actividad(
            titulo=payload.titulo.strip(),
            descripcion=(payload.descripcion or "").strip() or None,
            inicio=occ_start,
            fin=occ_start + duration,
            estado="pendiente",
            serie_id=serie_id,
            rrule=payload.rrule if idx == 0 else None,
        )
        db.add(actividad)
        created.append(actividad)
    return created
```

### 3.5 Endpoints modificados

**POST `/actividades`** — sin cambio en path, lógica nueva:

```python
@app.post("/actividades", response_model=list[ActividadOut])
async def create_actividad(payload: ActividadCreate, db: AsyncSession = Depends(get_db)):
    if payload.fin <= payload.inicio:
        raise HTTPException(422, "La fecha de fin debe ser mayor a la fecha de inicio")
    await validate_sefirot_ids(db, payload.sefirot_ids)

    if payload.rrule:
        serie_id = str(uuid.uuid4())
        instancias = await materialize_series(db, payload, serie_id)
        await db.flush()
        for instancia in instancias:
            for sefira_id in payload.sefirot_ids:
                db.add(ActividadSefira(actividad_id=instancia.id, sefira_id=sefira_id))
        await db.commit()
        return [await serialize_actividad(db, a) for a in instancias]

    # path no recurrente igual a hoy
    actividad = Actividad(...)  # como existe
    # ...
    return [await serialize_actividad(db, actividad)]
```

Cambio de retorno: ahora siempre devuelve **lista**, incluso para una sola actividad. Es un breaking change menor que el frontend acomoda. Justificación: las series devuelven N elementos.

**PUT `/actividades/{id}?scope=one|series`**:

```python
@app.put("/actividades/{actividad_id}", response_model=list[ActividadOut])
async def update_actividad(
    actividad_id: str,
    payload: ActividadCreate,
    scope: str = "one",
    db: AsyncSession = Depends(get_db),
):
    if scope not in ("one", "series"):
        raise HTTPException(422, "scope debe ser 'one' o 'series'")
    # ... validaciones ...

    actividad = (await db.execute(
        select(Actividad).where(Actividad.id == actividad_id)
    )).scalars().first()
    if not actividad:
        raise HTTPException(404, "Actividad no encontrada")

    if scope == "one" or actividad.serie_id is None:
        # update simple, igual a la lógica vieja
        actividad.titulo = payload.titulo.strip()
        # ... resto de fields ...
        await db.commit()
        return [await serialize_actividad(db, actividad)]

    # scope == "series" y la actividad pertenece a una serie
    serie_id = actividad.serie_id
    # 1. Borrar todas las instancias de la serie
    await db.execute(
        delete(Actividad).where(Actividad.serie_id == serie_id)
    )
    await db.flush()
    # 2. Regenerar desde el nuevo payload (que trae rrule actualizado o el original)
    rrule_to_use = payload.rrule or actividad.rrule
    if not rrule_to_use:
        raise HTTPException(422, "No se pudo determinar el RRULE de la serie")
    payload_with_rrule = payload.model_copy(update={"rrule": rrule_to_use})
    instancias = await materialize_series(db, payload_with_rrule, serie_id)
    await db.flush()
    for instancia in instancias:
        for sefira_id in payload.sefirot_ids:
            db.add(ActividadSefira(actividad_id=instancia.id, sefira_id=sefira_id))
    await db.commit()
    return [await serialize_actividad(db, a) for a in instancias]
```

**DELETE `/actividades/{id}?scope=one|series`**:

```python
@app.delete("/actividades/{actividad_id}")
async def delete_actividad(
    actividad_id: str,
    scope: str = "one",
    db: AsyncSession = Depends(get_db),
):
    actividad = (await db.execute(
        select(Actividad).where(Actividad.id == actividad_id)
    )).scalars().first()
    if not actividad:
        raise HTTPException(404, "Actividad no encontrada")

    if scope == "series" and actividad.serie_id is not None:
        await db.execute(
            delete(Actividad).where(Actividad.serie_id == actividad.serie_id)
        )
    else:
        await db.delete(actividad)
    await db.commit()
    return {"message": "OK"}
```

### 3.6 Auto-extensión de series sin fin

Modificar `GET /actividades` para detectar series sin fin que necesitan más materialización:

```python
@app.get("/actividades", response_model=list[ActividadOut])
async def list_actividades(start: Optional[datetime] = None, end: Optional[datetime] = None, db = Depends(get_db)):
    if start and end:
        await ensure_series_materialized(db, normalize_datetime(end))
    # ... query existente ...
```

`ensure_series_materialized` busca series cuyo `rrule` tiene `FREQ=...` sin `UNTIL` ni `COUNT`, encuentra la última instancia generada de cada una, y si la última instancia es < `end`, materializa más adelante (otros 365 días). Implementación:

```python
async def ensure_series_materialized(db: AsyncSession, end: datetime) -> None:
    open_series = (await db.execute(
        select(Actividad).where(
            and_(Actividad.rrule.is_not(None), Actividad.serie_id.is_not(None))
        )
    )).scalars().all()

    for seed in open_series:
        if "UNTIL=" in (seed.rrule or "") or "COUNT=" in (seed.rrule or ""):
            continue  # tiene fin propio, no extender

        last = (await db.execute(
            select(Actividad).where(Actividad.serie_id == seed.serie_id)
            .order_by(Actividad.inicio.desc()).limit(1)
        )).scalars().first()
        if not last or last.inicio >= end:
            continue

        # extender desde last.inicio + 1s hasta last.inicio + 365 días
        # reusando la primera ocurrencia como semilla
        ...
```

(La implementación detallada va en el plan; este spec marca el comportamiento.)

---

## 4. Cambios de frontend

### 4.1 Nuevo componente: `RecurrencePicker`

[frontend/src/calendar/components/RecurrencePicker.tsx](frontend/src/calendar/components/RecurrencePicker.tsx)

**Props**:
```ts
type Props = {
  value: string | null;          // RRULE actual (o null = "no se repite")
  startDate: Date;               // para presets contextuales
  onChange: (rrule: string | null) => void;
};
```

**UI**: dropdown con los presets + opción "Personalizado…" que expande inline un mini-bloque debajo (no modal).

**Presets contextuales** generados en función de `startDate`:
- "No se repite" → `null`
- "Diariamente" → `FREQ=DAILY`
- "Semanalmente los [día]" → `FREQ=WEEKLY;BYDAY=<XX>`
- "Días de semana (L-V)" → `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`
- "Mensualmente el día [N]" → `FREQ=MONTHLY;BYMONTHDAY=<N>`
- "Personalizado…" → expande UI

**Custom UI**:
```
Cada [ 2 ] [ semanas ▾ ]
Repetir en: [ L ][ M ][ M ][ J ][ V ][ S ][ D ]   ← solo si unidad = semanas
Termina:
  ○ Nunca
  ○ El [ fecha ]
  ○ Tras [ N ] veces
```

**Resumen legible**: pequeño texto en `text-amber-200/80` debajo del control:
> "Cada 2 semanas los lunes y miércoles, hasta el 31 de diciembre de 2026"

Construcción del resumen vive en una función helper `describeRRule(rrule, locale)` en [frontend/src/calendar/utils/rrule.ts](frontend/src/calendar/utils/rrule.ts).

### 4.2 Integración en `ActivityForm`

[frontend/src/calendar/components/ActivityForm.tsx](frontend/src/calendar/components/ActivityForm.tsx)

- Nuevo state: `const [rrule, setRrule] = useState<string | null>(null);`
- Render del `<RecurrencePicker>` después del bloque de Horas y antes de Descripción.
- En `handleSubmit`, agregar `rrule` al payload.
- En `useEffect` de inicialización (cuando se abre en modo editing), setear `rrule` desde `editing.rrule` si existe.
- En modo editing, **el control queda deshabilitado si la edición es scope `one`** (no tiene sentido cambiar la regla solo para esta instancia). Visual: opacity 0.5, mensaje "La recurrencia solo puede modificarse en 'Toda la serie'".

### 4.3 Modal de scope previo: `RecurrenceScopeDialog`

[frontend/src/calendar/components/RecurrenceScopeDialog.tsx](frontend/src/calendar/components/RecurrenceScopeDialog.tsx)

**Props**:
```ts
type Props = {
  open: boolean;
  mode: 'edit' | 'delete';
  onChoose: (scope: 'one' | 'series') => void;
  onCancel: () => void;
};
```

**UI**: overlay + card centrada con dos radio buttons (default: "Solo esta") + botones "Cancelar" / "Continuar". Reutiliza el mismo overlay y motion timings que `ActivityPanel` para coherencia.

### 4.4 Lógica en `CalendarModule`

Nuevo state: `const [pendingScopeChoice, setPendingScopeChoice] = useState<{...}>()`.

Cuando el usuario hace click en un evento:
```ts
function openEvent(a: Activity) {
  if (a.serie_id) {
    setPendingScopeChoice({ activity: a, mode: 'edit' });
  } else {
    setEditing(a);
    setPanelOpen(true);
  }
}
```

Cuando confirma scope en el modal:
```ts
function handleScopeChosen(scope: 'one' | 'series') {
  const { activity, mode } = pendingScopeChoice;
  setPendingScopeChoice(null);
  if (mode === 'edit') {
    setEditing(activity);
    setEditScope(scope);
    setPanelOpen(true);
  } else {
    deleteActivityWithScope(activity.id, scope);
  }
}
```

Nuevo state `editScope: 'one' | 'series'` que se manda como query param en el PUT.

### 4.5 Integración en `useActivities`

[frontend/src/calendar/hooks/useActivities.ts](frontend/src/calendar/hooks/useActivities.ts)

- POST: el response ahora siempre es `Activity[]` en lugar de `Activity`. Acomodar.
- PUT: aceptar parámetro `scope` y agregarlo como query param.
- DELETE: aceptar parámetro `scope` y agregarlo como query param.

### 4.6 Indicador visual en `CalendarEvent`

[frontend/src/calendar/components/CalendarEvent.tsx](frontend/src/calendar/components/CalendarEvent.tsx)

Cuando `activity.serie_id != null`, agregar un segundo borde izquierdo a 2px del primero, mismo color, opacity 0.5:

```tsx
borderLeft: `2px solid ${color}`,
boxShadow: activity.serie_id ? `inset 4px 0 0 -2px ${color}88` : 'none',
```

Visual: dos líneas verticales de color a la izquierda del chip — sugiere "varias copias apiladas" sin ícono.

### 4.7 Tipo `Activity` actualizado

[frontend/src/calendar/types.ts](frontend/src/calendar/types.ts)

```ts
export type Activity = {
  // ... existentes ...
  serie_id?: string | null;
  rrule?: string | null;
};
```

---

## 5. Helper compartido: parser/builder/describer de RRULE

[frontend/src/calendar/utils/rrule.ts](frontend/src/calendar/utils/rrule.ts)

Tres funciones:

```ts
// Construye un RRULE desde la UI personalizada
export function buildRRule(opts: {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval?: number;
  byDay?: ('MO'|'TU'|'WE'|'TH'|'FR'|'SA'|'SU')[];
  byMonthDay?: number;
  endsOn?: Date;
  count?: number;
}): string;

// Parsea un RRULE de vuelta al objeto de UI
export function parseRRule(rrule: string): { freq, interval?, byDay?, byMonthDay?, endsOn?, count? };

// Devuelve un texto legible en español
export function describeRRule(rrule: string, startDate: Date): string;
```

Implementación: parser manual ligero (RRULE es un formato simple `KEY=VAL;KEY=VAL`). No necesitamos librería frontend porque las reglas que generamos son acotadas (subset de RFC 5545).

---

## 6. Out of scope (explícito)

- "Este y los siguientes" como tercera opción de scope
- Excepciones manuales (saltarse una semana puntual sin borrar la instancia)
- Recurrencia anual
- Recurrencia mensual por "N-ésimo día de semana" (ej: "tercer martes del mes")
- Importar/exportar iCal
- Notificaciones / recordatorios
- Edición masiva drag & drop de horarios
- Sincronización con Google Calendar real

Cualquiera de estos puede ser un proyecto futuro separado.

---

## 7. Criterios de éxito

1. Usuario puede crear una actividad con preset "Semanalmente los Sábados" y ve aparecer N instancias en el calendario.
2. Usuario puede crear una con "Personalizado: cada 2 semanas, lunes y miércoles, termina tras 8 veces" y se generan exactamente 8 instancias.
3. Click en evento recurrente → modal "Solo esta / Toda la serie", con default "Solo esta".
4. Editar "Solo esta" cambia solo esa instancia; las demás de la serie quedan iguales.
5. Editar "Toda la serie" regenera todas las instancias con los nuevos datos.
6. Borrar "Solo esta" borra solo esa fila. Borrar "Toda la serie" borra todas.
7. Chips recurrentes muestran el doble borde izquierdo.
8. Resumen legible debajo del picker se actualiza en tiempo real al cambiar las opciones.
9. Series sin fin (`FREQ=WEEKLY` sin `UNTIL` ni `COUNT`) materializan 365 días al crear y se extienden automáticamente al navegar más allá.
10. Una actividad sin recurrencia sigue funcionando exactamente como hoy (no regression).
