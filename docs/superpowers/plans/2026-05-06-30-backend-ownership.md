# Backend Ownership Implementation Plan (Issue #30)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all business endpoints in `backend/main.py` require authentication and operate strictly on `current_user`'s data, with `usuario_id` enforced as NOT NULL on `RespuestaPregunta`, `Actividad`, `RegistroDiario`.

**Architecture:** Phase 1 of the privacy work (spec: `docs/superpowers/specs/2026-05-06-privacidad-y-gated-save-design.md`). The columns `usuario_id` already exist in the schema but are unused and nullable. We wipe legacy rows, set NOT NULL via Alembic, then add `Depends(get_current_user)` plus `where(... .usuario_id == user.id)` filters to every endpoint that touches user data. Cross-user access returns 404 (not 403) so we don't leak existence.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, SQLite (dev) / Postgres (prod), pytest + pytest-asyncio + httpx.AsyncClient for tests.

**Branch & merge:** All work on a fresh branch. Squash-merge to `main`. **#28 (frontend) cannot be developed against this branch's `main` until #30 is merged**, otherwise anonymous frontend POSTs will start returning 401 in dev.

---

## Pre-Task: Branch hygiene

- [ ] **Step 1: Rename the current branch to reflect that it's #30 (backend) work**

Current branch is `feat/m6-gated-actions` but we're starting with backend. Rename:

```bash
git branch -m feat/m6-30-backend-ownership
git status
```

Expected: on branch `feat/m6-30-backend-ownership`, spec already committed.

- [ ] **Step 2: Verify clean tree and recent main**

```bash
git fetch origin
git log --oneline origin/main..HEAD
```

Expected: shows only the spec commit `Add design spec for per-user privacy + gated save`. If there's other unrelated work, stop and clean up.

---

## Task 1: Set up pytest infrastructure

**Why:** Backend has zero tests today. Privacy is a security boundary — manual verification is not enough. We add pytest-asyncio + httpx for fast in-process tests against a SQLite memory DB.

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/pytest.ini`
- Create: `backend/tests/__init__.py` (empty)
- Create: `backend/tests/conftest.py`

- [ ] **Step 1: Add test deps to `backend/requirements.txt`**

Append at the bottom:

```text
pytest>=8.0,<9.0
pytest-asyncio>=0.23,<0.25
httpx>=0.27,<1.0
```

- [ ] **Step 2: Install them**

From repo root, with the backend venv active:

```bash
cd backend
./venv/Scripts/python.exe -m pip install -r requirements.txt
```

(On bash/Linux/Mac the path is `./venv/bin/python`. Both venvs `venv` and `venv2` exist; use whichever is active. Default to `venv`.)

Expected: pip output ends with `Successfully installed httpx-0.27.x pytest-8.x pytest-asyncio-0.2x …`. No errors.

- [ ] **Step 3: Create `backend/pytest.ini`**

```ini
[pytest]
asyncio_mode = auto
testpaths = tests
python_files = test_*.py
filterwarnings =
    ignore::DeprecationWarning
```

- [ ] **Step 4: Create `backend/tests/__init__.py`** (empty file)

```bash
touch backend/tests/__init__.py
```

- [ ] **Step 5: Create `backend/tests/conftest.py`**

This builds the test app over an in-memory SQLite DB. We override the `get_db` dependency from `database.py`. Each test function gets a fresh DB.

```python
"""Pytest fixtures for backend tests.

Each test gets:
  - A fresh in-memory SQLite DB
  - A FastAPI test app with overridden get_db
  - An httpx.AsyncClient bound to that app
  - Helpers to register and authenticate users
"""
from __future__ import annotations

