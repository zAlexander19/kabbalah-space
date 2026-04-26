# Mi Evolución — Spec

**Fecha:** 2026-04-25
**Alcance:** Nueva vista "Mi Evolución" con un panel de estadísticas que muestra la evolución mensual de cada sefirá: dos curvas (score IA y score usuario) sobre la misma escala 1-10. Layout de lista lateral + chart detalle, con selector de rango temporal y toggle de qué curva mostrar.

---

## 1. Objetivo

Hoy el sistema persiste cada `RegistroDiario` con `puntuacion_usuario` (lo que el usuario se autocalificó en el slider) y `puntuacion_ia` (lo que devolvió `/evaluate`). Esos datos solo se muestran como **valores actuales** en el panel del Espejo (sparkline corto en el header de cada sefirá, último registro en `LastReflection`).

Esta feature da visibilidad a la **evolución temporal**: el usuario ve cómo cambió cada dimensión a lo largo de los meses, comparando lo que él se autocalificó vs lo que la IA percibió. Sirve para detectar:

- Sefirot que está cuidando consistentemente (curva alta y estable)
- Sefirot que abandonó (data se corta hace meses)
- Discrepancias entre auto-percepción y IA (las dos curvas se alejan)

---

## 2. Decisiones tomadas

| Eje | Decisión |
|---|---|
| Ubicación | Nuevo ítem en el rail "Mi Evolución" (4to ícono después de Espejo, Calendario, Admin) |
| Layout | Lista izquierda con sparklines + chart detalle a la derecha (mismo patrón que Espejo) |
| Métricas | 2 curvas: Score IA + Score Usuario (1-10) |
| Color | Usuario = color de la sefirá, IA = dorado ámbar (`#e9c349`) |
| Estilo de línea | Ambas sólidas; el color las diferencia |
| Toggle | `Ambos · Solo Usuario · Solo IA`. Default: **Ambos** |
| Rango temporal | Default últimos **12 meses** rolling. Selector: `3 · 6 · 12 · Todo` |
| Granularidad | Mensual. Cada punto = promedio del mes |
| Meses sin data | Se renderizan en el eje X como gaps (línea cortada) — no falsifica con interpolación |
| Backend | Nuevo endpoint agregado `GET /espejo/evolucion?meses=12` |
| Charting | SVG puro, sin librería (coherente con árbol y calendario) |
| Out of scope | Comparar sefirot en mismo chart, predicciones, exportar CSV, promedios móviles |

---

## 3. Arquitectura

### 3.1 Estructura de archivos

```
frontend/src/
  evolucion/
    EvolucionModule.tsx         ← orquestador, ~80 líneas
    types.ts                    ← tipos: SefiraEvolucion, MesBucket
    hooks/
      useEvolucion.ts           ← fetch /espejo/evolucion con param meses
    components/
      RangeSelector.tsx         ← pill 3 · 6 · 12 · Todo
      MetricToggle.tsx          ← pill Ambos · Usuario · IA
      SefiraEvolucionList.tsx   ← lista vertical de sefirot con sparkline
      SefiraEvolucionRow.tsx    ← una fila clickeable de la lista
      EvolucionChart.tsx        ← chart SVG grande (200-300 líneas)
      EvolucionChartAxis.tsx    ← ejes y grilla del chart
      EvolucionLine.tsx         ← una línea + puntos del chart
      EvolucionTooltip.tsx      ← tooltip flotante en hover
```

`App.tsx` agrega un cuarto ítem al `NAV_ITEMS` con label "Mi Evolución" (icono `monitoring` o `trending_up` de Material Symbols).

### 3.2 Sin nueva tabla en el backend

`RegistroDiario` ya tiene todo lo necesario:
- `sefira_id` — agrupar por sefirá
- `fecha_registro` — agrupar por mes
- `puntuacion_usuario` y `puntuacion_ia` — promediar

El nuevo endpoint hace la agregación on-the-fly.

