# Panel de Administrador Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir un panel de administrador con control de acceso por rol que permita gestionar preguntas guía (CRUD + reordenar), ver estadísticas (usuarios/uso/premium) y gestionar usuarios (ver/eliminar/premium/admin).

**Architecture:** Backend nuevo paquete `backend/admin/` con `APIRouter` bajo `/admin/*`, protegido por una dependencia `require_admin` que extiende `get_current_user`. Acceso por columna `usuarios.is_admin`, con bootstrap del primer admin vía config. Frontend nuevo módulo `frontend/src/admin/` con 3 pestañas, consumiendo la API vía `apiFetch`. Reemplaza el `AdminPanel.tsx` plano y sin auth actual.

**Tech Stack:** FastAPI async + SQLAlchemy async + Alembic + pytest/pytest-asyncio (backend); React 19 + TypeScript + Tailwind + framer-motion (frontend). El frontend NO tiene test runner: se verifica con `npm run build` (tsc) y chequeo manual.

**Spec:** [docs/superpowers/specs/2026-06-03-panel-administrador-design.md](../specs/2026-06-03-panel-administrador-design.md)

**Convenciones del repo (ya verificadas):**
- Comandos backend se corren desde `backend/`. Tests: `pytest` (config en `backend/`).
- Las fixtures de test viven en [backend/tests/conftest.py](../../../backend/tests/conftest.py): `client`, `db_session`, `seed_sefirot`, `two_users`, `register_and_login`, `premium_user_headers`.
- El esquema dev (SQLite) se crea con `Base.metadata.create_all` al startup ([backend/main.py:261-264](../../../backend/main.py)); para prod hay migraciones Alembic. Por eso cada cambio de columna requiere **a la vez** editar el modelo (para create_all/tests) **y** una migración Alembic (para prod).
- `apiFetch` ([frontend/src/auth/api.ts](../../../frontend/src/auth/api.ts)) ya inyecta el token y prefija `API_BASE`.

---

## Phase A — Fundación backend (modelo + acceso)

### Task 1: Columnas `is_admin` y `orden` en los modelos + `UserOut.is_admin`

**Files:**
- Modify: `backend/models.py` (clase `Usuario`, clase `PreguntaSefira`)
- Modify: `backend/auth.py` (clase `UserOut`)
- Test: `backend/tests/test_admin_models.py` (crear)

- [ ] **Step 1: Write the failing test**

Crear `backend/tests/test_admin_models.py`:

```python
import pytest

pytestmark = pytest.mark.asyncio


async def test_new_user_defaults_is_admin_false(client):
    r = await client.post("/auth/register", json={
        "email": "nb@example.com", "password": "password1", "nombre": "NB",
    })
    assert r.status_code in (200, 201), r.text
    # UserOut debe exponer is_admin, por defecto False
    assert r.json()["is_admin"] is False


async def test_pregunta_has_orden_column(db_session, seed_sefirot):
    from models import PreguntaSefira
    from sqlalchemy import select
    p = PreguntaSefira(sefira_id="jesed", texto_pregunta="x", orden=3)
    db_session.add(p)
    await db_session.commit()
    row = (await db_session.execute(select(PreguntaSefira))).scalars().first()
    assert row.orden == 3
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_models.py -v`
Expected: FAIL — `KeyError: 'is_admin'` y/o `TypeError: 'orden' is an invalid keyword argument`.

- [ ] **Step 3: Implement model + schema changes**

En `backend/models.py`, clase `Usuario`, junto a `ksai_enabled`:

```python
    is_admin                 = Column(Boolean, nullable=False, default=False, server_default="false")
```

En `backend/models.py`, clase `PreguntaSefira`, después de `texto_pregunta`:

```python
    orden = Column(Integer, nullable=False, default=0, server_default="0")
```

En `backend/auth.py`, clase `UserOut`, agregar el campo (después de `ksai_enabled`):

```python
    is_admin: bool = False
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_models.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/models.py backend/auth.py backend/tests/test_admin_models.py
git commit -m "feat(admin): is_admin en Usuario y orden en PreguntaSefira"
```

---

### Task 2: Migración Alembic para `is_admin` y `orden`

**Files:**
- Create: `backend/alembic/versions/<autogen>_admin_columns.py`

- [ ] **Step 1: Generar el archivo de migración (head automático)**

Run: `cd backend && alembic revision -m "admin: is_admin y orden"`
Esto crea un archivo en `backend/alembic/versions/` con `down_revision` ya apuntando al head actual. Anotá la ruta generada.

- [ ] **Step 2: Escribir el cuerpo de la migración**

Reemplazar `upgrade()` y `downgrade()` del archivo generado por:

```python
def upgrade() -> None:
    op.add_column('usuarios', sa.Column('is_admin', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('preguntas_sefirot', sa.Column('orden', sa.Integer(), server_default='0', nullable=False))
    # Backfill: numerar las preguntas existentes por sefira segun fecha_creacion.
    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT id, sefira_id FROM preguntas_sefirot ORDER BY sefira_id, fecha_creacion"
    )).fetchall()
    contador: dict[str, int] = {}
    for row in rows:
        idx = contador.get(row.sefira_id, 0)
        conn.execute(
            sa.text("UPDATE preguntas_sefirot SET orden = :o WHERE id = :i"),
            {"o": idx, "i": row.id},
        )
        contador[row.sefira_id] = idx + 1


def downgrade() -> None:
    op.drop_column('preguntas_sefirot', 'orden')
    op.drop_column('usuarios', 'is_admin')
```

- [ ] **Step 3: Aplicar y verificar la migración**

Run: `cd backend && alembic upgrade head`
Expected: sin errores. (Opcional: `alembic downgrade -1 && alembic upgrade head` para verificar el roundtrip.)

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/
git commit -m "feat(admin): migracion is_admin + orden con backfill"
```

---

### Task 3: Setting `admin_bootstrap_emails` + promoción al startup

**Files:**
- Modify: `backend/config.py` (clase `Settings`)
- Modify: `backend/main.py` (handler `startup`, ~línea 261-285)
- Test: `backend/tests/test_admin_bootstrap.py` (crear)

- [ ] **Step 1: Write the failing test**

Crear `backend/tests/test_admin_bootstrap.py`:

```python
import pytest
from sqlalchemy import select

pytestmark = pytest.mark.asyncio


async def test_bootstrap_promotes_listed_emails(db_session, monkeypatch):
    from models import Usuario
    from admin.bootstrap import promote_bootstrap_admins

    u = Usuario(nombre="Owner", email="owner@example.com", provider="email", password_hash="x")
    db_session.add(u)
    await db_session.commit()

    await promote_bootstrap_admins(db_session, "owner@example.com, other@example.com")

    refreshed = (await db_session.execute(
        select(Usuario).where(Usuario.email == "owner@example.com")
    )).scalars().first()
    assert refreshed.is_admin is True


