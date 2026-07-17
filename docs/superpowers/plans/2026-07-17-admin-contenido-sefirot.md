# Contenido de sefirot editable desde el admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir editar el contenido rico de cada sefirá (esencia, palabras clave, qué observar) desde el Panel de Administrador, moviéndolo de un archivo estático del frontend a la base de datos.

**Architecture:** Se agregan 3 columnas a `Sefira`; un CRUD admin (`GET`/`PATCH /admin/sefirot`) espejando el patrón de "Preguntas"; un `GET /sefirot/contenido` público que la card consume vía un hook cacheado, con `sefirotContent.ts` como semilla (migración) y fallback (front).

**Tech Stack:** FastAPI async + SQLAlchemy async + Alembic; React 18 + TypeScript + Vite + Tailwind + framer-motion; pytest-asyncio.

## Global Constraints

- **Alcance:** solo el contenido rico F1 — `esencia` (Text), `que_observa` (Text), `palabras_clave` (JSON = lista de strings). NO se editan nombre ni descripción corta.
- **Admin gating:** endpoints admin bajo `require_admin` (403 si no admin), prefijo `/admin` (router ya registrado en `main.py:132`).
- **Público:** `GET /sefirot/contenido` SIN auth (la card se ve antes de loguear).
- **UI en español rioplatense (voseo)** — consistente con el resto del admin/UI.
- **Semilla + fallback:** `frontend/src/espejo/sefirotContent.ts` se conserva; la migración siembra la base con sus valores; la card cae a él mientras el fetch no resolvió o si falla.
- **Tests backend:** tablas desde `Base.metadata` (fixture `db_session`/`client`); fixtures reales: `client`, `admin_user_headers`, `normal_user_headers`, `seed_sefirot` (ver `backend/tests/test_admin_preguntas.py`). La data-migration de Alembic NO corre en tests — la siembra de contenido se verifica manualmente tras `alembic upgrade`, y los tests de API setean contenido vía PATCH/insert directo.
- **Entorno backend:** venv — correr desde `backend/` con `./venv/Scripts/python.exe -m pytest ...` y `./venv/Scripts/python.exe -m alembic ...`.
- **Frontend:** `npm run build` desde `frontend/` (falla ante variables sin usar).
- Commits frecuentes, uno por tarea. Rama: `feat/admin-contenido-sefirot`.

---

## File Structure

**Backend**
- Modify `backend/models.py` — 3 columnas nuevas en `Sefira` + import `JSON`.
- Create `backend/alembic/versions/<autogen>_sefirot_contenido_rico.py` — columnas + data-seed.
- Modify `backend/admin/schemas.py` — `SefiraContentOut`, `SefiraContentUpdateIn`.
- Modify `backend/admin/routers.py` — `GET /admin/sefirot`, `PATCH /admin/sefirot/{id}`.
- Modify `backend/main.py` — `GET /sefirot/contenido` público + su response model.
- Create `backend/tests/test_admin_sefirot.py` — tests admin.
- Create `backend/tests/test_sefirot_contenido_publico.py` — test del GET público.

**Frontend**
- Modify `frontend/src/admin/api.ts` — tipos + `getSefirotContent` / `updateSefiraContent`.
- Create `frontend/src/admin/components/SefirotContentPanel.tsx` — panel de edición.
- Modify `frontend/src/admin/AdminModule.tsx` — tab "Contenido".
- Create `frontend/src/espejo/useSefirotContenido.ts` — hook de fetch cacheado.
- Modify `frontend/src/espejo/components/SefiraInfoCard.tsx` — consume el hook con fallback estático.

---

# PHASE 1 — Backend: modelo + migración

### Task 1: Columnas de contenido en `Sefira` + migración con semilla

**Files:**
- Modify: `backend/models.py:3` (import) y `backend/models.py:67-77` (modelo `Sefira`)
- Create: `backend/alembic/versions/<autogen>_sefirot_contenido_rico.py`

**Interfaces:**
- Produces: `Sefira.esencia: Text|None`, `Sefira.que_observa: Text|None`, `Sefira.palabras_clave: JSON|None` (lista de strings).