---

## 4. Backend

### 4.1 Endpoint nuevo

```python
@app.get("/espejo/evolucion", response_model=list[SefiraEvolucion])
async def espejo_evolucion(
    meses: int = Query(12, ge=1, le=120),
    db: AsyncSession = Depends(get_db),
):
    """Devuelve por cada sefirá los promedios mensuales de puntuacion_usuario
    y puntuacion_ia, junto con el conteo de reflexiones y respuestas en cada mes,
    para los últimos `meses` meses (incluye el mes actual)."""
```

### 4.2 Pydantic models nuevos

```python
class MesBucket(BaseModel):
    mes: str                                  # "2026-04" formato YYYY-MM
    score_usuario: Optional[float] = None     # promedio o null si sin data
    score_ia: Optional[float] = None
    reflexiones: int = 0                      # cantidad de RegistroDiario en ese mes
    respuestas: int = 0                       # cantidad de RespuestaPregunta en ese mes


class SefiraEvolucion(BaseModel):
    sefira_id: str
    sefira_nombre: str
    meses: list[MesBucket]                    # ordenado cronológicamente, oldest → newest
```

### 4.3 Lógica de agregación

Pseudocódigo:

```python
async def espejo_evolucion(meses, db):
    sefirot = SELECT * FROM sefirot ORDER BY nombre
    today = utcnow()
    # Generar lista de meses YYYY-MM hacia atrás desde el actual
    mes_keys = [yyyy_mm(today - n_months) for n in range(meses-1, -1, -1)]

    out = []
    for s in sefirot:
        registros = SELECT * FROM registros_diario WHERE sefira_id = s.id
        respuestas = SELECT respuestas_preguntas.* FROM respuestas_preguntas
                     JOIN preguntas_sefirot ON respuestas_preguntas.pregunta_id = preguntas_sefirot.id
                     WHERE preguntas_sefirot.sefira_id = s.id

        # Agrupar registros por mes
        registros_por_mes: dict[str, list[Registro]] = {}
        for r in registros:
            mes = yyyy_mm(r.fecha_registro)
            registros_por_mes.setdefault(mes, []).append(r)

        respuestas_por_mes: dict[str, int] = {}
        for r in respuestas:
            mes = yyyy_mm(r.fecha_registro)
            respuestas_por_mes[mes] = respuestas_por_mes.get(mes, 0) + 1

        buckets = []
        for mes_key in mes_keys:
            regs = registros_por_mes.get(mes_key, [])
            usuarios = [r.puntuacion_usuario for r in regs if r.puntuacion_usuario is not None]
            ias = [r.puntuacion_ia for r in regs if r.puntuacion_ia is not None]
            buckets.append(MesBucket(
                mes=mes_key,
                score_usuario=round(sum(usuarios)/len(usuarios), 1) if usuarios else None,
                score_ia=round(sum(ias)/len(ias), 1) if ias else None,
                reflexiones=len(regs),
                respuestas=respuestas_por_mes.get(mes_key, 0),
            ))

        out.append(SefiraEvolucion(
            sefira_id=s.id, sefira_nombre=s.nombre, meses=buckets,
        ))
    return out
```

Performance: 10 sefirot × 2 queries = 20 queries por call. Aceptable para single-user.

### 4.4 Caso especial: `meses=todo`

Cuando el frontend pide "Todo", manda `meses=120` (10 años). Suficiente para casi cualquier escenario realista; si no hay data tan vieja, los buckets viejos son nulos.

Decisión: **no** implementar lógica de "auto-detectar el primer registro y empezar desde ahí". Mantener simple. Si en el futuro 120 meses se queda corto, ampliamos.

---

## 5. Frontend

### 5.1 EvolucionModule (orquestador)

Estructura general:

```jsx
<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
  {/* Columna izq: lista de sefirot */}
  <div className="lg:col-span-4 bg-[#15181d] border rounded-2xl p-4">
    <RangeSelector value={meses} onChange={setMeses} />
    <SefiraEvolucionList
      data={data}
      selectedId={selectedId}
      onSelect={setSelectedId}
      activeMetrics={activeMetrics}
    />
  </div>

  {/* Columna der: chart */}
  <div className="lg:col-span-8 bg-[#15181d] border rounded-2xl p-6">
    <EvolucionHeader sefira={selected} metrics={activeMetrics} />
    <MetricToggle value={activeMetrics} onChange={setActiveMetrics} />
    {selected ? (
      <EvolucionChart data={selected} activeMetrics={activeMetrics} />
    ) : (
      <EmptyState message="Seleccioná una dimensión a la izquierda" />
    )}
  </div>
</div>
```

State:
- `meses: 3 | 6 | 12 | 'todo'` (default 12)
- `selectedId: string | null` (default: la primera sefirá con al menos un registro; si ninguna tiene, `null` y se muestra el empty state del chart)
- `activeMetrics: { usuario: boolean; ia: boolean }` (default ambos true)

### 5.2 RangeSelector

Pill horizontal con 4 opciones. Mismo estilo que el selector de vista del calendario (Semana/Mes/Año) — fondo oscuro, opción activa con pill ámbar.

### 5.3 MetricToggle

Pill horizontal con 3 opciones: `Ambos · Usuario · IA`. Cuando `Ambos` está activo, las dos curvas visibles. Cuando solo una está activa, solo esa curva.

Implementación: `activeMetrics` es objeto. Click en `Ambos` → `{ usuario: true, ia: true }`. Click en `Usuario` → `{ usuario: true, ia: false }`. Etc.

### 5.4 SefiraEvolucionList + SefiraEvolucionRow

Lista vertical de las 10 sefirot. Cada fila:

```
┌─────────────────────────────────────────────┐
│ ●  JÉSED                          7.2 / 6.8 │
│ ─────────────────────────────────────────── │
│  ▁▃▅▇▆▅▆█  ←sparkline del usuario           │
│  ▁▂▄▆▆▆▇▆  ←sparkline del IA                │
└─────────────────────────────────────────────┘
```

- Punto color sefirá + nombre
- Stats arriba: último valor IA / último valor usuario (o `—` si nulo)
- Dos sparklines ultra-pequeñas (40-60px ancho), una abajo de la otra
- Estado activo: borde ámbar, fondo ligeramente más claro

Click → setSelectedId. Animación suave del chart al cambiar.

### 5.5 EvolucionChart (el chart SVG grande)

Dimensiones: ~600×320 (responsive). Padding interno para ejes.

Estructura:

```
┌──────────────────────────────────────────────┐
│ 10│                                  ●       │
│  9│                          ┌─●─┐  /│       │
│  8│         ●─┐         ●──┘     ●─┘ │       │
│  7│    ●──┘   └─●     ●                      │
│  6│  ●            └─●─┘                      │
│  5│                                          │
│  4│                                          │
│  3│                                          │
│  2│                                          │
│  1│______________________________________    │
│    ENE FEB MAR ABR MAY JUN JUL AGO SEP OCT  │
└──────────────────────────────────────────────┘
```

**Ejes**:
- Y: 1-10, ticks cada 2 (1, 3, 5, 7, 9), grid horizontal sutil
- X: meses abreviados (ENE, FEB, ...). Si hay >6 meses, mostrar uno cada 2.