async def test_bootstrap_empty_string_is_noop(db_session):
    from admin.bootstrap import promote_bootstrap_admins
    # No debe romper con string vacio
    await promote_bootstrap_admins(db_session, "")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_bootstrap.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'admin'`.

- [ ] **Step 3: Implement**

Crear `backend/admin/__init__.py` (vacío).

Crear `backend/admin/bootstrap.py`:

```python
"""Promueve a is_admin=true los usuarios cuyos emails esten en la config.

Resuelve el problema huevo-y-gallina: sin un admin inicial, nadie podria
nombrar admins desde la UI. Idempotente: correrlo dos veces no cambia nada.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Usuario


async def promote_bootstrap_admins(db: AsyncSession, emails_csv: str) -> None:
    emails = [e.strip().lower() for e in emails_csv.split(",") if e.strip()]
    if not emails:
        return
    rows = (await db.execute(
        select(Usuario).where(Usuario.email.in_(emails))
    )).scalars().all()
    changed = False
    for u in rows:
        if not u.is_admin:
            u.is_admin = True
            changed = True
    if changed:
        await db.commit()
```

En `backend/config.py`, clase `Settings`, después de `emails_enabled`:

```python
    # ---------- Admin ----------
    # Emails (separados por coma) que se promueven a admin al arrancar la app.
    admin_bootstrap_emails: str = ""
```

En `backend/main.py`, dentro del handler `startup()` (después del bloque de seeding de sefirot, todavía dentro del `async with AsyncSession(engine) as session:`), agregar:

```python
            from admin.bootstrap import promote_bootstrap_admins
            await promote_bootstrap_admins(session, settings.admin_bootstrap_emails)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_bootstrap.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/admin/__init__.py backend/admin/bootstrap.py backend/config.py backend/main.py backend/tests/test_admin_bootstrap.py
git commit -m "feat(admin): bootstrap de admins via config al startup"
```

---

### Task 4: Dependencia `require_admin` + router montado + fixture de tests

**Files:**
- Create: `backend/admin/deps.py`
- Create: `backend/admin/routers.py`
- Modify: `backend/main.py` (imports + `include_router`)
- Modify: `backend/tests/conftest.py` (fixtures `admin_user_headers`, `normal_user_headers`)
- Test: `backend/tests/test_admin_access.py` (crear)

- [ ] **Step 1: Write the failing test**

Agregar a `backend/tests/conftest.py` (al final):

```python
@pytest_asyncio.fixture
async def admin_user_headers(client, db_session) -> dict:
    """Auth headers de un usuario con is_admin=True."""
    from sqlalchemy import select
    from models import Usuario
    bundle = await register_and_login(client, "admin@example.com", "secret123", "Admin")
    user = (await db_session.execute(
        select(Usuario).where(Usuario.id == bundle["id"])
    )).scalars().first()
    user.is_admin = True
    await db_session.commit()
    return bundle["headers"]


@pytest_asyncio.fixture
async def normal_user_headers(client) -> dict:
    bundle = await register_and_login(client, "normal@example.com", "secret123", "Normal")
    return bundle["headers"]
```

Crear `backend/tests/test_admin_access.py`:

```python
import pytest

pytestmark = pytest.mark.asyncio


async def test_admin_ping_requires_auth(client):
    r = await client.get("/admin/ping")
    assert r.status_code == 401


async def test_admin_ping_forbidden_for_normal_user(client, normal_user_headers):
    r = await client.get("/admin/ping", headers=normal_user_headers)
    assert r.status_code == 403


async def test_admin_ping_ok_for_admin(client, admin_user_headers):
    r = await client.get("/admin/ping", headers=admin_user_headers)
    assert r.status_code == 200
    assert r.json() == {"ok": True}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_access.py -v`
Expected: FAIL — 404 en `/admin/ping` (router inexistente).

- [ ] **Step 3: Implement**

Crear `backend/admin/deps.py`:

```python
"""Dependencia de autorizacion para endpoints de administrador."""
from fastapi import Depends, HTTPException, status

from auth import get_current_user
from models import Usuario


async def require_admin(user: Usuario = Depends(get_current_user)) -> Usuario:
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso de administrador requerido",
        )
    return user
```

Crear `backend/admin/routers.py`:

```python
"""Endpoints del panel de administrador. Todos exigen require_admin."""
from fastapi import APIRouter, Depends

from admin.deps import require_admin
from models import Usuario

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/ping")
async def ping(_: Usuario = Depends(require_admin)):
    return {"ok": True}
```

En `backend/main.py`, junto a los otros imports de routers (~línea 47-51):

```python
from admin.routers import router as admin_router
```

Y junto a los otros `app.include_router(...)` (~línea 88-91):

```python
app.include_router(admin_router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_access.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/admin/deps.py backend/admin/routers.py backend/main.py backend/tests/conftest.py backend/tests/test_admin_access.py
git commit -m "feat(admin): require_admin + router /admin montado"
```

---

## Phase B — Backend: preguntas

### Task 5: Listar y crear preguntas admin (con orden)

**Files:**
- Create: `backend/admin/schemas.py`
- Modify: `backend/admin/routers.py`
- Test: `backend/tests/test_admin_preguntas.py` (crear)

- [ ] **Step 1: Write the failing test**

Crear `backend/tests/test_admin_preguntas.py`:

```python
import pytest

pytestmark = pytest.mark.asyncio


async def test_list_preguntas_forbidden_for_normal(client, normal_user_headers, seed_sefirot):
    r = await client.get("/admin/preguntas/jesed", headers=normal_user_headers)
    assert r.status_code == 403


async def test_create_pregunta_assigns_incrementing_orden(client, admin_user_headers, seed_sefirot):
    r1 = await client.post("/admin/preguntas",
        json={"sefira_id": "jesed", "texto": "Primera"}, headers=admin_user_headers)
    assert r1.status_code == 201, r1.text
    assert r1.json()["orden"] == 0

    r2 = await client.post("/admin/preguntas",
        json={"sefira_id": "jesed", "texto": "Segunda"}, headers=admin_user_headers)
    assert r2.json()["orden"] == 1


async def test_list_preguntas_returns_ordered(client, admin_user_headers, seed_sefirot):
    await client.post("/admin/preguntas",
        json={"sefira_id": "jesed", "texto": "A"}, headers=admin_user_headers)
    await client.post("/admin/preguntas",
        json={"sefira_id": "jesed", "texto": "B"}, headers=admin_user_headers)
    r = await client.get("/admin/preguntas/jesed", headers=admin_user_headers)
    assert r.status_code == 200
    textos = [p["texto_pregunta"] for p in r.json()]
    assert textos == ["A", "B"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_preguntas.py -v`
Expected: FAIL — 404 (endpoints inexistentes).

- [ ] **Step 3: Implement**

Crear `backend/admin/schemas.py`:

```python
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class PreguntaCreateIn(BaseModel):
    sefira_id: str
    texto: str


class PreguntaUpdateIn(BaseModel):
    texto: str


class PreguntaReorderIn(BaseModel):
    ids: list[str]


class PreguntaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    sefira_id: str
    texto_pregunta: str
    orden: int
    fecha_creacion: Optional[datetime] = None
```

En `backend/admin/routers.py`, agregar imports y endpoints:

```python
from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import PreguntaSefira
from admin.schemas import PreguntaCreateIn, PreguntaUpdateIn, PreguntaReorderIn, PreguntaOut


@router.get("/preguntas/{sefira_id}", response_model=list[PreguntaOut])
async def list_preguntas(
    sefira_id: str,
    _: Usuario = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(PreguntaSefira)
        .where(PreguntaSefira.sefira_id == sefira_id)
        .order_by(PreguntaSefira.orden)
    )).scalars().all()
    return rows


@router.post("/preguntas", response_model=PreguntaOut, status_code=201)
async def create_pregunta(
    payload: PreguntaCreateIn,
    _: Usuario = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    max_orden = (await db.execute(
        select(func.max(PreguntaSefira.orden))
        .where(PreguntaSefira.sefira_id == payload.sefira_id)
    )).scalar()
    nueva = PreguntaSefira(
        sefira_id=payload.sefira_id,
        texto_pregunta=payload.texto,
        orden=0 if max_orden is None else max_orden + 1,
    )
    db.add(nueva)
    await db.commit()
    await db.refresh(nueva)
    return nueva
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_preguntas.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/admin/schemas.py backend/admin/routers.py backend/tests/test_admin_preguntas.py
git commit -m "feat(admin): listar y crear preguntas con orden"
```

---

### Task 6: Editar y borrar preguntas

**Files:**
- Modify: `backend/admin/routers.py`
- Test: `backend/tests/test_admin_preguntas.py` (agregar)

- [ ] **Step 1: Write the failing test**

Agregar a `backend/tests/test_admin_preguntas.py`:

```python
async def test_edit_pregunta_updates_texto(client, admin_user_headers, seed_sefirot):
    r = await client.post("/admin/preguntas",
        json={"sefira_id": "jesed", "texto": "Vieja"}, headers=admin_user_headers)
    pid = r.json()["id"]
    r2 = await client.patch(f"/admin/preguntas/{pid}",
        json={"texto": "Nueva"}, headers=admin_user_headers)
    assert r2.status_code == 200, r2.text
    assert r2.json()["texto_pregunta"] == "Nueva"


async def test_edit_pregunta_404_unknown(client, admin_user_headers, seed_sefirot):
    r = await client.patch("/admin/preguntas/nope",
        json={"texto": "x"}, headers=admin_user_headers)
    assert r.status_code == 404


async def test_delete_pregunta(client, admin_user_headers, seed_sefirot):
    r = await client.post("/admin/preguntas",
        json={"sefira_id": "jesed", "texto": "Borrar"}, headers=admin_user_headers)
    pid = r.json()["id"]
    r2 = await client.delete(f"/admin/preguntas/{pid}", headers=admin_user_headers)
    assert r2.status_code == 200
    r3 = await client.get("/admin/preguntas/jesed", headers=admin_user_headers)
    assert all(p["id"] != pid for p in r3.json())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_preguntas.py -k "edit or delete" -v`
Expected: FAIL — 404/405 (endpoints inexistentes).

- [ ] **Step 3: Implement**

Agregar a `backend/admin/routers.py`:

```python
@router.patch("/preguntas/{pregunta_id}", response_model=PreguntaOut)
async def update_pregunta(
    pregunta_id: str,
    payload: PreguntaUpdateIn,
    _: Usuario = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    pregunta = (await db.execute(
        select(PreguntaSefira).where(PreguntaSefira.id == pregunta_id)
    )).scalars().first()
    if pregunta is None:
        raise HTTPException(404, "Pregunta no encontrada")
    pregunta.texto_pregunta = payload.texto
    await db.commit()
    await db.refresh(pregunta)
    return pregunta


@router.delete("/preguntas/{pregunta_id}")
async def delete_pregunta(
    pregunta_id: str,
    _: Usuario = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    pregunta = (await db.execute(
        select(PreguntaSefira).where(PreguntaSefira.id == pregunta_id)
    )).scalars().first()
    if pregunta is None:
        raise HTTPException(404, "Pregunta no encontrada")
    await db.delete(pregunta)
    await db.commit()
    return {"ok": True}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_preguntas.py -v`
Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/admin/routers.py backend/tests/test_admin_preguntas.py
git commit -m "feat(admin): editar y borrar preguntas"
```

---

### Task 7: Reordenar preguntas

**Files:**
- Modify: `backend/admin/routers.py`
- Test: `backend/tests/test_admin_preguntas.py` (agregar)

- [ ] **Step 1: Write the failing test**

Agregar a `backend/tests/test_admin_preguntas.py`:

```python
async def test_reorder_preguntas(client, admin_user_headers, seed_sefirot):
    ids = []
    for texto in ["A", "B", "C"]:
        r = await client.post("/admin/preguntas",
            json={"sefira_id": "jesed", "texto": texto}, headers=admin_user_headers)
        ids.append(r.json()["id"])
    # Invertir el orden
    reordered = list(reversed(ids))
    r = await client.put("/admin/preguntas/jesed/orden",
        json={"ids": reordered}, headers=admin_user_headers)
    assert r.status_code == 200, r.text
    r2 = await client.get("/admin/preguntas/jesed", headers=admin_user_headers)
    assert [p["id"] for p in r2.json()] == reordered


async def test_reorder_rejects_mismatched_ids(client, admin_user_headers, seed_sefirot):
    r = await client.post("/admin/preguntas",
        json={"sefira_id": "jesed", "texto": "A"}, headers=admin_user_headers)
    pid = r.json()["id"]
    # Lista con un id ajeno
    r2 = await client.put("/admin/preguntas/jesed/orden",
        json={"ids": [pid, "fantasma"]}, headers=admin_user_headers)
    assert r2.status_code == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_preguntas.py -k reorder -v`
Expected: FAIL — 404/405.

- [ ] **Step 3: Implement**

Agregar a `backend/admin/routers.py`:

```python
@router.put("/preguntas/{sefira_id}/orden")
async def reorder_preguntas(
    sefira_id: str,
    payload: PreguntaReorderIn,
    _: Usuario = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(PreguntaSefira).where(PreguntaSefira.sefira_id == sefira_id)
    )).scalars().all()
    actuales = {p.id for p in rows}
    if set(payload.ids) != actuales:
        raise HTTPException(400, "La lista de ids no coincide con las preguntas de la sefira")
    by_id = {p.id: p for p in rows}
    for idx, pid in enumerate(payload.ids):
        by_id[pid].orden = idx
    await db.commit()
    return {"ok": True}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_preguntas.py -v`
Expected: PASS (8 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/admin/routers.py backend/tests/test_admin_preguntas.py
git commit -m "feat(admin): reordenar preguntas"
```

---

### Task 8: Endurecer endpoints públicos de preguntas

**Files:**
- Modify: `backend/main.py` (líneas 459-480: `get_preguntas`, `add_pregunta`, `delete_pregunta`)
- Test: `backend/tests/test_admin_preguntas.py` (agregar)

- [ ] **Step 1: Write the failing test**

Agregar a `backend/tests/test_admin_preguntas.py`:

```python
async def test_public_get_preguntas_is_ordered(client, admin_user_headers, seed_sefirot):
    for texto in ["A", "B"]:
        await client.post("/admin/preguntas",
            json={"sefira_id": "jesed", "texto": texto}, headers=admin_user_headers)
    # GET publico (sin auth) sigue existiendo para el modulo Espejo, ahora ordenado
    r = await client.get("/preguntas/jesed")
    assert r.status_code == 200
    assert [p["texto_pregunta"] for p in r.json()] == ["A", "B"]


async def test_old_open_post_pregunta_is_gone(client, seed_sefirot):
    # El POST abierto sin auth ya no debe existir (405 method not allowed)
    r = await client.post("/preguntas", json={"sefira_id": "jesed", "texto": "x"})
    assert r.status_code == 405
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_preguntas.py -k "public or old_open" -v`
Expected: FAIL — el POST abierto todavía responde 200; el GET puede no estar ordenado.

- [ ] **Step 3: Implement**

En `backend/main.py`, reemplazar el bloque de líneas 459-480 (los tres endpoints `get_preguntas`, `add_pregunta`, `delete_pregunta`) por SÓLO el GET público ordenado:

```python
@app.get("/preguntas/{sefira_id}")
async def get_preguntas(sefira_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PreguntaSefira)
        .where(PreguntaSefira.sefira_id == sefira_id)
        .order_by(PreguntaSefira.orden)
    )
    return result.scalars().all()
```

(Se eliminan `add_pregunta` y `delete_pregunta` abiertos; su funcionalidad vive en `/admin/preguntas/*`. Si quedó un `class PreguntaCreate` en main.py sólo usado por estos, eliminarlo también.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_preguntas.py -v`
Expected: PASS (10 passed).

- [ ] **Step 5: Run full backend suite (no regressions)**

Run: `cd backend && pytest -q`
Expected: todo verde. Si algún test viejo usaba el POST/DELETE abierto de `/preguntas`, actualizarlo para usar `/admin/preguntas/*` con `admin_user_headers`.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/tests/test_admin_preguntas.py
git commit -m "feat(admin): endurecer /preguntas (GET ordenado, quitar mutaciones abiertas)"
```

---

## Phase C — Backend: usuarios

### Task 9: Listar usuarios (búsqueda + paginación)

**Files:**
- Modify: `backend/admin/schemas.py`
- Modify: `backend/admin/routers.py`
- Test: `backend/tests/test_admin_usuarios.py` (crear)

- [ ] **Step 1: Write the failing test**

Crear `backend/tests/test_admin_usuarios.py`:

```python
import pytest

pytestmark = pytest.mark.asyncio


async def test_list_usuarios_forbidden_for_normal(client, normal_user_headers):
    r = await client.get("/admin/usuarios", headers=normal_user_headers)
    assert r.status_code == 403


async def test_list_usuarios_returns_fields(client, admin_user_headers):
    r = await client.get("/admin/usuarios", headers=admin_user_headers)
    assert r.status_code == 200
    body = r.json()
    assert "total" in body and "items" in body
    # El admin (admin@example.com) debe estar en la lista con is_admin True
    admin = next(u for u in body["items"] if u["email"] == "admin@example.com")
    assert admin["is_admin"] is True
    assert admin["is_premium"] is False
    assert {"id", "nombre", "email", "provider", "fecha_creacion"} <= set(admin.keys())


async def test_list_usuarios_search_filters(client, admin_user_headers, two_users):
    r = await client.get("/admin/usuarios?search=alice", headers=admin_user_headers)
    emails = [u["email"] for u in r.json()["items"]]
    assert "alice@example.com" in emails
    assert "bob@example.com" not in emails
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_usuarios.py -v`
Expected: FAIL — 404.

- [ ] **Step 3: Implement**

Agregar a `backend/admin/schemas.py`:

```python
class UsuarioAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    nombre: str
    email: str
    provider: str
    is_admin: bool
    is_premium: bool
    fecha_creacion: Optional[datetime] = None


class UsuariosListOut(BaseModel):
    total: int
    items: list[UsuarioAdminOut]
```

Agregar a `backend/admin/routers.py` (imports y endpoint):

```python
from typing import Optional
from fastapi import Query
from models import Usuario as UsuarioModel
from admin.schemas import UsuarioAdminOut, UsuariosListOut


@router.get("/usuarios", response_model=UsuariosListOut)
async def list_usuarios(
    _: Usuario = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    base = select(UsuarioModel)
    count_q = select(func.count()).select_from(UsuarioModel)
    if search:
        like = f"%{search.lower()}%"
        cond = func.lower(UsuarioModel.nombre).like(like) | func.lower(UsuarioModel.email).like(like)
        base = base.where(cond)
        count_q = count_q.where(cond)
    total = (await db.execute(count_q)).scalar() or 0
    rows = (await db.execute(
        base.order_by(UsuarioModel.fecha_creacion.desc()).limit(limit).offset(offset)
    )).scalars().all()
    items = [
        UsuarioAdminOut(
            id=u.id, nombre=u.nombre, email=u.email, provider=u.provider,
            is_admin=u.is_admin, is_premium=u.is_premium, fecha_creacion=u.fecha_creacion,
        )
        for u in rows
    ]
    return UsuariosListOut(total=total, items=items)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_usuarios.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/admin/schemas.py backend/admin/routers.py backend/tests/test_admin_usuarios.py
git commit -m "feat(admin): listar usuarios con busqueda y paginacion"
```

---

### Task 10: Nombrar/quitar admin (con guards anti-lockout)

**Files:**
- Modify: `backend/admin/routers.py`
- Test: `backend/tests/test_admin_usuarios.py` (agregar)

- [ ] **Step 1: Write the failing test**

Agregar a `backend/tests/test_admin_usuarios.py`:

```python
async def test_promote_and_demote_admin(client, admin_user_headers, normal_user_headers, db_session):
    from sqlalchemy import select
    from models import Usuario
    normal = (await db_session.execute(
        select(Usuario).where(Usuario.email == "normal@example.com")
    )).scalars().first()

    r = await client.post(f"/admin/usuarios/{normal.id}/admin", headers=admin_user_headers)
    assert r.status_code == 200, r.text

    r2 = await client.delete(f"/admin/usuarios/{normal.id}/admin", headers=admin_user_headers)
    assert r2.status_code == 200


async def test_cannot_demote_self(client, admin_user_headers, db_session):
    from sqlalchemy import select
    from models import Usuario
    me = (await db_session.execute(
        select(Usuario).where(Usuario.email == "admin@example.com")
    )).scalars().first()
    r = await client.delete(f"/admin/usuarios/{me.id}/admin", headers=admin_user_headers)
    assert r.status_code == 400


async def test_cannot_demote_last_admin(client, admin_user_headers, normal_user_headers, db_session):
    # admin@example.com es el unico admin. Promovemos a normal, luego degradamos
    # al admin original deberia fallar solo si quedara 0 admins; con 2 admins ok.
    from sqlalchemy import select
    from models import Usuario
    normal = (await db_session.execute(
        select(Usuario).where(Usuario.email == "normal@example.com")
    )).scalars().first()
    # No promovemos a nadie: intentar quitarse a si mismo siendo el ultimo admin -> 400
    me = (await db_session.execute(
        select(Usuario).where(Usuario.email == "admin@example.com")
    )).scalars().first()
    r = await client.delete(f"/admin/usuarios/{me.id}/admin", headers=admin_user_headers)
    assert r.status_code == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_usuarios.py -k admin -v`
Expected: FAIL — 404/405.

- [ ] **Step 3: Implement**

Agregar a `backend/admin/routers.py`:

```python
async def _get_user_or_404(db: AsyncSession, user_id: str) -> "UsuarioModel":
    u = (await db.execute(
        select(UsuarioModel).where(UsuarioModel.id == user_id)
    )).scalars().first()
    if u is None:
        raise HTTPException(404, "Usuario no encontrado")
    return u


async def _count_admins(db: AsyncSession) -> int:
    return (await db.execute(
        select(func.count()).select_from(UsuarioModel).where(UsuarioModel.is_admin == True)  # noqa: E712
    )).scalar() or 0


@router.post("/usuarios/{user_id}/admin", response_model=UsuarioAdminOut)
async def promote_admin(
    user_id: str,
    admin: Usuario = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    u = await _get_user_or_404(db, user_id)
    u.is_admin = True
    await db.commit()
    await db.refresh(u)
    return UsuarioAdminOut(id=u.id, nombre=u.nombre, email=u.email, provider=u.provider,
                           is_admin=u.is_admin, is_premium=u.is_premium, fecha_creacion=u.fecha_creacion)


@router.delete("/usuarios/{user_id}/admin", response_model=UsuarioAdminOut)
async def demote_admin(
    user_id: str,
    admin: Usuario = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(400, "No podés quitarte el rol de admin a vos mismo")
    u = await _get_user_or_404(db, user_id)
    if u.is_admin and await _count_admins(db) <= 1:
        raise HTTPException(400, "No podés dejar la plataforma sin administradores")
    u.is_admin = False
    await db.commit()
    await db.refresh(u)
    return UsuarioAdminOut(id=u.id, nombre=u.nombre, email=u.email, provider=u.provider,
                           is_admin=u.is_admin, is_premium=u.is_premium, fecha_creacion=u.fecha_creacion)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_usuarios.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/admin/routers.py backend/tests/test_admin_usuarios.py
git commit -m "feat(admin): nombrar/quitar admin con guards anti-lockout"
```

---

### Task 11: Otorgar/quitar premium manual

**Files:**
- Modify: `backend/admin/routers.py`
- Test: `backend/tests/test_admin_usuarios.py` (agregar)

- [ ] **Step 1: Write the failing test**

Agregar a `backend/tests/test_admin_usuarios.py`:

```python
async def test_grant_and_revoke_manual_premium(client, admin_user_headers, normal_user_headers, db_session):
    from sqlalchemy import select
    from models import Usuario
    normal = (await db_session.execute(
        select(Usuario).where(Usuario.email == "normal@example.com")
    )).scalars().first()

    r = await client.post(f"/admin/usuarios/{normal.id}/premium", headers=admin_user_headers)
    assert r.status_code == 200, r.text
    assert r.json()["is_premium"] is True

    r2 = await client.delete(f"/admin/usuarios/{normal.id}/premium", headers=admin_user_headers)
    assert r2.status_code == 200
    assert r2.json()["is_premium"] is False


async def test_grant_premium_twice_conflicts(client, admin_user_headers, db_session):
    from sqlalchemy import select
    from models import Usuario
    normal_email = "premium2@example.com"
    # crear usuario
    await client.post("/auth/register", json={"email": normal_email, "password": "secret123", "nombre": "P2"})
    u = (await db_session.execute(
        select(Usuario).where(Usuario.email == normal_email)
    )).scalars().first()
    r1 = await client.post(f"/admin/usuarios/{u.id}/premium", headers=admin_user_headers)
    assert r1.status_code == 200
    r2 = await client.post(f"/admin/usuarios/{u.id}/premium", headers=admin_user_headers)
    assert r2.status_code == 409
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_usuarios.py -k premium -v`
Expected: FAIL — 404/405.

- [ ] **Step 3: Implement**

Agregar a `backend/admin/routers.py` (imports y endpoints):

```python
import uuid as _uuid
from datetime import datetime, timezone, timedelta
from billing.models import Subscription


@router.post("/usuarios/{user_id}/premium", response_model=UsuarioAdminOut)
async def grant_premium(
    user_id: str,
    admin: Usuario = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    u = await _get_user_or_404(db, user_id)
    existing = (await db.execute(
        select(Subscription).where(Subscription.usuario_id == user_id)
    )).scalars().first()
    if existing is not None:
        raise HTTPException(409, "El usuario ya tiene una suscripción")
    now = datetime.now(timezone.utc)
    sub = Subscription(
        usuario_id=user_id,
        status="active",
        plan="manual",
        lemonsqueezy_subscription_id=f"manual-{_uuid.uuid4()}",
        lemonsqueezy_customer_id="manual",
        current_period_start=now,
        current_period_end=now + timedelta(days=365 * 100),  # indefinido
    )
    db.add(sub)
    await db.commit()
    await db.refresh(u)
    return UsuarioAdminOut(id=u.id, nombre=u.nombre, email=u.email, provider=u.provider,
                           is_admin=u.is_admin, is_premium=u.is_premium, fecha_creacion=u.fecha_creacion)


@router.delete("/usuarios/{user_id}/premium", response_model=UsuarioAdminOut)
async def revoke_premium(
    user_id: str,
    admin: Usuario = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    u = await _get_user_or_404(db, user_id)
    sub = (await db.execute(
        select(Subscription).where(Subscription.usuario_id == user_id)
    )).scalars().first()
    if sub is not None:
        if sub.plan != "manual":
            raise HTTPException(
                400,
                "Esta suscripción proviene de Lemonsqueezy; gestionala desde el portal de pagos.",
            )
        await db.delete(sub)
        await db.commit()
    await db.refresh(u)
    return UsuarioAdminOut(id=u.id, nombre=u.nombre, email=u.email, provider=u.provider,
                           is_admin=u.is_admin, is_premium=u.is_premium, fecha_creacion=u.fecha_creacion)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_usuarios.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/admin/routers.py backend/tests/test_admin_usuarios.py
git commit -m "feat(admin): otorgar/quitar premium manual"
```

---

### Task 12: Eliminar usuario (con guards)

**Files:**
- Modify: `backend/admin/routers.py`
- Test: `backend/tests/test_admin_usuarios.py` (agregar)

- [ ] **Step 1: Write the failing test**

Agregar a `backend/tests/test_admin_usuarios.py`:

```python
async def test_delete_user(client, admin_user_headers, normal_user_headers, db_session):
    from sqlalchemy import select
    from models import Usuario
    normal = (await db_session.execute(
        select(Usuario).where(Usuario.email == "normal@example.com")
    )).scalars().first()
    r = await client.delete(f"/admin/usuarios/{normal.id}", headers=admin_user_headers)
    assert r.status_code == 200
    gone = (await db_session.execute(
        select(Usuario).where(Usuario.id == normal.id)
    )).scalars().first()
    assert gone is None


async def test_cannot_delete_self(client, admin_user_headers, db_session):
    from sqlalchemy import select
    from models import Usuario
    me = (await db_session.execute(
        select(Usuario).where(Usuario.email == "admin@example.com")
    )).scalars().first()
    r = await client.delete(f"/admin/usuarios/{me.id}", headers=admin_user_headers)
    assert r.status_code == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_usuarios.py -k delete_user -v`
Expected: FAIL — 404/405.

- [ ] **Step 3: Implement**

Agregar a `backend/admin/routers.py`:

```python
@router.delete("/usuarios/{user_id}")
async def delete_usuario(
    user_id: str,
    admin: Usuario = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(400, "No podés eliminar tu propia cuenta desde el panel")
    u = await _get_user_or_404(db, user_id)
    if u.is_admin and await _count_admins(db) <= 1:
        raise HTTPException(400, "No podés eliminar al último administrador")
    await db.delete(u)
    await db.commit()
    return {"ok": True}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_usuarios.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/admin/routers.py backend/tests/test_admin_usuarios.py
git commit -m "feat(admin): eliminar usuario con guards"
```

---

## Phase D — Backend: estadísticas

### Task 13: `GET /admin/stats`

**Files:**
- Modify: `backend/admin/schemas.py`
- Modify: `backend/admin/routers.py`
- Test: `backend/tests/test_admin_stats.py` (crear)

- [ ] **Step 1: Write the failing test**

Crear `backend/tests/test_admin_stats.py`:

```python
import pytest

pytestmark = pytest.mark.asyncio


async def test_stats_forbidden_for_normal(client, normal_user_headers):
    r = await client.get("/admin/stats", headers=normal_user_headers)
    assert r.status_code == 403


async def test_stats_shape(client, admin_user_headers, two_users):
    r = await client.get("/admin/stats", headers=admin_user_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body.keys()) == {"usuarios", "actividad", "premium"}
    # admin + alice + bob = al menos 3
    assert body["usuarios"]["total"] >= 3
    assert "por_provider" in body["usuarios"]
    assert "email" in body["usuarios"]["por_provider"]
    assert {"reflexiones_total", "respuestas_total", "actividades_total",
            "usuarios_activos_7d", "usuarios_activos_30d", "gcal_sync_activos"} <= set(body["actividad"].keys())
    assert {"activos", "trial", "cancelados", "por_plan"} <= set(body["premium"].keys())


async def test_stats_counts_premium(client, admin_user_headers, premium_user_headers):
    r = await client.get("/admin/stats", headers=admin_user_headers)
    body = r.json()
    assert body["usuarios"]["premium"] >= 1
    assert body["premium"]["activos"] >= 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_stats.py -v`
Expected: FAIL — 404.

- [ ] **Step 3: Implement**

Agregar a `backend/admin/schemas.py`:

```python
class StatsUsuarios(BaseModel):
    total: int
    nuevos_hoy: int
    nuevos_semana: int
    nuevos_mes: int
    por_provider: dict[str, int]
    premium: int


class StatsActividad(BaseModel):
    reflexiones_total: int
    respuestas_total: int
    actividades_total: int
    usuarios_activos_7d: int
    usuarios_activos_30d: int
    gcal_sync_activos: int


class StatsPremium(BaseModel):
    activos: int
    trial: int
    cancelados: int
    por_plan: dict[str, int]


class StatsOut(BaseModel):
    usuarios: StatsUsuarios
    actividad: StatsActividad
    premium: StatsPremium
```

Agregar a `backend/admin/routers.py` (imports adicionales y endpoint):

```python
from models import RegistroDiario, RespuestaPregunta, Actividad
from admin.schemas import StatsOut, StatsUsuarios, StatsActividad, StatsPremium


@router.get("/stats", response_model=StatsOut)
async def get_stats(
    _: Usuario = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    inicio_dia = now.replace(hour=0, minute=0, second=0, microsecond=0)
    hace_7 = now - timedelta(days=7)
    hace_30 = now - timedelta(days=30)

    async def _count(stmt) -> int:
        return (await db.execute(stmt)).scalar() or 0

    total = await _count(select(func.count()).select_from(UsuarioModel))
    nuevos_hoy = await _count(select(func.count()).select_from(UsuarioModel).where(UsuarioModel.fecha_creacion >= inicio_dia))
    nuevos_semana = await _count(select(func.count()).select_from(UsuarioModel).where(UsuarioModel.fecha_creacion >= hace_7))
    nuevos_mes = await _count(select(func.count()).select_from(UsuarioModel).where(UsuarioModel.fecha_creacion >= hace_30))

    provider_rows = (await db.execute(
        select(UsuarioModel.provider, func.count()).group_by(UsuarioModel.provider)
    )).all()
    por_provider = {p: c for p, c in provider_rows}

    premium_count = await _count(
        select(func.count()).select_from(Subscription).where(Subscription.status.in_(["trial", "active"]))
    )

    usuarios = StatsUsuarios(
        total=total, nuevos_hoy=nuevos_hoy, nuevos_semana=nuevos_semana,
        nuevos_mes=nuevos_mes, por_provider=por_provider, premium=premium_count,
    )

    reflexiones = await _count(select(func.count()).select_from(RegistroDiario))
    respuestas = await _count(select(func.count()).select_from(RespuestaPregunta))
    actividades = await _count(select(func.count()).select_from(Actividad))
    gcal_activos = await _count(select(func.count()).select_from(UsuarioModel).where(UsuarioModel.gcal_sync_enabled == True))  # noqa: E712

    async def _activos(desde) -> int:
        # Usuarios distintos con al menos una respuesta o actividad creada desde `desde`.
        resp_ids = select(RespuestaPregunta.usuario_id).where(RespuestaPregunta.fecha_registro >= desde)
        act_ids = select(Actividad.usuario_id).where(Actividad.fecha_creacion >= desde)
        ids = (await db.execute(resp_ids.union(act_ids))).all()
        return len({row[0] for row in ids})

    actividad = StatsActividad(
        reflexiones_total=reflexiones, respuestas_total=respuestas, actividades_total=actividades,
        usuarios_activos_7d=await _activos(hace_7), usuarios_activos_30d=await _activos(hace_30),
        gcal_sync_activos=gcal_activos,
    )

    activos = await _count(select(func.count()).select_from(Subscription).where(Subscription.status == "active"))
    trial = await _count(select(func.count()).select_from(Subscription).where(Subscription.status == "trial"))
    cancelados = await _count(select(func.count()).select_from(Subscription).where(Subscription.canceled_at.isnot(None)))
    plan_rows = (await db.execute(
        select(Subscription.plan, func.count()).group_by(Subscription.plan)
    )).all()
    premium = StatsPremium(
        activos=activos, trial=trial, cancelados=cancelados,
        por_plan={p: c for p, c in plan_rows},
    )

    return StatsOut(usuarios=usuarios, actividad=actividad, premium=premium)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_stats.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Run full backend suite**

Run: `cd backend && pytest -q`
Expected: todo verde.

- [ ] **Step 6: Commit**

```bash
git add backend/admin/schemas.py backend/admin/routers.py backend/tests/test_admin_stats.py
git commit -m "feat(admin): endpoint de estadisticas"
```

---

## Phase E — Frontend

> El frontend no tiene test runner. Cada tarea verifica con `cd frontend && npm run build` (compila TS + Vite) y, donde aplica, chequeo manual en `npm run dev`.

### Task 14: `is_admin` en el tipo User + cliente API admin

**Files:**
- Modify: `frontend/src/auth/types.ts` (interface `User`)
- Modify: `frontend/src/auth/api.ts` (opcional: nada — fetchMe ya devuelve el JSON completo)
- Create: `frontend/src/admin/api.ts`

- [ ] **Step 1: Agregar `is_admin` al tipo User**

En `frontend/src/auth/types.ts`, interface `User`, agregar:

```typescript
  is_admin: boolean;
```

(El backend ya lo devuelve en `/auth/me`; `fetchMe` retorna el JSON tal cual, así que fluye solo.)

- [ ] **Step 2: Crear el cliente API admin**

Crear `frontend/src/admin/api.ts`:

```typescript
import { apiFetch } from '../auth/api';

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === 'string') return body.detail;
  } catch { /* ignore */ }
  return `HTTP ${res.status}`;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}

// ---------- Tipos ----------
export interface PreguntaAdmin {
  id: string;
  sefira_id: string;
  texto_pregunta: string;
  orden: number;
  fecha_creacion: string | null;
}

export interface UsuarioAdmin {
  id: string;
  nombre: string;
  email: string;
  provider: string;
  is_admin: boolean;
  is_premium: boolean;
  fecha_creacion: string | null;
}

export interface UsuariosList {
  total: number;
  items: UsuarioAdmin[];
}

export interface AdminStats {
  usuarios: {
    total: number; nuevos_hoy: number; nuevos_semana: number; nuevos_mes: number;
    por_provider: Record<string, number>; premium: number;
  };
  actividad: {
    reflexiones_total: number; respuestas_total: number; actividades_total: number;
    usuarios_activos_7d: number; usuarios_activos_30d: number; gcal_sync_activos: number;
  };
  premium: { activos: number; trial: number; cancelados: number; por_plan: Record<string, number>; };
}

// ---------- Preguntas ----------
export async function listPreguntas(sefiraId: string): Promise<PreguntaAdmin[]> {
  return json(await apiFetch(`/admin/preguntas/${sefiraId}`));
}
export async function createPregunta(sefiraId: string, texto: string): Promise<PreguntaAdmin> {
  return json(await apiFetch('/admin/preguntas', {
    method: 'POST', body: JSON.stringify({ sefira_id: sefiraId, texto }),
  }));
}
export async function updatePregunta(id: string, texto: string): Promise<PreguntaAdmin> {
  return json(await apiFetch(`/admin/preguntas/${id}`, {
    method: 'PATCH', body: JSON.stringify({ texto }),
  }));
}
export async function deletePregunta(id: string): Promise<void> {
  const res = await apiFetch(`/admin/preguntas/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await parseError(res));
}
export async function reorderPreguntas(sefiraId: string, ids: string[]): Promise<void> {
  const res = await apiFetch(`/admin/preguntas/${sefiraId}/orden`, {
    method: 'PUT', body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

// ---------- Usuarios ----------
export async function listUsuarios(search = '', limit = 50, offset = 0): Promise<UsuariosList> {
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (search) qs.set('search', search);
  return json(await apiFetch(`/admin/usuarios?${qs.toString()}`));
}
export async function setAdmin(userId: string, makeAdmin: boolean): Promise<UsuarioAdmin> {
  return json(await apiFetch(`/admin/usuarios/${userId}/admin`, {
    method: makeAdmin ? 'POST' : 'DELETE',
  }));
}
export async function setPremium(userId: string, grant: boolean): Promise<UsuarioAdmin> {
  return json(await apiFetch(`/admin/usuarios/${userId}/premium`, {
    method: grant ? 'POST' : 'DELETE',
  }));
}
export async function deleteUsuario(userId: string): Promise<void> {
  const res = await apiFetch(`/admin/usuarios/${userId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await parseError(res));
}

// ---------- Stats ----------
export async function getStats(): Promise<AdminStats> {
  return json(await apiFetch('/admin/stats'));
}
```

- [ ] **Step 3: Verificar build**

Run: `cd frontend && npm run build`
Expected: compila sin errores de tipos.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/auth/types.ts frontend/src/admin/api.ts
git commit -m "feat(admin): tipo User.is_admin + cliente API admin"
```

---

### Task 15: `AdminModule` con pestañas + navegación gateada + eliminar panel viejo

**Files:**
- Create: `frontend/src/admin/AdminModule.tsx`
- Create: `frontend/src/admin/index.ts`
- Modify: `frontend/src/App.tsx` (import, render de la vista admin, listener `navigate:admin`)
- Modify: `frontend/src/inicio/components/InicioNav.tsx` (item de menú admin para admins)
- Delete: `frontend/src/AdminPanel.tsx`

- [ ] **Step 1: Crear el módulo con pestañas (placeholders de paneles)**

Crear `frontend/src/admin/AdminModule.tsx`:

```tsx
import { useState } from 'react';
import { PreguntasPanel } from './components/PreguntasPanel';
import { UsuariosPanel } from './components/UsuariosPanel';
import { StatsPanel } from './components/StatsPanel';

type Tab = 'stats' | 'preguntas' | 'usuarios';

const TABS: { key: Tab; label: string }[] = [
  { key: 'stats', label: 'Estadísticas' },
  { key: 'preguntas', label: 'Preguntas' },
  { key: 'usuarios', label: 'Usuarios' },
];

export default function AdminModule({ sefirot, glowText }: { sefirot: any[]; glowText: string }) {
  const [tab, setTab] = useState<Tab>('stats');
  return (
    <div className="w-full max-w-5xl mx-auto bg-stone-950/40 backdrop-blur-2xl border border-stone-800/60 rounded-2xl p-6 md:p-8 relative z-10">
      <div className="flex items-center gap-3 mb-6">
        <span className="material-symbols-outlined text-amber-300 text-3xl">admin_panel_settings</span>
        <h2 className={`font-serif text-2xl md:text-3xl tracking-tight ${glowText}`}>Panel de Administrador</h2>
      </div>

      <div className="flex gap-1 mb-8 border-b border-stone-800/60">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-xs uppercase tracking-[0.18em] transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'text-amber-200 border-amber-300/70'
                : 'text-stone-400 border-transparent hover:text-amber-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'stats' && <StatsPanel />}
      {tab === 'preguntas' && <PreguntasPanel sefirot={sefirot} />}
      {tab === 'usuarios' && <UsuariosPanel />}
    </div>
  );
}
```

Crear `frontend/src/admin/index.ts`:

```typescript
export { default as AdminModule } from './AdminModule';
```

- [ ] **Step 2: Crear stubs mínimos de los 3 paneles (para que compile)**

Crear `frontend/src/admin/components/StatsPanel.tsx`:

```tsx
export function StatsPanel() {
  return <p className="text-stone-400 text-sm">Estadísticas (próximamente).</p>;
}
```

Crear `frontend/src/admin/components/PreguntasPanel.tsx`:

```tsx
export function PreguntasPanel({ sefirot }: { sefirot: any[] }) {
  void sefirot;
  return <p className="text-stone-400 text-sm">Preguntas (próximamente).</p>;
}
```

Crear `frontend/src/admin/components/UsuariosPanel.tsx`:

```tsx
export function UsuariosPanel() {
  return <p className="text-stone-400 text-sm">Usuarios (próximamente).</p>;
}
```

- [ ] **Step 3: Cablear en App.tsx y eliminar el panel viejo**

En `frontend/src/App.tsx`:
- Reemplazar la línea 3 `import AdminPanel from "./AdminPanel";` por:
  ```tsx
  import { AdminModule } from "./admin";
  ```
- Reemplazar la línea 170 `{activeView === 'admin' && <AdminPanel sefirot={SEFIROT} glowText={glowText} />}` por:
  ```tsx
  {activeView === 'admin' && <AdminModule sefirot={SEFIROT} glowText={glowText} />}
  ```
- Agregar un listener de navegación admin junto a los otros (después del bloque `navigate:calendario`, ~línea 90):
  ```tsx
  useEffect(() => {
    const handler = () => setActiveView('admin');
    window.addEventListener('navigate:admin', handler);
    return () => window.removeEventListener('navigate:admin', handler);
  }, [setActiveView]);
  ```

Eliminar el archivo `frontend/src/AdminPanel.tsx`:

```bash
git rm frontend/src/AdminPanel.tsx
```

- [ ] **Step 4: Agregar item de menú admin (sólo visible para admins) en InicioNav**

En `frontend/src/inicio/components/InicioNav.tsx`, dentro del dropdown del avatar, justo ANTES del botón "Mi cuenta" (línea ~248), agregar:

```tsx
                    {auth.user.is_admin && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          window.dispatchEvent(new CustomEvent('navigate:admin'));
                        }}
                        className="w-full px-4 py-2.5 flex items-center gap-2 text-stone-300 hover:text-amber-200 hover:bg-stone-900/80 text-xs tracking-wide transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">admin_panel_settings</span>
                        Panel de administrador
                      </button>
                    )}
```

- [ ] **Step 5: Verificar build**

Run: `cd frontend && npm run build`
Expected: compila sin errores.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/admin/ frontend/src/App.tsx frontend/src/inicio/components/InicioNav.tsx
git rm frontend/src/AdminPanel.tsx
git commit -m "feat(admin): AdminModule con pestanas, nav gateada para admins, baja del panel viejo"
```

---

### Task 16: `PreguntasPanel` completo (CRUD + reordenar)

**Files:**
- Modify: `frontend/src/admin/components/PreguntasPanel.tsx`

- [ ] **Step 1: Implementar el panel**

Reemplazar `frontend/src/admin/components/PreguntasPanel.tsx` por:

```tsx
import { useEffect, useState } from 'react';
import {
  listPreguntas, createPregunta, updatePregunta, deletePregunta, reorderPreguntas,
  type PreguntaAdmin,
} from '../api';

export function PreguntasPanel({ sefirot }: { sefirot: { id: string; name: string }[] }) {
  const [sefiraId, setSefiraId] = useState(sefirot[0]?.id ?? '');
  const [items, setItems] = useState<PreguntaAdmin[]>([]);
  const [nuevo, setNuevo] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editTexto, setEditTexto] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try { setItems(await listPreguntas(sefiraId)); setError(null); }
    catch (e) { setError((e as Error).message); }
  };

  useEffect(() => { if (sefiraId) load(); /* eslint-disable-next-line */ }, [sefiraId]);

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevo.trim()) return;
    try { await createPregunta(sefiraId, nuevo.trim()); setNuevo(''); await load(); }
    catch (e) { setError((e as Error).message); }
  };

  const onSaveEdit = async (id: string) => {
    try { await updatePregunta(id, editTexto.trim()); setEditId(null); await load(); }
    catch (e) { setError((e as Error).message); }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('¿Borrar esta pregunta? Afecta a todos los usuarios.')) return;
    try { await deletePregunta(id); await load(); }
    catch (e) { setError((e as Error).message); }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next); // optimista
    try { await reorderPreguntas(sefiraId, next.map((p) => p.id)); }
    catch (e) { setError((e as Error).message); await load(); }
  };

  return (
    <div>
      {error && <p className="text-red-400/80 text-sm mb-4">{error}</p>}

      <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400 block mb-2">Sefirá</label>
      <select
        value={sefiraId}
        onChange={(e) => setSefiraId(e.target.value)}
        className="w-full bg-[#070709] border border-stone-800 rounded-xl p-3 text-stone-300 mb-6 focus:outline-none focus:border-amber-400/50"
      >
        {sefirot.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>

      <ul className="space-y-3 mb-6">
        {items.length === 0 && <li className="text-stone-500 italic text-sm">No hay preguntas para esta sefirá.</li>}
        {items.map((p, i) => (
          <li key={p.id} className="flex items-start gap-3 bg-stone-900/70 p-4 rounded-xl border border-stone-800/30">
            <div className="flex flex-col gap-1 pt-0.5">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                className="text-stone-500 hover:text-amber-200 disabled:opacity-30">
                <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1}
                className="text-stone-500 hover:text-amber-200 disabled:opacity-30">
                <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
              </button>
            </div>
            <div className="flex-1 min-w-0">
              {editId === p.id ? (
                <div className="flex flex-col gap-2">
                  <textarea value={editTexto} onChange={(e) => setEditTexto(e.target.value)}
                    className="w-full bg-stone-900/30 border border-stone-800 rounded-lg p-2 text-stone-200 text-sm" />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => onSaveEdit(p.id)} className="text-amber-200 text-xs">Guardar</button>
                    <button type="button" onClick={() => setEditId(null)} className="text-stone-500 text-xs">Cancelar</button>
                  </div>
                </div>
              ) : (
                <span className="text-stone-300 text-sm font-light leading-relaxed">{p.texto_pregunta}</span>
              )}
            </div>
            {editId !== p.id && (
              <div className="flex gap-1 shrink-0">
                <button type="button" onClick={() => { setEditId(p.id); setEditTexto(p.texto_pregunta); }}
                  className="text-stone-500 hover:text-amber-200 p-1.5 rounded-lg hover:bg-stone-800/50">
                  <span className="material-symbols-outlined text-[18px]">edit</span>
                </button>
                <button type="button" onClick={() => onDelete(p.id)}
                  className="text-red-400/60 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-400/10">
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={onAdd} className="bg-[#070709]/50 p-5 rounded-xl border border-stone-800/30">
        <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400 block mb-3">Nueva pregunta</label>
        <textarea value={nuevo} onChange={(e) => setNuevo(e.target.value)} required
          placeholder="Escribí una pregunta para la dimensión..."
          className="w-full bg-stone-900/30 border border-stone-800 rounded-xl p-4 text-stone-300 placeholder:text-stone-600 mb-4 min-h-[90px] focus:outline-none focus:border-amber-400/50" />
        <button type="submit"
          className="w-full bg-gradient-to-r from-amber-200 to-amber-400 text-stone-950 font-medium font-serif tracking-wide py-3 px-6 rounded-xl hover:-translate-y-0.5 transition-all">
          Guardar pregunta
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Verificar build**

Run: `cd frontend && npm run build`
Expected: compila sin errores.

- [ ] **Step 3: Verificación manual**

Run: `cd frontend && npm run dev` (con el backend corriendo y tu email en `admin_bootstrap_emails`). Iniciá sesión, abrí el panel → pestaña Preguntas: crear, editar, reordenar (↑/↓) y borrar deben funcionar y persistir al recargar.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/admin/components/PreguntasPanel.tsx
git commit -m "feat(admin): panel de preguntas (CRUD + reordenar)"
```

---

### Task 17: `UsuariosPanel` completo

**Files:**
- Modify: `frontend/src/admin/components/UsuariosPanel.tsx`

- [ ] **Step 1: Implementar el panel**

Reemplazar `frontend/src/admin/components/UsuariosPanel.tsx` por:

```tsx
import { useEffect, useState } from 'react';
import {
  listUsuarios, setAdmin, setPremium, deleteUsuario, type UsuarioAdmin,
} from '../api';

export function UsuariosPanel() {
  const [items, setItems] = useState<UsuarioAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try { const r = await listUsuarios(search); setItems(r.items); setTotal(r.total); setError(null); }
    catch (e) { setError((e as Error).message); }
  };

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce de búsqueda
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [search]);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try { await fn(); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <div>
      {error && <p className="text-red-400/80 text-sm mb-4">{error}</p>}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nombre o email..."
        className="w-full bg-[#070709] border border-stone-800 rounded-xl p-3 text-stone-300 placeholder:text-stone-600 mb-4 focus:outline-none focus:border-amber-400/50"
      />
      <p className="text-stone-500 text-xs mb-3">{total} usuario(s)</p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-stone-500 text-[10px] uppercase tracking-[0.16em] text-left border-b border-stone-800/60">
              <th className="py-2 pr-3">Nombre</th>
              <th className="py-2 pr-3">Email</th>
              <th className="py-2 pr-3">Proveedor</th>
              <th className="py-2 pr-3">Premium</th>
              <th className="py-2 pr-3">Admin</th>
              <th className="py-2 pr-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id} className="border-b border-stone-800/30 text-stone-300">
                <td className="py-2.5 pr-3">{u.nombre}</td>
                <td className="py-2.5 pr-3 text-stone-400">{u.email}</td>
                <td className="py-2.5 pr-3 text-stone-400">{u.provider}</td>
                <td className="py-2.5 pr-3">{u.is_premium ? '★' : '—'}</td>
                <td className="py-2.5 pr-3">{u.is_admin ? '✓' : '—'}</td>
                <td className="py-2.5 pr-3">
                  <div className="flex gap-2 items-center">
                    <button type="button" disabled={busy === u.id}
                      onClick={() => act(u.id, () => setPremium(u.id, !u.is_premium))}
                      className="text-[11px] text-amber-200/80 hover:text-amber-200 disabled:opacity-40">
                      {u.is_premium ? 'Quitar premium' : 'Dar premium'}
                    </button>
                    <button type="button" disabled={busy === u.id}
                      onClick={() => act(u.id, () => setAdmin(u.id, !u.is_admin))}
                      className="text-[11px] text-indigo-300/80 hover:text-indigo-300 disabled:opacity-40">
                      {u.is_admin ? 'Quitar admin' : 'Hacer admin'}
                    </button>
                    <button type="button" disabled={busy === u.id}
                      onClick={() => {
                        if (window.confirm(`¿Eliminar a ${u.email}? Esta acción es irreversible.`)) {
                          act(u.id, () => deleteUsuario(u.id));
                        }
                      }}
                      className="text-[11px] text-red-400/70 hover:text-red-400 disabled:opacity-40">
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar build**

Run: `cd frontend && npm run build`
Expected: compila sin errores.

- [ ] **Step 3: Verificación manual**

En `npm run dev`: la pestaña Usuarios lista usuarios, la búsqueda filtra, y los botones premium/admin/eliminar reflejan el cambio. Verificá que los guards del backend devuelven un mensaje (ej. intentar quitarte admin a vos mismo muestra el error en rojo).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/admin/components/UsuariosPanel.tsx
git commit -m "feat(admin): panel de usuarios (ver/buscar/premium/admin/eliminar)"
```

---

### Task 18: `StatsPanel` completo

**Files:**
- Modify: `frontend/src/admin/components/StatsPanel.tsx`

- [ ] **Step 1: Implementar el panel**

Reemplazar `frontend/src/admin/components/StatsPanel.tsx` por:

```tsx
import { useEffect, useState } from 'react';
import { getStats, type AdminStats } from '../api';

function Card({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-stone-900/60 border border-stone-800/40 rounded-xl p-4">
      <p className="text-stone-500 text-[10px] uppercase tracking-[0.16em] mb-1">{label}</p>
      <p className="text-amber-100 text-2xl font-serif">{value}</p>
    </div>
  );
}

export function StatsPanel() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStats().then(setStats).catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <p className="text-red-400/80 text-sm">{error}</p>;
  if (!stats) return <p className="text-stone-400 text-sm">Cargando…</p>;

  return (
    <div className="space-y-8">
      <section>
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-200/80 mb-3 border-b border-stone-800/60 pb-2">Usuarios</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="Total" value={stats.usuarios.total} />
          <Card label="Nuevos hoy" value={stats.usuarios.nuevos_hoy} />
          <Card label="Nuevos (7d)" value={stats.usuarios.nuevos_semana} />
          <Card label="Nuevos (30d)" value={stats.usuarios.nuevos_mes} />
          <Card label="Email" value={stats.usuarios.por_provider.email ?? 0} />
          <Card label="Google" value={stats.usuarios.por_provider.google ?? 0} />
          <Card label="Premium" value={stats.usuarios.premium} />
        </div>
      </section>

      <section>
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-200/80 mb-3 border-b border-stone-800/60 pb-2">Actividad</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card label="Reflexiones" value={stats.actividad.reflexiones_total} />
          <Card label="Respuestas" value={stats.actividad.respuestas_total} />
          <Card label="Actividades" value={stats.actividad.actividades_total} />
          <Card label="Activos (7d)" value={stats.actividad.usuarios_activos_7d} />
          <Card label="Activos (30d)" value={stats.actividad.usuarios_activos_30d} />
          <Card label="Sync GCal" value={stats.actividad.gcal_sync_activos} />
        </div>
      </section>

      <section>
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-200/80 mb-3 border-b border-stone-800/60 pb-2">Premium</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card label="Activos" value={stats.premium.activos} />
          <Card label="Trial" value={stats.premium.trial} />
          <Card label="Cancelados" value={stats.premium.cancelados} />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verificar build**

Run: `cd frontend && npm run build`
Expected: compila sin errores.

- [ ] **Step 3: Verificación manual + suite backend completa**

Run: `cd frontend && npm run dev` → la pestaña Estadísticas muestra las tarjetas con números reales.
Run: `cd backend && pytest -q` → toda la suite verde.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/admin/components/StatsPanel.tsx
git commit -m "feat(admin): panel de estadisticas"
```

---

## Notas de despliegue / post-implementación

- Setear `ADMIN_BOOTSTRAP_EMAILS=tu-email@dominio.com` en el `.env` del backend (prod y dev). Al reiniciar la app, ese usuario (si existe) queda admin.
- Correr `alembic upgrade head` en prod antes de desplegar el código nuevo.
- `API_BASE` está hardcodeado a `http://127.0.0.1:8000` en [frontend/src/shared/tokens.ts](../../../frontend/src/shared/tokens.ts); en prod ya debería estar parametrizado por el build — este plan no lo cambia.