- [ ] **Step 1: Add `JSON` to the sqlalchemy import**

En `backend/models.py` línea 3, agregá `JSON`:

```python
from sqlalchemy import Column, String, Text, Integer, ForeignKey, DateTime, Index, Boolean, JSON
```

- [ ] **Step 2: Add the three columns to `Sefira`**

En `backend/models.py`, dentro de `class Sefira` (tras `descripcion = Column(Text)`):

```python
    descripcion = Column(Text)

    esencia = Column(Text, nullable=True)
    que_observa = Column(Text, nullable=True)
    palabras_clave = Column(JSON, nullable=True)  # lista de strings
```

- [ ] **Step 3: Generate the migration skeleton**

Desde `backend/`: `./venv/Scripts/python.exe -m alembic revision -m "sefirot contenido rico"`
Abrí el archivo generado (revision/down_revision ya seteados al head actual) y escribí `upgrade`/`downgrade` como en el Step 4.

- [ ] **Step 4: Write upgrade (columns + seed) and downgrade**

Transcribí los 10 valores de contenido **desde `frontend/src/espejo/sefirotContent.ts`** al dict `SEED`, mapeando: `esencia`→`esencia`, `palabrasClave`→`palabras_clave` (lista), `queObserva`→`que_observa`. Copiá el texto verbatim.

```python
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "<autogen>"
down_revision: Union[str, Sequence[str], None] = "<autogen-head>"
branch_labels = None
depends_on = None

# id -> {esencia, palabras_clave, que_observa}. Transcripción verbatim de
# frontend/src/espejo/sefirotContent.ts (palabrasClave -> palabras_clave).
SEED = {
    "keter": {
        "esencia": "La Corona: la voluntad primigenia, anterior a toda forma. El punto donde tu deseo más profundo todavía no tiene nombre, pero ya empuja.",
        "palabras_clave": ["Voluntad", "Propósito", "Origen"],
        "que_observa": "Mirá qué te mueve de raíz: eso que querés antes de saber por qué. La dirección que tu vida toma cuando nadie te está mirando.",
    },
    # ... jojma, bina, jesed, gevura, tiferet, netzaj, hod, yesod, maljut
    # (transcribir las 9 restantes con el mismo shape, verbatim del archivo TS)
}


def upgrade() -> None:
    op.add_column("sefirot", sa.Column("esencia", sa.Text(), nullable=True))
    op.add_column("sefirot", sa.Column("que_observa", sa.Text(), nullable=True))
    op.add_column("sefirot", sa.Column("palabras_clave", sa.JSON(), nullable=True))

    # Semilla: UPDATE de las filas existentes por id (prod ya tiene las 10).
    sefirot = sa.table(
        "sefirot",
        sa.column("id", sa.String),
        sa.column("esencia", sa.Text),
        sa.column("que_observa", sa.Text),
        sa.column("palabras_clave", sa.JSON),
    )
    bind = op.get_bind()
    for sid, c in SEED.items():
        bind.execute(
            sefirot.update()
            .where(sefirot.c.id == sid)
            .values(
                esencia=c["esencia"],
                que_observa=c["que_observa"],
                palabras_clave=c["palabras_clave"],
            )
        )


def downgrade() -> None:
    op.drop_column("sefirot", "palabras_clave")
    op.drop_column("sefirot", "que_observa")
    op.drop_column("sefirot", "esencia")
```

> Nota: `SEED` debe tener las **10** entradas (keter, jojma, bina, jesed, gevura, tiferet, netzaj, hod, yesod, maljut), transcritas del archivo TS. El ejemplo muestra solo `keter` para el shape.

- [ ] **Step 5: Apply and verify the migration + seed**

Desde `backend/`:
- `./venv/Scripts/python.exe -m alembic upgrade head` → sin errores.
- Verificá la siembra con un one-liner:

```
./venv/Scripts/python.exe -c "import asyncio; from sqlalchemy import select; from database import AsyncSessionLocal; from models import Sefira; \
async def m():\
 async with AsyncSessionLocal() as db:\
  rows=(await db.execute(select(Sefira))).scalars().all();\
  print(sum(1 for s in rows if s.esencia), 'de', len(rows), 'con esencia');\
  k=[s for s in rows if s.id=='keter'][0]; print('keter palabras_clave:', k.palabras_clave)\
\nasyncio.run(m())"
```
Expected: `10 de 10 con esencia` y la lista de palabras clave de keter.