**Líneas**:
- Construidas con `<path>` SVG (smooth curve via Catmull-Rom o simple polyline)
- Color usuario: `SEFIRA_COLORS[sefira_id]`
- Color IA: `ink.ember` (#e9c349)
- Stroke 2px, linecap round
- Cada punto: círculo r=4, fill del color de la línea, stroke blanco 1px

**Gaps**:
- Si un mes tiene `score_usuario: null`, la línea de usuario rompe ahí (no se conecta entre los puntos no-nulos a través del nulo)
- Misma lógica para IA

**Hover**:
- Hover sobre un punto → tooltip flotante con: mes completo (ej "Abril 2026"), score IA, score usuario, cantidad de reflexiones, cantidad de respuestas
- Crosshair vertical sutil bajo el cursor

**Animación de entrada**:
- Cada línea anima `pathLength: 0 → 1` durante 800ms con ease-out al cargar/cambiar de sefirá

### 5.6 EvolucionChartAxis + EvolucionLine + EvolucionTooltip

Componentes de bajo nivel para mantener el chart legible. Cada uno con responsabilidad única:

- `EvolucionChartAxis`: ejes + ticks + labels + grid
- `EvolucionLine`: una sola línea + sus puntos (recibe `points: { x, y, value }[]`, `color`, `visible`)
- `EvolucionTooltip`: card flotante; recibe `bucket: MesBucket`

### 5.7 Empty states

- Sin sefirá seleccionada (al cargar inicial sin `selectedId`): "Seleccioná una dimensión a la izquierda"
- Sefirá seleccionada pero sin ningún registro en el rango: chart con ejes vacíos + mensaje superpuesto "Aún sin reflexiones para esta dimensión en el rango elegido"

---

## 6. Integración con la página

### 6.1 NAV_ITEMS

```ts
const NAV_ITEMS = [
  { key: 'espejo',     icon: 'account_tree',           label: 'Mi Árbol de la Vida' },
  { key: 'evolucion',  icon: 'monitoring',              label: 'Mi Evolución' },
  { key: 'calendario', icon: 'event_note',              label: 'Calendario Cabalístico' },
  { key: 'admin',      icon: 'admin_panel_settings',    label: 'Panel de Administrador' },
];
```

### 6.2 ViewKey

```ts
type ViewKey = 'espejo' | 'admin' | 'calendario' | 'evolucion';
```

### 6.3 VIEW_TITLES

```ts
evolucion: { title: 'Mi Evolución', subtitle: 'El movimiento mensual de cada dimensión del alma.' },
```

### 6.4 Render del módulo

```jsx
{activeView === 'evolucion' && <EvolucionModule sefirot={SEFIROT} />}
```

`EvolucionModule` recibe `SEFIROT` para tener nombres/colores localmente sin extra fetch.

---

## 7. Out of scope (explícito)

- **Comparar varias sefirot en el mismo chart** (overlap de 10 líneas — confuso). Si en el futuro se quiere, se agrega.
- **Predicciones / proyecciones** ("vas en camino a...")
- **Exportar a CSV o PDF**
- **Promedios móviles** o suavizado
- **Granularidad semanal o diaria** — solo mensual por ahora
- **Notificaciones** ("hace 2 meses que no reflexionás sobre Hod")
- **Multi-usuario** (sigue siendo single-user, queries sin `usuario_id` filter)

---

## 8. Criterios de éxito

1. Click en "Mi Evolución" en el rail → entra a la nueva vista, header con título nuevo.
2. Default: rango 12 meses, ambas métricas activas, primera sefirá con data seleccionada.
3. Lista izq muestra las 10 sefirot con sparklines (o `—` si sin data).
4. Click en sefirá de la lista → chart actualiza con animación suave.
5. Toggle `Ambos · Usuario · IA` → ocultá/mostrá líneas correspondientes en el chart Y en las sparklines de la lista.
6. Selector `3 · 6 · 12 · Todo` → refetch + chart se redimensiona al nuevo rango.
7. Hover sobre punto del chart → tooltip con mes completo + ambas métricas + counts.
8. Mes sin data: gap visible en la línea (no falsa interpolación).
9. Backend agrega correctamente: si en abril hubo 3 reflexiones con scores `[7, 8, 6]`, el bucket de abril muestra promedio `7.0` con `reflexiones: 3`.
10. Reduced motion respetado: anima sin pathLength sweep, solo fade.