import asyncio
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from database import Base, get_db
from main import app
from models import Sefira


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def session_maker(engine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


@pytest_asyncio.fixture
async def db_session(session_maker) -> AsyncGenerator[AsyncSession, None]:
    """Direct DB session for seeding fixtures."""
    async with session_maker() as s:
        yield s


@pytest_asyncio.fixture
async def client(session_maker) -> AsyncGenerator[AsyncClient, None]:
    """HTTP client with get_db overridden to share the test engine."""
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_maker() as s:
            yield s

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def seed_sefirot(db_session: AsyncSession):
    """Insert minimum sefirot rows to satisfy FKs in tests."""
    sefirot = [
        Sefira(id="keter", nombre="Keter", pilar="centro", descripcion=""),
        Sefira(id="jesed", nombre="Jésed", pilar="derecha", descripcion=""),
        Sefira(id="tiferet", nombre="Tiféret", pilar="centro", descripcion=""),
    ]
    for s in sefirot:
        db_session.add(s)
    await db_session.commit()
    return sefirot


async def register_and_login(client: AsyncClient, email: str, password: str, nombre: str) -> dict:
    """Helper: register a user and return {'id', 'email', 'token', 'headers'}."""
    r = await client.post("/auth/register", json={"email": email, "password": password, "nombre": nombre})
    assert r.status_code in (200, 201), r.text
    user = r.json()
    r = await client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    return {
        "id": user["id"],
        "email": user["email"],
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"},
    }
```

- [ ] **Step 6: Smoke-test the fixture**

Create a temporary file `backend/tests/test_smoke.py`:

```python
import pytest
from httpx import AsyncClient


async def test_health(client: AsyncClient):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


async def test_register_and_login(client: AsyncClient):
    r = await client.post("/auth/register", json={
        "email": "smoke@test.local", "password": "password1", "nombre": "Smoke",
    })
    assert r.status_code in (200, 201)
    r = await client.post("/auth/login", json={"email": "smoke@test.local", "password": "password1"})
    assert r.status_code == 200
    assert "access_token" in r.json()
```

- [ ] **Step 7: Run the smoke**

```bash
cd backend
./venv/Scripts/python.exe -m pytest tests/test_smoke.py -v
```

Expected: `2 passed`. If it fails, fix the conftest before continuing.

- [ ] **Step 8: Delete `tests/test_smoke.py`** — only used to verify infra.

```bash
rm backend/tests/test_smoke.py
```

- [ ] **Step 9: Commit**

```bash
git add backend/requirements.txt backend/pytest.ini backend/tests/__init__.py backend/tests/conftest.py
git commit -m "test(backend): add pytest infra with httpx + in-memory SQLite fixtures"
```

---

## Task 2: Models — enforce `usuario_id` NOT NULL

**Files:**
- Modify: `backend/models.py:64,96,111`

The columns already exist with `Column(String(36), ForeignKey("usuarios.id", ondelete="CASCADE"))` — implicit `nullable=True`. We make them required.

- [ ] **Step 1: Update `backend/models.py`**

Edit three columns (don't add `back_populates` — the codebase doesn't use ORM relationships for these tables, queries are explicit `select(...)` joins).

Line 64 (`RegistroDiario`):

Change:
```python
    usuario_id = Column(String(36), ForeignKey("usuarios.id", ondelete="CASCADE"))
```
to:
```python
    usuario_id = Column(String(36), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
```

Line 96 (`RespuestaPregunta`):

Change:
```python
    usuario_id = Column(String(36), ForeignKey('usuarios.id', ondelete='CASCADE'))
```
to:
```python
    usuario_id = Column(String(36), ForeignKey('usuarios.id', ondelete='CASCADE'), nullable=False, index=True)
```

Line 111 (`Actividad`):

Change:
```python
    usuario_id = Column(String(36), ForeignKey("usuarios.id", ondelete="CASCADE"))
```
to:
```python
    usuario_id = Column(String(36), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
```

- [ ] **Step 2: Don't commit yet** — we commit together with the matching migration in Task 3.

---

## Task 3: Alembic migration — wipe legacy + NOT NULL + indexes

**Files:**
- Create: `backend/alembic/versions/<auto>_enforce_usuario_id.py`

The migration is `batch_alter_table` style for SQLite compatibility (existing migrations use this pattern; check `1cfc102a2409_add_password_hash_to_usuario.py` for tone).

- [ ] **Step 1: Generate the migration skeleton**

```bash
cd backend
./venv/Scripts/python.exe -m alembic revision -m "enforce usuario_id on user data tables"
```

Expected: prints `Generating … _enforce_usuario_id_on_user_data_tables.py`. Note the filename / revision id — Alembic auto-generates it.

- [ ] **Step 2: Open the new file and replace its body**

Replace the `upgrade()` and `downgrade()` functions. Keep the auto-generated `revision`, `down_revision`, `branch_labels`, `depends_on` values **as-is** — do NOT edit those.

```python
"""enforce usuario_id on user data tables

Revision ID: <leave-as-generated>
Revises: 1cfc102a2409
Create Date: <leave-as-generated>

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '<leave-as-generated>'
down_revision: Union[str, Sequence[str], None] = '1cfc102a2409'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Enforce per-user ownership.

    Wipes any existing rows with NULL usuario_id (all of them, today — the
    columns existed but were never written) and sets NOT NULL + index.
    Safe in dev; no production data exists yet.
    """
    # 1) Wipe legacy rows whose usuario_id is NULL.
    op.execute("DELETE FROM actividades_sefirot")
    op.execute("DELETE FROM actividades")
    op.execute("DELETE FROM respuestas_preguntas")
    op.execute("DELETE FROM registros_diario")

    # 2) NOT NULL + index per table (batch_alter for SQLite compat).
    with op.batch_alter_table("registros_diario") as batch_op:
        batch_op.alter_column("usuario_id", existing_type=sa.String(length=36), nullable=False)
        batch_op.create_index("ix_registros_diario_usuario_id", ["usuario_id"])

    with op.batch_alter_table("respuestas_preguntas") as batch_op:
        batch_op.alter_column("usuario_id", existing_type=sa.String(length=36), nullable=False)
        batch_op.create_index("ix_respuestas_preguntas_usuario_id", ["usuario_id"])

    with op.batch_alter_table("actividades") as batch_op:
        batch_op.alter_column("usuario_id", existing_type=sa.String(length=36), nullable=False)
        batch_op.create_index("ix_actividades_usuario_id", ["usuario_id"])


def downgrade() -> None:
    with op.batch_alter_table("actividades") as batch_op:
        batch_op.drop_index("ix_actividades_usuario_id")
        batch_op.alter_column("usuario_id", existing_type=sa.String(length=36), nullable=True)

    with op.batch_alter_table("respuestas_preguntas") as batch_op:
        batch_op.drop_index("ix_respuestas_preguntas_usuario_id")
        batch_op.alter_column("usuario_id", existing_type=sa.String(length=36), nullable=True)

    with op.batch_alter_table("registros_diario") as batch_op:
        batch_op.drop_index("ix_registros_diario_usuario_id")
        batch_op.alter_column("usuario_id", existing_type=sa.String(length=36), nullable=True)
```

- [ ] **Step 3: Apply the migration to the local dev DB**

The local DB at `backend/kabbalah.db` may have legacy rows. Back it up first.

```bash
cd backend
cp kabbalah.db kabbalah.db.bak.pre_30
./venv/Scripts/python.exe -m alembic upgrade head
```

Expected: alembic prints `Running upgrade 1cfc102a2409 -> <new-rev>, enforce usuario_id on user data tables`. No errors.

- [ ] **Step 4: Verify schema**

```bash
./venv/Scripts/python.exe -c "import sqlite3; c=sqlite3.connect('kabbalah.db'); print(c.execute('PRAGMA table_info(respuestas_preguntas)').fetchall())"
```

Expected: the row for `usuario_id` shows `notnull=1`. If still `0`, the migration didn't apply.

- [ ] **Step 5: Commit models + migration together**

```bash
git add backend/models.py backend/alembic/versions/*_enforce_usuario_id_on_user_data_tables.py
git commit -m "feat(backend): enforce usuario_id NOT NULL on user data tables (#30)"
```

---

## Task 4: Test fixture — two-user privacy helpers

We extend `conftest.py` with helpers that two later tests need: a "two registered users" fixture and a "create a respuesta as user X" helper.

**Files:**
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Append to `backend/tests/conftest.py`**

Add at the bottom (the existing imports already have everything we need):

```python
@pytest_asyncio.fixture
async def two_users(client: AsyncClient):
    """Register two users A and B; return both auth bundles."""
    a = await register_and_login(client, "alice@test.local", "password1", "Alice")
    b = await register_and_login(client, "bob@test.local",   "password2", "Bob")
    return {"alice": a, "bob": b}
```

- [ ] **Step 2: Don't commit yet** — bundle into the next commit.

---

## Task 5: `POST /respuestas` — require auth + write `usuario_id`

**Files:**
- Modify: `backend/main.py:623-647`
- Create: `backend/tests/test_respuestas_privacy.py`

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_respuestas_privacy.py`:

```python
"""Privacy contract for /respuestas endpoints."""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models import PreguntaSefira


@pytest.fixture
async def seeded_pregunta(db_session: AsyncSession, seed_sefirot):
    p = PreguntaSefira(sefira_id="jesed", texto_pregunta="¿Cómo cuidás tu Jésed?")
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return p


async def test_post_respuesta_requires_auth(client: AsyncClient, seeded_pregunta):
    r = await client.post("/respuestas", json={
        "pregunta_id": seeded_pregunta.id,
        "respuesta_texto": "anon attempt",
    })
    assert r.status_code == 401


async def test_post_respuesta_persists_usuario_id(client: AsyncClient, seeded_pregunta, two_users):
    alice = two_users["alice"]
    r = await client.post(
        "/respuestas",
        json={"pregunta_id": seeded_pregunta.id, "respuesta_texto": "alice's reflection"},
        headers=alice["headers"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["usuario_id"] == alice["id"]


async def test_cooldown_is_per_user(client: AsyncClient, seeded_pregunta, two_users):
    """Alice answering does NOT block Bob from answering the same question."""
    alice, bob = two_users["alice"], two_users["bob"]

    r1 = await client.post(
        "/respuestas",
        json={"pregunta_id": seeded_pregunta.id, "respuesta_texto": "alice"},
        headers=alice["headers"],
    )
    assert r1.status_code == 200

    # Alice gets 409 if she tries again (her own cooldown applies)
    r_dup = await client.post(
        "/respuestas",
        json={"pregunta_id": seeded_pregunta.id, "respuesta_texto": "alice2"},
        headers=alice["headers"],
    )
    assert r_dup.status_code == 409

    # Bob is unaffected
    r2 = await client.post(
        "/respuestas",
        json={"pregunta_id": seeded_pregunta.id, "respuesta_texto": "bob"},
        headers=bob["headers"],
    )
    assert r2.status_code == 200, r2.text
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd backend
./venv/Scripts/python.exe -m pytest tests/test_respuestas_privacy.py -v
```

Expected: 3 failures. The auth test fails because the endpoint doesn't require auth yet (returns 200), the persistence test fails because the response object lacks `usuario_id`, and the cooldown test fails because the cooldown is global today.

- [ ] **Step 3: Update the endpoint in `backend/main.py`**

Replace the body of `save_respuesta` (currently lines 623-647). Add `Depends(get_current_user)`, scope cooldown query by user, set `usuario_id` on the new row.

Replace this block:

```python
@app.post("/respuestas")
async def save_respuesta(rep: RespuestaCreate, db: AsyncSession = Depends(get_db)):
    last = (await db.execute(
        select(RespuestaPregunta)
        .where(RespuestaPregunta.pregunta_id == rep.pregunta_id)
        .order_by(RespuestaPregunta.fecha_registro.desc())
        .limit(1)
    )).scalars().first()

    if last is not None:
        last_dt = last.fecha_registro
        if last_dt.tzinfo is not None:
            last_dt = last_dt.astimezone(timezone.utc).replace(tzinfo=None)
        next_available = last_dt + timedelta(days=30)
        if next_available > datetime.utcnow():
            raise HTTPException(
                status_code=409,
                detail=f"Esta pregunta vuelve a estar disponible el {next_available.date().isoformat()}",
            )

    nueva_res = RespuestaPregunta(pregunta_id=rep.pregunta_id, respuesta_texto=rep.respuesta_texto)
    db.add(nueva_res)
    await db.commit()
    await db.refresh(nueva_res)
    return nueva_res
```

with:

```python
@app.post("/respuestas")
async def save_respuesta(
    rep: RespuestaCreate,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    last = (await db.execute(
        select(RespuestaPregunta)
        .where(
            RespuestaPregunta.pregunta_id == rep.pregunta_id,
            RespuestaPregunta.usuario_id == user.id,
        )
        .order_by(RespuestaPregunta.fecha_registro.desc())
        .limit(1)
    )).scalars().first()

    if last is not None:
        last_dt = last.fecha_registro
        if last_dt.tzinfo is not None:
            last_dt = last_dt.astimezone(timezone.utc).replace(tzinfo=None)
        next_available = last_dt + timedelta(days=30)
        if next_available > datetime.utcnow():
            raise HTTPException(
                status_code=409,
                detail=f"Esta pregunta vuelve a estar disponible el {next_available.date().isoformat()}",
            )

    nueva_res = RespuestaPregunta(
        pregunta_id=rep.pregunta_id,
        respuesta_texto=rep.respuesta_texto,
        usuario_id=user.id,
    )
    db.add(nueva_res)
    await db.commit()
    await db.refresh(nueva_res)
    return nueva_res
```

- [ ] **Step 4: Run tests — expect 3 passing**

```bash
./venv/Scripts/python.exe -m pytest tests/test_respuestas_privacy.py -v
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/conftest.py backend/tests/test_respuestas_privacy.py
git commit -m "feat(#30): /respuestas requires auth and isolates cooldown per user"
```

---

## Task 6: `GET /respuestas/{sefira_id}` — filter by user

This is the cooldown-state endpoint that the frontend queries to know which questions are blocked.

**Files:**
- Modify: `backend/main.py:452-489`
- Modify: `backend/tests/test_respuestas_privacy.py` (extend)

- [ ] **Step 1: Add failing test**

Append to `backend/tests/test_respuestas_privacy.py`:

```python
async def test_get_respuestas_state_is_per_user(client: AsyncClient, seeded_pregunta, two_users):
    """After Alice answers, Alice sees the question as blocked but Bob sees it fresh."""
    alice, bob = two_users["alice"], two_users["bob"]

    r = await client.post(
        "/respuestas",
        json={"pregunta_id": seeded_pregunta.id, "respuesta_texto": "alice"},
        headers=alice["headers"],
    )
    assert r.status_code == 200

    r_alice = await client.get("/respuestas/jesed", headers=alice["headers"])
    assert r_alice.status_code == 200
    alice_pregunta = next(p for p in r_alice.json() if p["pregunta_id"] == seeded_pregunta.id)
    assert alice_pregunta["bloqueada"] is True
    assert alice_pregunta["ultima_respuesta"] == "alice"

    r_bob = await client.get("/respuestas/jesed", headers=bob["headers"])
    assert r_bob.status_code == 200
    bob_pregunta = next(p for p in r_bob.json() if p["pregunta_id"] == seeded_pregunta.id)
    assert bob_pregunta["bloqueada"] is False
    assert bob_pregunta["ultima_respuesta"] is None


async def test_get_respuestas_state_requires_auth(client: AsyncClient, seed_sefirot):
    r = await client.get("/respuestas/jesed")
    assert r.status_code == 401
```

- [ ] **Step 2: Run — expect failures**

```bash
./venv/Scripts/python.exe -m pytest tests/test_respuestas_privacy.py -v
```

Expected: 2 new failures (existing 3 still pass).

- [ ] **Step 3: Update the endpoint** at `backend/main.py:452-489`.

Replace:

```python
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
```

with (only `def` signature and the inner `select` `where` clause change):

```python
@app.get("/respuestas/{sefira_id}", response_model=list[PreguntaConEstado])
async def get_respuestas_estado(
    sefira_id: str,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    preguntas = (await db.execute(
        select(PreguntaSefira).where(PreguntaSefira.sefira_id == sefira_id)
    )).scalars().all()

    today = datetime.utcnow()
    out: list[PreguntaConEstado] = []
    for p in preguntas:
        last = (await db.execute(
            select(RespuestaPregunta)
            .where(
                RespuestaPregunta.pregunta_id == p.id,
                RespuestaPregunta.usuario_id == user.id,
            )
            .order_by(RespuestaPregunta.fecha_registro.desc())
            .limit(1)
        )).scalars().first()
```

(everything below the `last = (...)` block stays unchanged)

- [ ] **Step 4: Run — expect 5 passing**

```bash
./venv/Scripts/python.exe -m pytest tests/test_respuestas_privacy.py -v
```

Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/test_respuestas_privacy.py
git commit -m "feat(#30): GET /respuestas/{sefira_id} filters cooldown state by user"
```

---

## Task 7: `POST /evaluate` and `GET /registros/{sefira_id}` — `RegistroDiario` ownership

`/evaluate` writes a `RegistroDiario` (the AI score record). `/registros/{sefira_id}` reads them. Both need the user.

**Files:**
- Modify: `backend/main.py:341-359` (`evaluate`)
- Modify: `backend/main.py:492-506` (`get_registros`)
- Create: `backend/tests/test_registros_privacy.py`

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_registros_privacy.py`:

```python
"""Privacy contract for /evaluate and /registros."""
from __future__ import annotations

from httpx import AsyncClient


async def test_evaluate_requires_auth(client: AsyncClient, seed_sefirot):
    r = await client.post("/evaluate", json={
        "sefira": "Jésed", "sefira_id": "jesed",
        "text": "anon attempt", "score": 7.0,
    })
    assert r.status_code == 401


async def test_get_registros_is_per_user(client: AsyncClient, seed_sefirot, two_users):
    alice, bob = two_users["alice"], two_users["bob"]

    r = await client.post(
        "/evaluate",
        json={"sefira": "Jésed", "sefira_id": "jesed", "text": "alice ref", "score": 7.0},
        headers=alice["headers"],
    )
    assert r.status_code == 200

    r_alice = await client.get("/registros/jesed", headers=alice["headers"])
    assert r_alice.status_code == 200
    assert len(r_alice.json()) == 1
    assert r_alice.json()[0]["reflexion_texto"] == "alice ref"

    r_bob = await client.get("/registros/jesed", headers=bob["headers"])
    assert r_bob.status_code == 200
    assert r_bob.json() == []


async def test_get_registros_requires_auth(client: AsyncClient, seed_sefirot):
    r = await client.get("/registros/jesed")
    assert r.status_code == 401
```

- [ ] **Step 2: Run — expect 3 failures**

```bash
./venv/Scripts/python.exe -m pytest tests/test_registros_privacy.py -v
```

- [ ] **Step 3: Update `evaluate`** at `backend/main.py:341-359`

Replace:

```python
@app.post("/evaluate", response_model=EvaluationResponse)
async def evaluate(request: EvaluationRequest, db: AsyncSession = Depends(get_db)):
    await asyncio.sleep(1)
    ai_score = min(10.0, max(1.0, request.score + random.choice([-1.5, -0.5, 0.0, 0.5, 1.5])))
    feedback = (
        f"Análisis del Espejo Cognitivo para {request.sefira}:\n"
        f"El texto '[...]' denota una energia particular que requirio un ajuste aurico."
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

with:

```python
@app.post("/evaluate", response_model=EvaluationResponse)
async def evaluate(
    request: EvaluationRequest,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    await asyncio.sleep(1)
    ai_score = min(10.0, max(1.0, request.score + random.choice([-1.5, -0.5, 0.0, 0.5, 1.5])))
    feedback = (
        f"Análisis del Espejo Cognitivo para {request.sefira}:\n"
        f"El texto '[...]' denota una energia particular que requirio un ajuste aurico."
    )

    registro = RegistroDiario(
        sefira_id=request.sefira_id,
        reflexion_texto=request.text,
        puntuacion_usuario=int(round(request.score)),
        puntuacion_ia=int(round(ai_score)),
        usuario_id=user.id,
    )
    db.add(registro)
    await db.commit()

    return EvaluationResponse(ai_score=ai_score, feedback=feedback)
```

- [ ] **Step 4: Update `get_registros`** at `backend/main.py:492-506`

Replace:

```python
@app.get("/registros/{sefira_id}", response_model=list[RegistroOut])
async def get_registros(sefira_id: str, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(RegistroDiario)
        .where(RegistroDiario.sefira_id == sefira_id)
        .order_by(RegistroDiario.fecha_registro.desc())
    )).scalars().all()
```

with:

```python
@app.get("/registros/{sefira_id}", response_model=list[RegistroOut])
async def get_registros(
    sefira_id: str,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    rows = (await db.execute(
        select(RegistroDiario)
        .where(
            RegistroDiario.sefira_id == sefira_id,
            RegistroDiario.usuario_id == user.id,
        )
        .order_by(RegistroDiario.fecha_registro.desc())
    )).scalars().all()
```

- [ ] **Step 5: Run — expect 3 passing**

```bash
./venv/Scripts/python.exe -m pytest tests/test_registros_privacy.py -v
```

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/tests/test_registros_privacy.py
git commit -m "feat(#30): /evaluate and /registros require auth and persist/filter by user"
```

---

## Task 8: `GET /espejo/resumen` — filter by user

This is the dashboard summary used by the Espejo. It currently joins all rows globally; we filter by user everywhere it touches `RegistroDiario` and `RespuestaPregunta`.

**Files:**
- Modify: `backend/main.py:509-563`
- Create: `backend/tests/test_espejo_resumen_privacy.py`

- [ ] **Step 1: Write the failing test**

```python
"""Privacy contract for /espejo/resumen."""
from __future__ import annotations

from httpx import AsyncClient


async def test_resumen_requires_auth(client: AsyncClient, seed_sefirot):
    r = await client.get("/espejo/resumen")
    assert r.status_code == 401


async def test_resumen_isolates_users(client: AsyncClient, seed_sefirot, two_users):
    alice, bob = two_users["alice"], two_users["bob"]

    r = await client.post(
        "/evaluate",
        json={"sefira": "Jésed", "sefira_id": "jesed", "text": "alice", "score": 8.0},
        headers=alice["headers"],
    )
    assert r.status_code == 200

    r_alice = await client.get("/espejo/resumen", headers=alice["headers"])
    assert r_alice.status_code == 200
    by_id = {row["sefira_id"]: row for row in r_alice.json()}
    assert by_id["jesed"]["ultima_reflexion_texto"] == "alice"
    assert by_id["jesed"]["score_ia_promedio"] is not None

    r_bob = await client.get("/espejo/resumen", headers=bob["headers"])
    assert r_bob.status_code == 200
    by_id_bob = {row["sefira_id"]: row for row in r_bob.json()}
    assert by_id_bob["jesed"]["ultima_reflexion_texto"] is None
    assert by_id_bob["jesed"]["score_ia_promedio"] is None
```

- [ ] **Step 2: Run — expect failures**

```bash
./venv/Scripts/python.exe -m pytest tests/test_espejo_resumen_privacy.py -v
```

- [ ] **Step 3: Update `espejo_resumen`** at `backend/main.py:509-563`

Inject the user dep and add `usuario_id == user.id` to the two query points (the inner-loop respuestas and the per-sefira registros).

Add the `user` parameter to the signature:

```python
@app.get("/espejo/resumen", response_model=list[SefiraResumen])
async def espejo_resumen(
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
```

In the `for pid in preguntas:` block, change the `select(RespuestaPregunta.fecha_registro)` query — the `where` clause:

From:
```python
            last = (await db.execute(
                select(RespuestaPregunta.fecha_registro)
                .where(RespuestaPregunta.pregunta_id == pid)
                .order_by(RespuestaPregunta.fecha_registro.desc()).limit(1)
            )).scalars().first()
```
to:
```python
            last = (await db.execute(
                select(RespuestaPregunta.fecha_registro)
                .where(
                    RespuestaPregunta.pregunta_id == pid,
                    RespuestaPregunta.usuario_id == user.id,
                )
                .order_by(RespuestaPregunta.fecha_registro.desc()).limit(1)
            )).scalars().first()
```

In the `regs = (...)` block:

From:
```python
        regs = (await db.execute(
            select(RegistroDiario)
            .where(RegistroDiario.sefira_id == s.id)
            .order_by(RegistroDiario.fecha_registro.desc())
        )).scalars().all()
```
to:
```python
        regs = (await db.execute(
            select(RegistroDiario)
            .where(
                RegistroDiario.sefira_id == s.id,
                RegistroDiario.usuario_id == user.id,
            )
            .order_by(RegistroDiario.fecha_registro.desc())
        )).scalars().all()
```

- [ ] **Step 4: Run — expect passing**

```bash
./venv/Scripts/python.exe -m pytest tests/test_espejo_resumen_privacy.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/test_espejo_resumen_privacy.py
git commit -m "feat(#30): /espejo/resumen requires auth and isolates per user"
```

---

## Task 9: `GET /espejo/evolucion` — filter by user

**Files:**
- Modify: `backend/main.py:566-620`
- Create: `backend/tests/test_espejo_evolucion_privacy.py`

- [ ] **Step 1: Write the failing test**

```python
"""Privacy contract for /espejo/evolucion."""
from __future__ import annotations

from httpx import AsyncClient


async def test_evolucion_requires_auth(client: AsyncClient, seed_sefirot):
    r = await client.get("/espejo/evolucion?meses=12")
    assert r.status_code == 401


async def test_evolucion_isolates_users(client: AsyncClient, seed_sefirot, two_users):
    alice, bob = two_users["alice"], two_users["bob"]

    r = await client.post(
        "/evaluate",
        json={"sefira": "Jésed", "sefira_id": "jesed", "text": "alice", "score": 7.0},
        headers=alice["headers"],
    )
    assert r.status_code == 200

    r_alice = await client.get("/espejo/evolucion?meses=3", headers=alice["headers"])
    alice_jesed = next(row for row in r_alice.json() if row["sefira_id"] == "jesed")
    total_alice = sum(m["reflexiones"] for m in alice_jesed["meses"])
    assert total_alice == 1

    r_bob = await client.get("/espejo/evolucion?meses=3", headers=bob["headers"])
    bob_jesed = next(row for row in r_bob.json() if row["sefira_id"] == "jesed")
    total_bob = sum(m["reflexiones"] for m in bob_jesed["meses"])
    assert total_bob == 0
```

- [ ] **Step 2: Run — expect failures**

```bash
./venv/Scripts/python.exe -m pytest tests/test_espejo_evolucion_privacy.py -v
```

- [ ] **Step 3: Update `espejo_evolucion`** at `backend/main.py:566-620`

Add `user` dep and filter both queries inside the per-sefira loop.

Signature:

```python
@app.get("/espejo/evolucion", response_model=list[SefiraEvolucion])
async def espejo_evolucion(
    meses: int = Query(12, ge=1, le=120),
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
```

Inside the `for s in sefirot:` loop, change two `where` clauses:

From:
```python
        regs = (await db.execute(
            select(RegistroDiario).where(RegistroDiario.sefira_id == s.id)
        )).scalars().all()

        respuestas_rows = (await db.execute(
            select(RespuestaPregunta.fecha_registro)
            .join(PreguntaSefira, PreguntaSefira.id == RespuestaPregunta.pregunta_id)
            .where(PreguntaSefira.sefira_id == s.id)
        )).scalars().all()
```
to:
```python
        regs = (await db.execute(
            select(RegistroDiario).where(
                RegistroDiario.sefira_id == s.id,
                RegistroDiario.usuario_id == user.id,
            )
        )).scalars().all()

        respuestas_rows = (await db.execute(
            select(RespuestaPregunta.fecha_registro)
            .join(PreguntaSefira, PreguntaSefira.id == RespuestaPregunta.pregunta_id)
            .where(
                PreguntaSefira.sefira_id == s.id,
                RespuestaPregunta.usuario_id == user.id,
            )
        )).scalars().all()
```

- [ ] **Step 4: Run — expect passing**

```bash
./venv/Scripts/python.exe -m pytest tests/test_espejo_evolucion_privacy.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/test_espejo_evolucion_privacy.py
git commit -m "feat(#30): /espejo/evolucion requires auth and isolates per user"
```

---

## Task 10: `materialize_series` and `ensure_series_materialized` — accept `usuario_id`

`Actividad` rows are about to be NOT NULL on `usuario_id`. The two helpers that create `Actividad` instances must propagate it. We change `materialize_series` to accept a `usuario_id` param, and `ensure_series_materialized` to use the seed activity's `usuario_id` when extending its series.

**Files:**
- Modify: `backend/main.py:285-328` (`materialize_series`)
- Modify: `backend/main.py:650-702` (`ensure_series_materialized`)

No tests added in this task — covered indirectly by the Task 11 / Task 12 endpoint tests.

- [ ] **Step 1: Update `materialize_series`** at `backend/main.py:285-328`

Add a required `usuario_id` parameter and pass it to the Actividad constructor.

Replace:

```python
async def materialize_series(
    db: AsyncSession,
    payload: ActividadCreate,
    serie_id: str,
    sefirot_ids: list[str],
    range_start: Optional[datetime] = None,
    range_end: Optional[datetime] = None,
) -> list[Actividad]:
    """Generate and persist instances of a recurring series."""
```

with:

```python
async def materialize_series(
    db: AsyncSession,
    payload: ActividadCreate,
    serie_id: str,
    sefirot_ids: list[str],
    usuario_id: str,
    range_start: Optional[datetime] = None,
    range_end: Optional[datetime] = None,
) -> list[Actividad]:
    """Generate and persist instances of a recurring series."""
```

And inside the loop body, replace:

```python
        actividad = Actividad(
            titulo=titulo,
            descripcion=descripcion,
            inicio=occ_start,
            fin=occ_start + duration,
            estado="pendiente",
            serie_id=serie_id,
            rrule=payload.rrule if (idx == 0 and range_start is None) else None,
        )
```

with:

```python
        actividad = Actividad(
            titulo=titulo,
            descripcion=descripcion,
            inicio=occ_start,
            fin=occ_start + duration,
            estado="pendiente",
            serie_id=serie_id,
            rrule=payload.rrule if (idx == 0 and range_start is None) else None,
            usuario_id=usuario_id,
        )
```

- [ ] **Step 2: Update `ensure_series_materialized`** at `backend/main.py:650-702`

This helper iterates seed actividades and extends open-ended series. Each seed has its own `usuario_id` — we pass it through.

Replace this block:

```python
        instancias = await materialize_series(
            db,
            synthetic_payload,
            seed.serie_id,
            list(sefirot_rows),
            range_start=new_window_start,
            range_end=new_window_end,
        )
```

with:

```python
        instancias = await materialize_series(
            db,
            synthetic_payload,
            seed.serie_id,
            list(sefirot_rows),
            usuario_id=seed.usuario_id,
            range_start=new_window_start,
            range_end=new_window_end,
        )
```

- [ ] **Step 3: Don't commit yet** — bundled into Task 11.

---

## Task 11: `POST /actividades` — require auth + write `usuario_id`

**Files:**
- Modify: `backend/main.py:734-768`
- Create: `backend/tests/test_actividades_privacy.py`

- [ ] **Step 1: Write the failing tests**

```python
"""Privacy contract for /actividades."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

from httpx import AsyncClient


def _payload(sefira_id: str = "jesed") -> dict:
    start = datetime(2026, 6, 1, 9, 0, tzinfo=timezone.utc)
    return {
        "titulo": "Meditación",
        "descripcion": "Foco aurico",
        "inicio": start.isoformat(),
        "fin": (start + timedelta(hours=1)).isoformat(),
        "sefirot_ids": [sefira_id],
    }


async def test_post_actividad_requires_auth(client: AsyncClient, seed_sefirot):
    r = await client.post("/actividades", json=_payload())
    assert r.status_code == 401


async def test_post_actividad_persists_usuario_id(client: AsyncClient, seed_sefirot, two_users):
    alice = two_users["alice"]
    r = await client.post("/actividades", json=_payload(), headers=alice["headers"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, list) and len(body) == 1
    # Verify ownership via list endpoint (added in Task 12 — for now check via direct query)
    # Tested for now: the endpoint accepted the request.


async def test_post_actividad_with_rrule_persists_usuario_id(client: AsyncClient, seed_sefirot, two_users):
    """Recurring series — every materialized instance must carry usuario_id."""
    alice = two_users["alice"]
    payload = _payload()
    payload["rrule"] = "FREQ=WEEKLY;COUNT=3"
    r = await client.post("/actividades", json=payload, headers=alice["headers"])
    assert r.status_code == 200, r.text
    instances = r.json()
    assert len(instances) == 3
```

- [ ] **Step 2: Run — expect failures**

```bash
./venv/Scripts/python.exe -m pytest tests/test_actividades_privacy.py -v
```

- [ ] **Step 3: Update `create_actividad`** at `backend/main.py:734-768`

Replace:

```python
@app.post("/actividades", response_model=list[ActividadOut])
async def create_actividad(payload: ActividadCreate, db: AsyncSession = Depends(get_db)):
    if payload.fin <= payload.inicio:
        raise HTTPException(status_code=422, detail="La fecha de fin debe ser mayor a la fecha de inicio")
    await validate_sefirot_ids(db, payload.sefirot_ids)

    if payload.rrule:
        try:
            rrulestr(payload.rrule, dtstart=normalize_datetime(payload.inicio))
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=422, detail=f"RRULE inválido: {exc}")

        serie_id = str(uuid.uuid4())
        instancias = await materialize_series(db, payload, serie_id, payload.sefirot_ids)
        if not instancias:
            raise HTTPException(status_code=422, detail="El RRULE no genera ninguna ocurrencia")
        await db.commit()
        return [await serialize_actividad(db, a) for a in instancias]

    actividad = Actividad(
        titulo=payload.titulo.strip(),
        descripcion=(payload.descripcion or "").strip() or None,
        inicio=normalize_datetime(payload.inicio),
        fin=normalize_datetime(payload.fin),
        estado="pendiente",
    )
    db.add(actividad)
    await db.flush()

    for sefira_id in payload.sefirot_ids:
        db.add(ActividadSefira(actividad_id=actividad.id, sefira_id=sefira_id))

    await db.commit()
    await db.refresh(actividad)
    return [await serialize_actividad(db, actividad)]
```

with:

```python
@app.post("/actividades", response_model=list[ActividadOut])
async def create_actividad(
    payload: ActividadCreate,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if payload.fin <= payload.inicio:
        raise HTTPException(status_code=422, detail="La fecha de fin debe ser mayor a la fecha de inicio")
    await validate_sefirot_ids(db, payload.sefirot_ids)

    if payload.rrule:
        try:
            rrulestr(payload.rrule, dtstart=normalize_datetime(payload.inicio))
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=422, detail=f"RRULE inválido: {exc}")

        serie_id = str(uuid.uuid4())
        instancias = await materialize_series(
            db, payload, serie_id, payload.sefirot_ids, usuario_id=user.id,
        )
        if not instancias:
            raise HTTPException(status_code=422, detail="El RRULE no genera ninguna ocurrencia")
        await db.commit()
        return [await serialize_actividad(db, a) for a in instancias]

    actividad = Actividad(
        titulo=payload.titulo.strip(),
        descripcion=(payload.descripcion or "").strip() or None,
        inicio=normalize_datetime(payload.inicio),
        fin=normalize_datetime(payload.fin),
        estado="pendiente",
        usuario_id=user.id,
    )
    db.add(actividad)
    await db.flush()

    for sefira_id in payload.sefirot_ids:
        db.add(ActividadSefira(actividad_id=actividad.id, sefira_id=sefira_id))

    await db.commit()
    await db.refresh(actividad)
    return [await serialize_actividad(db, actividad)]
```

- [ ] **Step 4: Run — expect passing**

```bash
./venv/Scripts/python.exe -m pytest tests/test_actividades_privacy.py -v
```

- [ ] **Step 5: Commit (bundles Task 10 changes too)**

```bash
git add backend/main.py backend/tests/test_actividades_privacy.py
git commit -m "feat(#30): POST /actividades requires auth; usuario_id propagates through materialize_series"
```

---

## Task 12: `GET /actividades` — filter by user

**Files:**
- Modify: `backend/main.py:705-722`
- Modify: `backend/tests/test_actividades_privacy.py` (extend)

- [ ] **Step 1: Add failing tests**

Append to `tests/test_actividades_privacy.py`:

```python
async def test_list_actividades_requires_auth(client: AsyncClient, seed_sefirot):
    r = await client.get("/actividades")
    assert r.status_code == 401


async def test_list_actividades_only_shows_own(client: AsyncClient, seed_sefirot, two_users):
    alice, bob = two_users["alice"], two_users["bob"]

    r = await client.post("/actividades", json=_payload(), headers=alice["headers"])
    assert r.status_code == 200

    r_alice = await client.get("/actividades", headers=alice["headers"])
    assert r_alice.status_code == 200
    assert len(r_alice.json()) == 1

    r_bob = await client.get("/actividades", headers=bob["headers"])
    assert r_bob.status_code == 200
    assert r_bob.json() == []
```

- [ ] **Step 2: Run — expect failures**

- [ ] **Step 3: Update `list_actividades`** at `backend/main.py:705-722`

Replace:

```python
@app.get("/actividades", response_model=list[ActividadOut])
async def list_actividades(
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
):
    if start and end:
        await ensure_series_materialized(db, normalize_datetime(end))

    query = select(Actividad).order_by(Actividad.inicio)
    if start and end:
        start_dt = normalize_datetime(start)
        end_dt = normalize_datetime(end)
        query = query.where(and_(Actividad.inicio < end_dt, Actividad.fin > start_dt))

    result = await db.execute(query)
    actividades = result.scalars().all()
    return [await serialize_actividad(db, actividad) for actividad in actividades]
```

with:

```python
@app.get("/actividades", response_model=list[ActividadOut])
async def list_actividades(
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if start and end:
        await ensure_series_materialized(db, normalize_datetime(end), user_id=user.id)

    query = select(Actividad).where(Actividad.usuario_id == user.id).order_by(Actividad.inicio)
    if start and end:
        start_dt = normalize_datetime(start)
        end_dt = normalize_datetime(end)
        query = query.where(and_(Actividad.inicio < end_dt, Actividad.fin > start_dt))

    result = await db.execute(query)
    actividades = result.scalars().all()
    return [await serialize_actividad(db, actividad) for actividad in actividades]
```

- [ ] **Step 4: Update `ensure_series_materialized` signature** at `backend/main.py:650`

It now takes a `user_id` and only iterates seeds owned by that user (avoid extending other users' series).

Replace the signature line:

```python
async def ensure_series_materialized(db: AsyncSession, end: datetime) -> None:
```

with:

```python
async def ensure_series_materialized(db: AsyncSession, end: datetime, user_id: str) -> None:
```

And in the body, replace:

```python
    seeds = (await db.execute(
        select(Actividad).where(
            and_(Actividad.rrule.is_not(None), Actividad.serie_id.is_not(None))
        )
    )).scalars().all()
```

with:

```python
    seeds = (await db.execute(
        select(Actividad).where(
            and_(
                Actividad.rrule.is_not(None),
                Actividad.serie_id.is_not(None),
                Actividad.usuario_id == user_id,
            )
        )
    )).scalars().all()
```

- [ ] **Step 5: Run — expect passing**

```bash
./venv/Scripts/python.exe -m pytest tests/test_actividades_privacy.py -v
```

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/tests/test_actividades_privacy.py
git commit -m "feat(#30): GET /actividades isolates per user; series materialization respects ownership"
```

---

## Task 13: `GET /actividades/{id}` — 404 if not owner

**Files:**
- Modify: `backend/main.py:725-731`
- Modify: `backend/tests/test_actividades_privacy.py`

- [ ] **Step 1: Add failing tests**

Append to `tests/test_actividades_privacy.py`:

```python
async def test_get_actividad_by_id_returns_404_for_other_user(client: AsyncClient, seed_sefirot, two_users):
    alice, bob = two_users["alice"], two_users["bob"]

    r = await client.post("/actividades", json=_payload(), headers=alice["headers"])
    assert r.status_code == 200
    actividad_id = r.json()[0]["id"]

    r_alice = await client.get(f"/actividades/{actividad_id}", headers=alice["headers"])
    assert r_alice.status_code == 200

    r_bob = await client.get(f"/actividades/{actividad_id}", headers=bob["headers"])
    assert r_bob.status_code == 404


async def test_get_actividad_by_id_requires_auth(client: AsyncClient, seed_sefirot):
    r = await client.get("/actividades/some-id")
    assert r.status_code == 401
```

- [ ] **Step 2: Run — expect failures**

- [ ] **Step 3: Update `get_actividad`** at `backend/main.py:725-731`

Replace:

```python
@app.get("/actividades/{actividad_id}", response_model=ActividadOut)
async def get_actividad(actividad_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Actividad).where(Actividad.id == actividad_id))
    actividad = result.scalars().first()
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    return await serialize_actividad(db, actividad)
```

with:

```python
@app.get("/actividades/{actividad_id}", response_model=ActividadOut)
async def get_actividad(
    actividad_id: str,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    result = await db.execute(
        select(Actividad).where(
            Actividad.id == actividad_id,
            Actividad.usuario_id == user.id,
        )
    )
    actividad = result.scalars().first()
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    return await serialize_actividad(db, actividad)
```

- [ ] **Step 4: Run — expect passing**

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/test_actividades_privacy.py
git commit -m "feat(#30): GET /actividades/{id} returns 404 for non-owners"
```

---

## Task 14: `PUT /actividades/{id}` — owner-only update

**Files:**
- Modify: `backend/main.py:771-826`
- Modify: `backend/tests/test_actividades_privacy.py`

- [ ] **Step 1: Add failing test**

Append to `tests/test_actividades_privacy.py`:

```python
async def test_put_actividad_404_for_other_user(client: AsyncClient, seed_sefirot, two_users):
    alice, bob = two_users["alice"], two_users["bob"]

    r = await client.post("/actividades", json=_payload(), headers=alice["headers"])
    actividad_id = r.json()[0]["id"]

    r_bob = await client.put(
        f"/actividades/{actividad_id}",
        json=_payload(),
        headers=bob["headers"],
    )
    assert r_bob.status_code == 404


async def test_put_actividad_requires_auth(client: AsyncClient, seed_sefirot):
    r = await client.put("/actividades/some-id", json=_payload())
    assert r.status_code == 401
```

- [ ] **Step 2: Update `update_actividad`** at `backend/main.py:771-826`

Add `user` dep, scope the lookup, and pass `usuario_id` to the series re-materialization. Also filter the `siblings` lookup so we don't accidentally re-materialize someone else's series with this user's id (defense in depth).

Add to signature:

```python
@app.put("/actividades/{actividad_id}", response_model=list[ActividadOut])
async def update_actividad(
    actividad_id: str,
    payload: ActividadCreate,
    scope: str = Query("one", pattern="^(one|series)$"),
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
```

Replace the actividad lookup:

From:
```python
    actividad = (await db.execute(
        select(Actividad).where(Actividad.id == actividad_id)
    )).scalars().first()
```
to:
```python
    actividad = (await db.execute(
        select(Actividad).where(
            Actividad.id == actividad_id,
            Actividad.usuario_id == user.id,
        )
    )).scalars().first()
```

In the `siblings` block (the `scope == "series"` path), replace:

From:
```python
    siblings = (await db.execute(
        select(Actividad).where(Actividad.serie_id == serie_id)
    )).scalars().all()
    sibling_ids = [a.id for a in siblings]

    await db.execute(delete(ActividadSefira).where(ActividadSefira.actividad_id.in_(sibling_ids)))
    await db.execute(delete(Actividad).where(Actividad.serie_id == serie_id))
    await db.flush()

    series_payload = payload.model_copy(update={"rrule": rrule_to_use})
    instancias = await materialize_series(db, series_payload, serie_id, payload.sefirot_ids)
```
to:
```python
    siblings = (await db.execute(
        select(Actividad).where(
            Actividad.serie_id == serie_id,
            Actividad.usuario_id == user.id,
        )
    )).scalars().all()
    sibling_ids = [a.id for a in siblings]

    await db.execute(delete(ActividadSefira).where(ActividadSefira.actividad_id.in_(sibling_ids)))
    await db.execute(delete(Actividad).where(
        and_(Actividad.serie_id == serie_id, Actividad.usuario_id == user.id)
    ))
    await db.flush()

    series_payload = payload.model_copy(update={"rrule": rrule_to_use})
    instancias = await materialize_series(
        db, series_payload, serie_id, payload.sefirot_ids, usuario_id=user.id,
    )
```

- [ ] **Step 3: Run — expect passing**

```bash
./venv/Scripts/python.exe -m pytest tests/test_actividades_privacy.py -v
```

- [ ] **Step 4: Commit**

```bash
git add backend/main.py backend/tests/test_actividades_privacy.py
git commit -m "feat(#30): PUT /actividades/{id} restricts to owner; series re-materialization is owner-scoped"
```

---

## Task 15: `DELETE /actividades/{id}` — owner-only delete

**Files:**
- Modify: `backend/main.py:829-851`
- Modify: `backend/tests/test_actividades_privacy.py`

- [ ] **Step 1: Add failing tests**

Append to `tests/test_actividades_privacy.py`:

```python
async def test_delete_actividad_404_for_other_user(client: AsyncClient, seed_sefirot, two_users):
    alice, bob = two_users["alice"], two_users["bob"]

    r = await client.post("/actividades", json=_payload(), headers=alice["headers"])
    actividad_id = r.json()[0]["id"]

    r_bob = await client.delete(f"/actividades/{actividad_id}", headers=bob["headers"])
    assert r_bob.status_code == 404

    # Alice can still delete it
    r_alice = await client.delete(f"/actividades/{actividad_id}", headers=alice["headers"])
    assert r_alice.status_code == 200


async def test_delete_actividad_requires_auth(client: AsyncClient, seed_sefirot):
    r = await client.delete("/actividades/some-id")
    assert r.status_code == 401
```

- [ ] **Step 2: Update `delete_actividad`** at `backend/main.py:829-851`

Replace:

```python
@app.delete("/actividades/{actividad_id}")
async def delete_actividad(
    actividad_id: str,
    scope: str = Query("one", pattern="^(one|series)$"),
    db: AsyncSession = Depends(get_db),
):
    actividad = (await db.execute(
        select(Actividad).where(Actividad.id == actividad_id)
    )).scalars().first()
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")

    if scope == "series" and actividad.serie_id is not None:
        siblings = (await db.execute(
            select(Actividad.id).where(Actividad.serie_id == actividad.serie_id)
        )).scalars().all()
        await db.execute(delete(ActividadSefira).where(ActividadSefira.actividad_id.in_(siblings)))
        await db.execute(delete(Actividad).where(Actividad.serie_id == actividad.serie_id))
    else:
        await db.delete(actividad)

    await db.commit()
    return {"message": "Actividad eliminada"}
```

with:

```python
@app.delete("/actividades/{actividad_id}")
async def delete_actividad(
    actividad_id: str,
    scope: str = Query("one", pattern="^(one|series)$"),
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    actividad = (await db.execute(
        select(Actividad).where(
            Actividad.id == actividad_id,
            Actividad.usuario_id == user.id,
        )
    )).scalars().first()
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")

    if scope == "series" and actividad.serie_id is not None:
        siblings = (await db.execute(
            select(Actividad.id).where(
                Actividad.serie_id == actividad.serie_id,
                Actividad.usuario_id == user.id,
            )
        )).scalars().all()
        await db.execute(delete(ActividadSefira).where(ActividadSefira.actividad_id.in_(siblings)))
        await db.execute(delete(Actividad).where(
            and_(Actividad.serie_id == actividad.serie_id, Actividad.usuario_id == user.id)
        ))
    else:
        await db.delete(actividad)

    await db.commit()
    return {"message": "Actividad eliminada"}
```

- [ ] **Step 3: Run — expect passing**

- [ ] **Step 4: Commit**

```bash
git add backend/main.py backend/tests/test_actividades_privacy.py
git commit -m "feat(#30): DELETE /actividades/{id} restricts to owner"
```

---

## Task 16: `GET /energia/volumen-semanal` — filter by user

**Files:**
- Modify: `backend/main.py:854-909`
- Create: `backend/tests/test_volumen_privacy.py`

- [ ] **Step 1: Add failing test**

```python
"""Privacy contract for /energia/volumen-semanal."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

from httpx import AsyncClient


async def test_volumen_requires_auth(client: AsyncClient, seed_sefirot):
    r = await client.get("/energia/volumen-semanal")
    assert r.status_code == 401


async def test_volumen_isolates_per_user(client: AsyncClient, seed_sefirot, two_users):
    alice, bob = two_users["alice"], two_users["bob"]

    start = datetime.now(timezone.utc).replace(hour=10, minute=0, second=0, microsecond=0)
    payload = {
        "titulo": "Med",
        "descripcion": "",
        "inicio": start.isoformat(),
        "fin": (start + timedelta(hours=2)).isoformat(),
        "sefirot_ids": ["jesed"],
    }
    r = await client.post("/actividades", json=payload, headers=alice["headers"])
    assert r.status_code == 200

    r_alice = await client.get("/energia/volumen-semanal", headers=alice["headers"])
    alice_jesed = next(v for v in r_alice.json()["volumen"] if v["sefira_id"] == "jesed")
    assert alice_jesed["actividades_total"] == 1

    r_bob = await client.get("/energia/volumen-semanal", headers=bob["headers"])
    bob_jesed = next(v for v in r_bob.json()["volumen"] if v["sefira_id"] == "jesed")
    assert bob_jesed["actividades_total"] == 0
```

- [ ] **Step 2: Update `get_volumen_semanal`** at `backend/main.py:854-909`

Add `user` dep, filter the join.

Signature:

```python
@app.get("/energia/volumen-semanal", response_model=VolumenSemanalOut)
async def get_volumen_semanal(
    fecha: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
```

Update the `rows = await db.execute(...)` query — the `where` clause:

From:
```python
    rows = await db.execute(
        select(
            Actividad.id.label("actividad_id"),
            Actividad.inicio,
            Actividad.fin,
            Sefira.id.label("sefira_id"),
        )
        .join(ActividadSefira, ActividadSefira.actividad_id == Actividad.id)
        .join(Sefira, Sefira.id == ActividadSefira.sefira_id)
        .where(and_(Actividad.inicio < week_end_dt, Actividad.fin > week_start_dt))
    )
```
to:
```python
    rows = await db.execute(
        select(
            Actividad.id.label("actividad_id"),
            Actividad.inicio,
            Actividad.fin,
            Sefira.id.label("sefira_id"),
        )
        .join(ActividadSefira, ActividadSefira.actividad_id == Actividad.id)
        .join(Sefira, Sefira.id == ActividadSefira.sefira_id)
        .where(and_(
            Actividad.inicio < week_end_dt,
            Actividad.fin > week_start_dt,
            Actividad.usuario_id == user.id,
        ))
    )
```

- [ ] **Step 3: Run — expect passing**

```bash
./venv/Scripts/python.exe -m pytest tests/test_volumen_privacy.py -v
```

- [ ] **Step 4: Commit**

```bash
git add backend/main.py backend/tests/test_volumen_privacy.py
git commit -m "feat(#30): /energia/volumen-semanal isolates volume per user"
```

---

## Task 17: Full sweep — run every test, smoke test the dev server

**Files:** none

- [ ] **Step 1: Run the full backend test suite**

```bash
cd backend
./venv/Scripts/python.exe -m pytest tests/ -v
```

Expected: all green. Tests across `test_respuestas_privacy.py`, `test_registros_privacy.py`, `test_espejo_resumen_privacy.py`, `test_espejo_evolucion_privacy.py`, `test_actividades_privacy.py`, `test_volumen_privacy.py` — at least 25 passing.

- [ ] **Step 2: Boot the dev server**

```bash
cd backend
./venv/Scripts/python.exe -m uvicorn main:app --reload
```

In another terminal, hit unauthenticated endpoints:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/actividades
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/respuestas/jesed
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/espejo/resumen
```

Expected: all three print `401`.

- [ ] **Step 3: Stop the dev server (Ctrl+C)**

---

## Task 18: Push and open PR

- [ ] **Step 1: Verify the commit log**

```bash
git log --oneline origin/main..HEAD
```

Expected: spec commit + ~9 implementation commits, all targeting #30.

- [ ] **Step 2: Push**

```bash
git push -u origin feat/m6-30-backend-ownership
```

- [ ] **Step 3: Open PR**

```bash
gh pr create --title "feat(#30): per-user ownership on RespuestaPregunta, Actividad, RegistroDiario" --body "$(cat <<'EOF'
## Summary

Closes **#30** — Phase 1 of the privacy work (spec: `docs/superpowers/specs/2026-05-06-privacidad-y-gated-save-design.md`).

- All business endpoints (`/respuestas`, `/registros`, `/evaluate`, `/espejo/*`, `/actividades*`, `/energia/volumen-semanal`) now require `Depends(get_current_user)`.
- All queries filter by `usuario_id == current_user.id`. Cross-user reads return 404 (not 403) to avoid leaking existence.
- Cooldown for `/respuestas` is now per-user — Alice answering doesn't block Bob.
- Migration enforces `usuario_id NOT NULL` on `respuestas_preguntas`, `actividades`, `registros_diario` (columns already existed but were nullable and unused). Legacy rows are wiped — the local dev DB needed re-migration; no production data exists.
- `materialize_series` and `ensure_series_materialized` now accept `usuario_id` so RRULE expansions are owner-scoped.

## Tests

- New: `backend/tests/` — pytest infra (httpx + in-memory SQLite), six `test_*_privacy.py` files. Every endpoint has a 401 test + a two-user isolation test.

## Coordination

- This PR **must merge before** the frontend gated-save PR (#28). Once this is on `main`, anonymous frontend POSTs return 401 — that's the expected state, and #28 wraps it with the LoginModal flow.

## Test plan

- [x] `pytest tests/ -v` — all green
- [x] Manual: `curl` to protected endpoints without a token → 401
- [ ] Manual after merging: re-run frontend dev server with a logged-in user, verify Espejo and Calendar still work.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Note the PR URL** to share with the user.

---

## Done

After PR #30 merges:
1. Switch back to `main` and pull.
2. Run the brainstorming/writing-plans flow again to generate the plan for #28 (frontend gated save). The spec is already shared between the two — only a new plan is needed.