- [ ] **Step 6: Commit**

```bash
git add backend/models.py backend/alembic/versions/
git commit -m "feat(sefirot): columnas de contenido rico + migración con semilla desde sefirotContent.ts"
```

---

# PHASE 2 — Backend: API

### Task 2: CRUD admin `GET`/`PATCH /admin/sefirot`

**Files:**
- Modify: `backend/admin/schemas.py`
- Modify: `backend/admin/routers.py`
- Test: `backend/tests/test_admin_sefirot.py`

**Interfaces:**
- Consumes: `Sefira.esencia/que_observa/palabras_clave` (Task 1); `require_admin`, `get_db`.
- Produces:
  - `SefiraContentOut(id: str, nombre: str, esencia: Optional[str], palabras_clave: list[str], que_observa: Optional[str])`
  - `SefiraContentUpdateIn(esencia: Optional[str], palabras_clave: Optional[list[str]], que_observa: Optional[str])`
  - `GET /admin/sefirot -> list[SefiraContentOut]` (ordenado por `nombre`)
  - `PATCH /admin/sefirot/{sefira_id} -> SefiraContentOut` (404 si no existe)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_admin_sefirot.py`:

```python
import pytest

pytestmark = pytest.mark.asyncio


async def test_list_sefirot_forbidden_for_normal(client, normal_user_headers, seed_sefirot):
    r = await client.get("/admin/sefirot", headers=normal_user_headers)
    assert r.status_code == 403


async def test_list_sefirot_returns_all_with_content_fields(client, admin_user_headers, seed_sefirot):
    r = await client.get("/admin/sefirot", headers=admin_user_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body) >= 1
    item = body[0]
    assert {"id", "nombre", "esencia", "palabras_clave", "que_observa"} <= set(item.keys())
    assert isinstance(item["palabras_clave"], list)  # null -> [] normalizado


async def test_patch_sefira_updates_and_persists(client, admin_user_headers, seed_sefirot):
    r = await client.patch(
        "/admin/sefirot/jesed",
        json={"esencia": "Nueva esencia", "palabras_clave": ["Amor", "Entrega"], "que_observa": "Qué mirar"},
        headers=admin_user_headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["esencia"] == "Nueva esencia"
    assert body["palabras_clave"] == ["Amor", "Entrega"]
    # persiste
    r2 = await client.get("/admin/sefirot", headers=admin_user_headers)
    jesed = next(s for s in r2.json() if s["id"] == "jesed")
    assert jesed["esencia"] == "Nueva esencia"
    assert jesed["palabras_clave"] == ["Amor", "Entrega"]


async def test_patch_sefira_partial_only_touches_given_fields(client, admin_user_headers, seed_sefirot):
    await client.patch("/admin/sefirot/jesed",
        json={"esencia": "E1", "palabras_clave": ["A"], "que_observa": "Q1"}, headers=admin_user_headers)
    await client.patch("/admin/sefirot/jesed",
        json={"esencia": "E2"}, headers=admin_user_headers)
    r = await client.get("/admin/sefirot", headers=admin_user_headers)
    jesed = next(s for s in r.json() if s["id"] == "jesed")
    assert jesed["esencia"] == "E2"
    assert jesed["palabras_clave"] == ["A"]  # intacto
    assert jesed["que_observa"] == "Q1"      # intacto


async def test_patch_sefira_404_unknown(client, admin_user_headers, seed_sefirot):
    r = await client.patch("/admin/sefirot/nope", json={"esencia": "x"}, headers=admin_user_headers)
    assert r.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run (desde `backend/`): `./venv/Scripts/python.exe -m pytest tests/test_admin_sefirot.py -v`
Expected: FAIL (404 en las rutas — endpoints no existen).

- [ ] **Step 3: Add the schemas**

En `backend/admin/schemas.py`, agregá (tras `PreguntaOut`):

```python
class SefiraContentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    nombre: str
    esencia: Optional[str] = None
    palabras_clave: list[str] = []
    que_observa: Optional[str] = None

    @classmethod
    def from_sefira(cls, s) -> "SefiraContentOut":
        return cls(
            id=s.id,
            nombre=s.nombre,
            esencia=s.esencia,
            palabras_clave=list(s.palabras_clave) if s.palabras_clave else [],
            que_observa=s.que_observa,
        )


class SefiraContentUpdateIn(BaseModel):
    esencia: Optional[str] = None
    palabras_clave: Optional[list[str]] = None
    que_observa: Optional[str] = None
```

- [ ] **Step 4: Add the endpoints**

En `backend/admin/routers.py`: agregá `Sefira` al import de models (línea ~18) y `SefiraContentOut, SefiraContentUpdateIn` al import de schemas (línea ~11-15). Luego agregá (tras el bloque de preguntas):

```python
@router.get("/sefirot", response_model=list[SefiraContentOut])
async def list_sefirot_contenido(
    _: Usuario = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(Sefira).order_by(Sefira.nombre))).scalars().all()
    return [SefiraContentOut.from_sefira(s) for s in rows]


@router.patch("/sefirot/{sefira_id}", response_model=SefiraContentOut)
async def update_sefira_contenido(
    sefira_id: str,
    payload: SefiraContentUpdateIn,
    _: Usuario = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    sefira = (await db.execute(
        select(Sefira).where(Sefira.id == sefira_id)
    )).scalars().first()
    if sefira is None:
        raise HTTPException(404, "Sefirá no encontrada")
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(sefira, field, value)
    await db.commit()
    await db.refresh(sefira)
    return SefiraContentOut.from_sefira(sefira)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `./venv/Scripts/python.exe -m pytest tests/test_admin_sefirot.py -v`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/admin/schemas.py backend/admin/routers.py backend/tests/test_admin_sefirot.py
git commit -m "feat(admin): GET/PATCH /admin/sefirot para editar contenido de sefirot"
```

---

### Task 3: `GET /sefirot/contenido` público

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_sefirot_contenido_publico.py`

**Interfaces:**
- Consumes: `Sefira` con campos de contenido (Task 1).
- Produces: `GET /sefirot/contenido -> list[SefiraContenidoPublicOut]` (sin auth), cada item `{id, esencia, palabras_clave, que_observa}`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_sefirot_contenido_publico.py`:

```python
import pytest

pytestmark = pytest.mark.asyncio


async def test_contenido_publico_no_auth_returns_items(client, seed_sefirot):
    # sin headers de auth
    r = await client.get("/sefirot/contenido")
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, list) and len(body) >= 1
    item = body[0]
    assert {"id", "esencia", "palabras_clave", "que_observa"} <= set(item.keys())
    assert isinstance(item["palabras_clave"], list)


async def test_contenido_publico_reflects_admin_edit(client, admin_user_headers, seed_sefirot):
    await client.patch("/admin/sefirot/jesed",
        json={"esencia": "Editada", "palabras_clave": ["X"]}, headers=admin_user_headers)
    r = await client.get("/sefirot/contenido")
    jesed = next(s for s in r.json() if s["id"] == "jesed")
    assert jesed["esencia"] == "Editada"
    assert jesed["palabras_clave"] == ["X"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/Scripts/python.exe -m pytest tests/test_sefirot_contenido_publico.py -v`
Expected: FAIL (404 — endpoint no existe).

- [ ] **Step 3: Add the public endpoint**

En `backend/main.py`, cerca de los endpoints de espejo/sefirot, agregá el modelo y la ruta (usá los imports ya presentes: `select`, `Sefira`, `BaseModel`; si `Sefira` no está importado en main.py, agregalo al import de `models`):

```python
class SefiraContenidoPublicOut(BaseModel):
    id: str
    esencia: Optional[str] = None
    palabras_clave: list[str] = []
    que_observa: Optional[str] = None


@app.get("/sefirot/contenido", response_model=list[SefiraContenidoPublicOut])
async def sefirot_contenido_publico(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Sefira).order_by(Sefira.nombre))).scalars().all()
    return [
        SefiraContenidoPublicOut(
            id=s.id,
            esencia=s.esencia,
            palabras_clave=list(s.palabras_clave) if s.palabras_clave else [],
            que_observa=s.que_observa,
        )
        for s in rows
    ]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./venv/Scripts/python.exe -m pytest tests/test_sefirot_contenido_publico.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/test_sefirot_contenido_publico.py
git commit -m "feat(sefirot): GET /sefirot/contenido público para la card"
```

---

# PHASE 3 — Frontend: panel admin

### Task 4: API + panel de edición + tab "Contenido"

**Files:**
- Modify: `frontend/src/admin/api.ts`
- Create: `frontend/src/admin/components/SefirotContentPanel.tsx`
- Modify: `frontend/src/admin/AdminModule.tsx`

**Interfaces:**
- Consumes: `GET /admin/sefirot`, `PATCH /admin/sefirot/{id}` (Task 2).
- Produces: `SefiraContentAdmin` type; `getSefirotContent()`, `updateSefiraContent(id, patch)`.

- [ ] **Step 1: Add the API type + functions**

En `frontend/src/admin/api.ts`, agregá el tipo (junto a los otros) y las funciones (tras el bloque de Preguntas):

```typescript
export interface SefiraContentAdmin {
  id: string;
  nombre: string;
  esencia: string | null;
  palabras_clave: string[];
  que_observa: string | null;
}

export interface SefiraContentPatch {
  esencia?: string;
  palabras_clave?: string[];
  que_observa?: string;
}

// ---------- Contenido de sefirot ----------
export async function getSefirotContent(): Promise<SefiraContentAdmin[]> {
  return json(await apiFetch('/admin/sefirot'));
}
export async function updateSefiraContent(id: string, patch: SefiraContentPatch): Promise<SefiraContentAdmin> {
  return json(await apiFetch(`/admin/sefirot/${id}`, {
    method: 'PATCH', body: JSON.stringify(patch),
  }));
}
```

- [ ] **Step 2: Create the panel**

Create `frontend/src/admin/components/SefirotContentPanel.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { getSefirotContent, updateSefiraContent, type SefiraContentAdmin } from '../api';

export function SefirotContentPanel() {
  const [items, setItems] = useState<SefiraContentAdmin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    getSefirotContent().then(setItems).catch((e) => setError((e as Error).message));
  }, []);

  const patchLocal = (id: string, patch: Partial<SefiraContentAdmin>) =>
    setItems((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const onSave = async (s: SefiraContentAdmin) => {
    if (busy) return;
    setBusy(s.id);
    setSaved(null);
    try {
      const updated = await updateSefiraContent(s.id, {
        esencia: s.esencia ?? '',
        palabras_clave: s.palabras_clave,
        que_observa: s.que_observa ?? '',
      });
      patchLocal(s.id, updated);
      setError(null);
      setSaved(s.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      {error && <p className="text-red-400/80 text-sm mb-4">{error}</p>}
      <div className="space-y-6">
        {items.map((s) => (
          <div key={s.id} className="bg-stone-900/60 p-5 rounded-xl border border-stone-800/30">
            <h3 className="font-serif text-lg text-amber-100/90 mb-4">{s.nombre}</h3>

            <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400 block mb-2">Esencia</label>
            <textarea
              value={s.esencia ?? ''}
              onChange={(e) => patchLocal(s.id, { esencia: e.target.value })}
              className="w-full bg-stone-900/30 border border-stone-800 rounded-xl p-3 text-stone-300 mb-4 min-h-[80px] focus:outline-none focus:border-amber-400/50"
            />

            <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400 block mb-2">
              Palabras clave (separadas por comas)
            </label>
            <input
              type="text"
              value={s.palabras_clave.join(', ')}
              onChange={(e) =>
                patchLocal(s.id, {
                  palabras_clave: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                })
              }
              className="w-full bg-stone-900/30 border border-stone-800 rounded-xl p-3 text-stone-300 mb-4 focus:outline-none focus:border-amber-400/50"
            />

            <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400 block mb-2">Qué observar</label>
            <textarea
              value={s.que_observa ?? ''}
              onChange={(e) => patchLocal(s.id, { que_observa: e.target.value })}
              className="w-full bg-stone-900/30 border border-stone-800 rounded-xl p-3 text-stone-300 mb-4 min-h-[80px] focus:outline-none focus:border-amber-400/50"
            />

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onSave(s)}
                disabled={busy === s.id}
                className="bg-gradient-to-r from-amber-200 to-amber-400 text-stone-950 font-medium font-serif tracking-wide py-2.5 px-6 rounded-xl hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-wait disabled:hover:translate-y-0"
              >
                {busy === s.id ? 'Guardando…' : 'Guardar'}
              </button>
              {saved === s.id && busy === null && (
                <span className="text-amber-200/80 text-xs">Guardado ✓</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the tab in AdminModule**

En `frontend/src/admin/AdminModule.tsx`:
- Importá el panel: `import { SefirotContentPanel } from './components/SefirotContentPanel';`
- Ampliá el tipo y el array de tabs:

```typescript
type Tab = 'stats' | 'preguntas' | 'contenido' | 'usuarios';

const TABS: { key: Tab; label: string }[] = [
  { key: 'stats', label: 'Estadísticas' },
  { key: 'preguntas', label: 'Preguntas' },
  { key: 'contenido', label: 'Contenido' },
  { key: 'usuarios', label: 'Usuarios' },
];
```
- Agregá el render (junto a los otros `{tab === ... && <.../>}`):

```tsx
      {tab === 'contenido' && <SefirotContentPanel />}
```

- [ ] **Step 4: Verify the build**

Run (desde `frontend/`): `npm run build`
Expected: sin errores de TypeScript.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/admin/api.ts frontend/src/admin/components/SefirotContentPanel.tsx frontend/src/admin/AdminModule.tsx
git commit -m "feat(admin): tab 'Contenido' para editar esencia/palabras clave/qué observar por sefirá"
```

---

# PHASE 4 — Frontend: consumo en la card

### Task 5: Hook `useSefirotContenido` + `SefiraInfoCard` con fallback

**Files:**
- Create: `frontend/src/espejo/useSefirotContenido.ts`
- Modify: `frontend/src/espejo/components/SefiraInfoCard.tsx`

**Interfaces:**
- Consumes: `GET /sefirot/contenido` (Task 3); `SEFIROT_CONTENIDO` + `SefiraContenido` (`frontend/src/espejo/sefirotContent.ts`).
- Produces: `useSefirotContenido(): Record<string, SefiraContenido>` (mapea la API a la forma camelCase de `SefiraContenido`; `{}` hasta que resuelve).

- [ ] **Step 1: Create the cached fetch hook**

Create `frontend/src/espejo/useSefirotContenido.ts`:

```typescript
import { useEffect, useState } from 'react';
import { apiFetch } from '../auth';
import type { SefiraContenido } from './sefirotContent';

type ApiItem = {
  id: string;
  esencia: string | null;
  palabras_clave: string[];
  que_observa: string | null;
};

// Fetch único a nivel módulo (singleton). La card se monta muchas veces; esto
// asegura una sola llamada por sesión.
let cache: Record<string, SefiraContenido> | null = null;
let inflight: Promise<Record<string, SefiraContenido>> | null = null;

async function fetchContenido(): Promise<Record<string, SefiraContenido>> {
  const res = await apiFetch('/sefirot/contenido');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: ApiItem[] = await res.json();
  const map: Record<string, SefiraContenido> = {};
  for (const it of data) {
    map[it.id] = {
      esencia: it.esencia ?? '',
      palabrasClave: it.palabras_clave ?? [],
      queObserva: it.que_observa ?? '',
    };
  }
  return map;
}

/** Contenido de sefirot desde la API, cacheado por sesión. `{}` hasta que carga.
 *  La card cae a SEFIROT_CONTENIDO estático mientras tanto / si falla. */
export function useSefirotContenido(): Record<string, SefiraContenido> {
  const [map, setMap] = useState<Record<string, SefiraContenido>>(cache ?? {});

  useEffect(() => {
    if (cache) { setMap(cache); return; }
    if (!inflight) {
      inflight = fetchContenido()
        .then((m) => { cache = m; return m; })
        .catch(() => ({} as Record<string, SefiraContenido>))
        .finally(() => { inflight = null; });
    }
    let active = true;
    inflight.then((m) => { if (active) setMap(m); });
    return () => { active = false; };
  }, []);

  return map;
}
```

- [ ] **Step 2: Consume it in SefiraInfoCard with static fallback**

En `frontend/src/espejo/components/SefiraInfoCard.tsx`:
- Importá el hook: `import { useSefirotContenido } from '../useSefirotContenido';`
- Reemplazá el lookup directo. Actualmente:

```typescript
  const contenido = SEFIROT_CONTENIDO[sefiraId];
  const [open, setOpen] = useState(true);
  if (!contenido) return null;
```

por (llamando el hook ANTES de cualquier return temprano, para no romper el orden de hooks):

```typescript
  const remoto = useSefirotContenido();
  const [open, setOpen] = useState(true);
  const contenido = remoto[sefiraId] ?? SEFIROT_CONTENIDO[sefiraId];
  if (!contenido) return null;
```

(El resto del componente no cambia: sigue usando `contenido.esencia`, `contenido.palabrasClave`, `contenido.queObserva`.)

- [ ] **Step 3: Verify the build**

Run (desde `frontend/`): `npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/espejo/useSefirotContenido.ts frontend/src/espejo/components/SefiraInfoCard.tsx
git commit -m "feat(espejo): la card lee el contenido de la API (con sefirotContent.ts como fallback)"
```

---

# PHASE 5 — Cierre

### Task 6: Verificación integral + grafo

- [ ] **Step 1: Full backend suite**

Run (desde `backend/`): `./venv/Scripts/python.exe -m pytest -q`
Expected: PASS (sin regresiones; incluye los tests nuevos de admin + público).

- [ ] **Step 2: Frontend build**

Run (desde `frontend/`): `npm run build`
Expected: sin errores.

- [ ] **Step 3: Manual smoke (opcional, si hay entorno)**

Loguear como admin → tab "Contenido" → editar una sefirá → Guardar → abrir el Espejo → la card muestra el texto editado.

- [ ] **Step 4: Update the knowledge graph**

Run (desde raíz): `graphify update .`
Expected: grafo actualizado (AST-only).

---

## Self-Review

**1. Spec coverage:**
- Storage (3 columnas + migración + semilla) → Task 1. ✓
- API admin GET/PATCH → Task 2. ✓
- GET público → Task 3. ✓
- Tab admin + panel + api.ts → Task 4. ✓
- Consumo en la card con fallback → Task 5. ✓
- Tests backend (admin gating, 404, persistencia, público sin auth) → Tasks 2, 3. ✓
- Verificación + grafo → Task 6. ✓

**2. Placeholder scan:** El único "…" es el `SEED` dict de la migración (Task 1 Step 4), con instrucción explícita de transcribir las 10 entradas verbatim desde `sefirotContent.ts` (archivo fuente exacto + mapeo de campos) — no es un placeholder de lógica, es una transcripción de datos con fuente única para no duplicar 80 líneas de prosa que podrían divergir del TS.

**3. Type consistency:**
- `SefiraContentOut`/`SefiraContentUpdateIn` (backend) ↔ `SefiraContentAdmin`/`SefiraContentPatch` (frontend api.ts) — mismos campos snake_case (`palabras_clave`, `que_observa`). ✓
- `GET /sefirot/contenido` devuelve `{id, esencia, palabras_clave, que_observa}` ↔ el hook mapea a `SefiraContenido` camelCase (`palabrasClave`, `queObserva`) que es lo que la card ya consume. ✓
- `useSefirotContenido()` devuelve `Record<string, SefiraContenido>` ↔ `SEFIROT_CONTENIDO` es `Record<string, SefiraContenido>` → el `??` fallback es del mismo tipo. ✓
- Endpoints `/admin/sefirot` (Task 2) ↔ `getSefirotContent`/`updateSefiraContent` (Task 4). ✓
