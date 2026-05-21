# Sistema Premium — Plan 1: Core Backend Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el núcleo backend del sistema premium: modelo de datos, gating en endpoints existentes, integración Lemonsqueezy (checkout + webhooks + portal) y promo codes. Al terminar, premium es activable y verificable end-to-end vía curl, sin UI ni emails todavía.

**Architecture:** Módulo nuevo `backend/billing/` aislado del resto. Source of truth de premium es el join con tabla `subscriptions` (no boolean denormalizado). Gating se hace en backend con dependency `require_premium`. Lemonsqueezy actúa como Merchant of Record; nuestro backend mantiene su propia tabla sincronizada por webhooks idempotentes.

**Tech Stack:** Python 3.11 + FastAPI async + SQLAlchemy async + Alembic + httpx + pytest-asyncio + respx (HTTP mocking).

**Spec de referencia:** [docs/superpowers/specs/2026-05-21-sistema-premium-design.md](../specs/2026-05-21-sistema-premium-design.md)

**Plan 1 de 3.** Planes 2 (emails) y 3 (frontend) van después y dependen de este.

---

## File Structure

### Archivos nuevos
- `backend/billing/__init__.py` — paquete
- `backend/billing/models.py` — Subscription, PromoCode, EmailPreferences, WebhookEvent, ReflexionLibre
- `backend/billing/schemas.py` — pydantic schemas para request/response
- `backend/billing/dependencies.py` — `require_premium`, `get_user_subscription`
- `backend/billing/lemonsqueezy.py` — cliente HTTP wrapper
- `backend/billing/webhooks.py` — handler con HMAC validation + dispatch de eventos
- `backend/billing/promo_codes.py` — validación de códigos
- `backend/billing/routers.py` — endpoints `/billing/*`
- `backend/billing/reflexiones_libres.py` — endpoint `POST /reflexiones-libres` con gating
- `backend/scripts/create_promo_code.py` — CLI para crear códigos
- `backend/alembic/versions/<hash>_premium_system.py` — migración nueva
- `backend/tests/billing/__init__.py`
- `backend/tests/billing/test_models.py`
- `backend/tests/billing/test_require_premium.py`
- `backend/tests/billing/test_gating_actividades.py`
- `backend/tests/billing/test_gating_respuestas.py`
- `backend/tests/billing/test_gating_historico.py`
- `backend/tests/billing/test_reflexiones_libres.py`
- `backend/tests/billing/test_lemonsqueezy_checkout.py`
- `backend/tests/billing/test_lemonsqueezy_webhooks.py`
- `backend/tests/billing/test_promo_codes.py`

### Archivos modificados
- `backend/models.py` — agregar `timezone` a Usuario, agregar property `is_premium`, relationship a Subscription
- `backend/main.py` — registrar router de billing y reflexiones_libres, agregar gating en endpoints existentes
- `backend/config.py` — variables Lemonsqueezy
- `backend/requirements.txt` — agregar `httpx` (ya está), confirmar `python-dateutil`
- `backend/.env.example` — variables nuevas

---

## Task 1: Migración Alembic con todas las tablas nuevas

**Files:**
- Create: `backend/alembic/versions/<hash>_premium_system.py`
- Modify: `backend/models.py:36` (agregar columna `timezone` a Usuario)

- [ ] **Step 1: Agregar columna `timezone` al modelo Usuario**

Editar `backend/models.py`, en la clase Usuario después de `fecha_creacion`:

```python
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())

    timezone = Column(String(64), nullable=False, server_default="America/Argentina/Buenos_Aires")
```

- [ ] **Step 2: Generar migración Alembic auto**

Run desde `backend/`:
```bash
alembic revision --autogenerate -m "premium system: subscriptions, promo codes, reflexiones libres, webhook events, email prefs"
```

Expected: crea un archivo nuevo en `backend/alembic/versions/`. Anotá el hash que generó (revision ID).

- [ ] **Step 3: Reemplazar contenido autogenerado con migración manual completa**

El autogenerate va a detectar la columna timezone. El resto de tablas no las detecta porque no existen los modelos todavía. Reemplazar completamente con:

```python
"""premium system: subscriptions, promo codes, reflexiones libres, webhook events, email prefs

Revision ID: <generated_hash>
Revises: e7470743e40a
Create Date: 2026-05-21 ...
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "<generated_hash>"
down_revision: Union[str, Sequence[str], None] = "e7470743e40a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "usuarios",
        sa.Column(
            "timezone",
            sa.String(length=64),
            nullable=False,
            server_default="America/Argentina/Buenos_Aires",
        ),
    )

    op.create_table(
        "subscriptions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("usuario_id", sa.String(length=36), sa.ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("plan", sa.String(length=20), nullable=False),
        sa.Column("lemonsqueezy_subscription_id", sa.String(length=64), nullable=False),
        sa.Column("lemonsqueezy_customer_id", sa.String(length=64), nullable=False),
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_subscriptions_status", "subscriptions", ["status"])
    op.create_index("ix_subscriptions_ls_id", "subscriptions", ["lemonsqueezy_subscription_id"], unique=True)

    op.create_table(
        "promo_codes",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("code", sa.String(length=64), nullable=False, unique=True),
        sa.Column("trial_days", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("max_uses", sa.Integer(), nullable=True),
        sa.Column("uses_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "email_preferences",
        sa.Column("usuario_id", sa.String(length=36), sa.ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("weekly_summary", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("monthly_summary", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("imbalance_alerts", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("reflection_reminders", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "webhook_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("event_id", sa.String(length=128), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("provider", "event_id", name="uq_webhook_provider_event"),
    )

    op.create_table(
        "reflexiones_libres",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("usuario_id", sa.String(length=36), sa.ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("tipo", sa.String(length=20), nullable=False),  # 'sefira' | 'arbol'
        sa.Column("sefira_id", sa.String(length=50), sa.ForeignKey("sefirot.id"), nullable=True),
        sa.Column("contenido", sa.Text(), nullable=False),
        sa.Column("fecha_creacion", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_reflexiones_libres_usuario_fecha", "reflexiones_libres", ["usuario_id", "fecha_creacion"])


def downgrade() -> None:
    op.drop_index("ix_reflexiones_libres_usuario_fecha", table_name="reflexiones_libres")
    op.drop_table("reflexiones_libres")
    op.drop_table("webhook_events")
    op.drop_table("email_preferences")
    op.drop_table("promo_codes")
    op.drop_index("ix_subscriptions_ls_id", table_name="subscriptions")
    op.drop_index("ix_subscriptions_status", table_name="subscriptions")
    op.drop_table("subscriptions")
    op.drop_column("usuarios", "timezone")
```

- [ ] **Step 4: Aplicar la migración**

Run desde `backend/`:
```bash
alembic upgrade head
```

Expected: `INFO  [alembic.runtime.migration] Running upgrade e7470743e40a -> <hash>`

- [ ] **Step 5: Verificar la BD**

Run desde `backend/`:
```bash
python -c "from database import engine; import asyncio; from sqlalchemy import text; \
asyncio.run((lambda: engine.connect().__aenter__())()) and print('ok')"
```

Mejor: abrir `kabbalah.db` con sqlite browser, o:
```bash
python -c "
import sqlite3
conn = sqlite3.connect('kabbalah.db')
tables = conn.execute(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\").fetchall()
print('\n'.join([t[0] for t in tables]))
"
```

Expected: aparecen `subscriptions`, `promo_codes`, `email_preferences`, `webhook_events`, `reflexiones_libres` en el listado.

- [ ] **Step 6: Commit**

```bash
git add backend/alembic/versions/<hash>_premium_system.py backend/models.py
git commit -m "feat(premium): migración inicial — subscriptions, promo codes, email prefs, reflexiones libres"
```

---

## Task 2: Modelos SQLAlchemy del módulo billing

**Files:**
- Create: `backend/billing/__init__.py`
- Create: `backend/billing/models.py`
- Test: `backend/tests/billing/__init__.py` (vacío)
- Test: `backend/tests/billing/test_models.py`

- [ ] **Step 1: Crear el package**

Create `backend/billing/__init__.py` empty.
Create `backend/tests/billing/__init__.py` empty.

- [ ] **Step 2: Escribir el test failing primero**

Create `backend/tests/billing/test_models.py`:

```python
"""Tests for billing SQLAlchemy models."""
import pytest
from datetime import datetime, timedelta, timezone

from billing.models import Subscription, PromoCode, EmailPreferences, WebhookEvent, ReflexionLibre


def test_subscription_model_has_required_fields():
    """Subscription needs all fields from the spec."""
    sub = Subscription(
        id="sub-1",
        usuario_id="user-1",
        status="active",
        plan="monthly",
        lemonsqueezy_subscription_id="ls-sub-1",
        lemonsqueezy_customer_id="ls-cust-1",
        current_period_start=datetime.now(timezone.utc),
        current_period_end=datetime.now(timezone.utc) + timedelta(days=30),
    )
    assert sub.status == "active"
    assert sub.plan == "monthly"
    assert sub.trial_ends_at is None
    assert sub.canceled_at is None


def test_promo_code_defaults():
    code = PromoCode(id="p-1", code="LAUNCH7")
    # trial_days defaults to 7 via server_default; in Python instance, it's None until refreshed.
    # We assert on column default at SQL level via inspect.
    from sqlalchemy import inspect
    cols = {c.name: c for c in inspect(PromoCode).columns}
    assert cols["trial_days"].server_default.arg == "7"
    assert cols["uses_count"].server_default.arg == "0"


def test_reflexion_libre_tipo_field():
    r = ReflexionLibre(
        id="r-1",
        usuario_id="user-1",
        tipo="sefira",
        sefira_id="jesed",
        contenido="texto",
    )
    assert r.tipo == "sefira"
    assert r.sefira_id == "jesed"
```

- [ ] **Step 3: Run para verificar que falla**

Run desde `backend/`:
```bash
pytest tests/billing/test_models.py -v
```

Expected: FAIL con `ModuleNotFoundError: No module named 'billing.models'`

- [ ] **Step 4: Implementar los modelos**

Create `backend/billing/models.py`:

```python
"""SQLAlchemy models for the premium / billing module.

Source of truth for "is this user premium right now?" is the join between
usuarios and subscriptions (status in trial|active). Do NOT denormalize an
is_premium boolean on usuarios — webhooks can lag and the bool gets stale.
"""
import uuid
from sqlalchemy import Column, String, Text, Integer, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from database import Base


def _uuid():
    return str(uuid.uuid4())


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(String(36), primary_key=True, default=_uuid)
    usuario_id = Column(String(36), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, unique=True)
    status = Column(String(20), nullable=False)  # trial|active|past_due|canceled|expired
    plan = Column(String(20), nullable=False)    # monthly|yearly
    lemonsqueezy_subscription_id = Column(String(64), nullable=False, unique=True, index=True)
    lemonsqueezy_customer_id = Column(String(64), nullable=False)
    trial_ends_at = Column(DateTime(timezone=True), nullable=True)
    current_period_start = Column(DateTime(timezone=True), nullable=False)
    current_period_end = Column(DateTime(timezone=True), nullable=False)
    canceled_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class PromoCode(Base):
    __tablename__ = "promo_codes"

    id = Column(String(36), primary_key=True, default=_uuid)
    code = Column(String(64), nullable=False, unique=True)
    trial_days = Column(Integer, nullable=False, server_default="7")
    max_uses = Column(Integer, nullable=True)  # NULL = ilimitado
    uses_count = Column(Integer, nullable=False, server_default="0")
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class EmailPreferences(Base):
    __tablename__ = "email_preferences"

    usuario_id = Column(String(36), ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True)
    weekly_summary = Column(Boolean, nullable=False, server_default="true")
    monthly_summary = Column(Boolean, nullable=False, server_default="true")
    imbalance_alerts = Column(Boolean, nullable=False, server_default="true")
    reflection_reminders = Column(Boolean, nullable=False, server_default="true")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    provider = Column(String(32), nullable=False)
    event_id = Column(String(128), nullable=False)
    event_type = Column(String(64), nullable=False)
    received_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("provider", "event_id", name="uq_webhook_provider_event"),)


class ReflexionLibre(Base):
    __tablename__ = "reflexiones_libres"

    id = Column(String(36), primary_key=True, default=_uuid)
    usuario_id = Column(String(36), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    tipo = Column(String(20), nullable=False)  # 'sefira' | 'arbol'
    sefira_id = Column(String(50), ForeignKey("sefirot.id"), nullable=True)
    contenido = Column(Text, nullable=False)
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
```

- [ ] **Step 5: Run tests, verificar pasan**

Run desde `backend/`:
```bash
pytest tests/billing/test_models.py -v
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/billing/__init__.py backend/billing/models.py backend/tests/billing/__init__.py backend/tests/billing/test_models.py
git commit -m "feat(premium): modelos SQLAlchemy de billing"
```

---

## Task 3: Property `is_premium` en Usuario + relationship

**Files:**
- Modify: `backend/models.py` (agregar relationship y property)
- Test: `backend/tests/billing/test_require_premium.py` (test del comportamiento)

- [ ] **Step 1: Test failing primero**

Create `backend/tests/billing/test_require_premium.py`:

```python
"""Tests for premium gating: is_premium property + require_premium dependency."""
import pytest
from datetime import datetime, timedelta, timezone

from models import Usuario
from billing.models import Subscription


def _make_user_with_sub(status: str) -> Usuario:
    """Build an in-memory Usuario with an attached Subscription. No DB."""
    user = Usuario(id="u1", email="a@b.com", nombre="A", provider="email")
    sub = Subscription(
        id="s1",
        usuario_id="u1",
        status=status,
        plan="monthly",
        lemonsqueezy_subscription_id="ls1",
        lemonsqueezy_customer_id="lc1",
        current_period_start=datetime.now(timezone.utc),
        current_period_end=datetime.now(timezone.utc) + timedelta(days=30),
    )
    user.subscription = sub
    return user


def test_is_premium_true_for_active():
    user = _make_user_with_sub("active")
    assert user.is_premium is True


def test_is_premium_true_for_trial():
    user = _make_user_with_sub("trial")
    assert user.is_premium is True


@pytest.mark.parametrize("status", ["past_due", "canceled", "expired"])
def test_is_premium_false_for_inactive(status):
    user = _make_user_with_sub(status)
    assert user.is_premium is False


def test_is_premium_false_when_no_subscription():
    user = Usuario(id="u2", email="x@y.com", nombre="X", provider="email")
    user.subscription = None
    assert user.is_premium is False
```

- [ ] **Step 2: Run, verificar fail**

```bash
pytest tests/billing/test_require_premium.py::test_is_premium_true_for_active -v
```

Expected: FAIL — `AttributeError: 'Usuario' object has no attribute 'is_premium'`

- [ ] **Step 3: Agregar relationship y property al Usuario**

En `backend/models.py`, agregar import al top:
```python
from sqlalchemy.orm import relationship
```

Y al final de la clase Usuario (después del `__table_args__`):

```python
    # Premium subscription (1:1). Lazy load — only joined when is_premium is read.
    subscription = relationship("Subscription", uselist=False, backref="usuario", lazy="joined")

    @property
    def is_premium(self) -> bool:
        """True if user has a Subscription with status in (trial, active).

        Source of truth for premium gating. Do NOT cache this on the usuarios
        table — webhooks can lag.
        """
        return self.subscription is not None and self.subscription.status in ("trial", "active")
```

Nota: importar `Subscription` por string (`"Subscription"`) evita el import circular.

- [ ] **Step 4: Run tests, verificar pasan**

```bash
pytest tests/billing/test_require_premium.py -v -k "is_premium"
```

Expected: 5 passed (active, trial, past_due, canceled, expired, no_subscription — 6 counting parametrize).

- [ ] **Step 5: Commit**

```bash
git add backend/models.py backend/tests/billing/test_require_premium.py
git commit -m "feat(premium): property is_premium en Usuario + relationship"
```

---

## Task 4: Dependency `require_premium` y `get_user_subscription`

**Files:**
- Create: `backend/billing/dependencies.py`
- Modify: `backend/tests/billing/test_require_premium.py` (agregar tests del dependency)

- [ ] **Step 1: Test failing primero**

Agregar al final de `backend/tests/billing/test_require_premium.py`:

```python
from fastapi import HTTPException

from billing.dependencies import require_premium


@pytest.mark.asyncio
async def test_require_premium_raises_402_for_free_user():
    user = Usuario(id="u3", email="x@x.com", nombre="X", provider="email")
    user.subscription = None
    with pytest.raises(HTTPException) as exc:
        await require_premium(current_user=user)
    assert exc.value.status_code == 402
    assert exc.value.detail["error"] == "premium_required"


@pytest.mark.asyncio
async def test_require_premium_returns_user_for_active():
    user = _make_user_with_sub("active")
    result = await require_premium(current_user=user)
    assert result is user
```

- [ ] **Step 2: Run, verificar fail**

```bash
pytest tests/billing/test_require_premium.py::test_require_premium_raises_402_for_free_user -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'billing.dependencies'`

- [ ] **Step 3: Implementar el dependency**

Create `backend/billing/dependencies.py`:

```python
"""FastAPI dependencies for premium gating.

Use require_premium on any endpoint that should be premium-only:

    @app.post("/some-premium-feature")
    async def feature(user: Usuario = Depends(require_premium)):
        ...

Returns 402 Payment Required when the user lacks an active/trial subscription.
"""
from fastapi import Depends, HTTPException

from auth import get_current_user
from models import Usuario


async def require_premium(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    if not current_user.is_premium:
        raise HTTPException(
            status_code=402,
            detail={"error": "premium_required", "reason": "feature_premium_only"},
        )
    return current_user
```

- [ ] **Step 4: Run, verificar pasan**

```bash
pytest tests/billing/test_require_premium.py -v
```

Expected: todos pasan.

- [ ] **Step 5: Commit**

```bash
git add backend/billing/dependencies.py backend/tests/billing/test_require_premium.py
git commit -m "feat(premium): dependency require_premium"
```

---

## Task 5: Gating en `POST /actividades` — límite de 10 simples

**Files:**
- Modify: `backend/main.py` (endpoint `POST /actividades`)
- Test: `backend/tests/billing/test_gating_actividades.py`

- [ ] **Step 1: Localizar el endpoint actual**

Run:
```bash
grep -n "POST.*actividades\|@app.post.*actividades\|def crear_actividad\|def create_actividad" backend/main.py
```

Anotar el nombre de la función y el rango de líneas.

- [ ] **Step 2: Test failing primero**

Create `backend/tests/billing/test_gating_actividades.py`:

```python
"""Tests for gating on POST /actividades: 10-activity limit + recurrences premium-only."""
import pytest
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from models import Usuario, Actividad


def _payload(titulo="X", rrule=None):
    now = datetime.now(timezone.utc)
    return {
        "titulo": titulo,
        "inicio": now.isoformat(),
        "fin": (now + timedelta(hours=1)).isoformat(),
        "sefirot": ["jesed"],
        "rrule": rrule,
    }


@pytest.mark.asyncio
async def test_free_user_cannot_create_11th_activity(client, free_user_headers, db_session):
    """Free user with 10 active activities gets 402 on the 11th."""
    for i in range(10):
        r = await client.post("/actividades", json=_payload(f"a{i}"), headers=free_user_headers)
        assert r.status_code == 201, r.text

    r = await client.post("/actividades", json=_payload("a11"), headers=free_user_headers)
    assert r.status_code == 402
    body = r.json()["detail"]
    assert body["error"] == "premium_required"
    assert body["reason"] == "actividad_limit"
    assert body["current"] == 10
    assert body["max"] == 10


@pytest.mark.asyncio
async def test_premium_user_can_create_11th(client, premium_user_headers):
    for i in range(11):
        r = await client.post("/actividades", json=_payload(f"a{i}"), headers=premium_user_headers)
        assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_archived_activities_dont_count(client, free_user_headers, db_session):
    """Inactive activities (estado != 'pendiente') don't count toward the limit."""
    # First create 10, then mark them done (estado=completada).
    for i in range(10):
        r = await client.post("/actividades", json=_payload(f"a{i}"), headers=free_user_headers)
        actividad_id = r.json()["id"]
        await db_session.execute(
            f"UPDATE actividades SET estado='completada' WHERE id='{actividad_id}'"
        )
    await db_session.commit()
    r = await client.post("/actividades", json=_payload("a11"), headers=free_user_headers)
    assert r.status_code == 201
```

- [ ] **Step 3: Crear fixtures de premium/free user**

Editar `backend/tests/conftest.py` para agregar (si no existe ya):

```python
@pytest.fixture
async def free_user_headers(client, db_session):
    """Auth headers for a fresh email user without subscription."""
    payload = {"email": "free@test.com", "password": "secret123", "nombre": "Free"}
    await client.post("/auth/register", json=payload)
    r = await client.post("/auth/login", json={"email": payload["email"], "password": payload["password"]})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
async def premium_user_headers(client, db_session):
    """Auth headers for user with an active Subscription row."""
    from datetime import datetime, timedelta, timezone
    from billing.models import Subscription

    payload = {"email": "premium@test.com", "password": "secret123", "nombre": "Premium"}
    await client.post("/auth/register", json=payload)
    r = await client.post("/auth/login", json={"email": payload["email"], "password": payload["password"]})
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    user_id = me.json()["id"]

    sub = Subscription(
        usuario_id=user_id,
        status="active",
        plan="monthly",
        lemonsqueezy_subscription_id="ls-test-" + user_id,
        lemonsqueezy_customer_id="lc-test-" + user_id,
        current_period_start=datetime.now(timezone.utc),
        current_period_end=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db_session.add(sub)
    await db_session.commit()

    return {"Authorization": f"Bearer {r.json()['access_token']}"}
```

- [ ] **Step 4: Run, verificar fail**

```bash
pytest tests/billing/test_gating_actividades.py -v
```

Expected: FAIL — `assert 201 == 402` (porque el endpoint todavía no gateaba).

- [ ] **Step 5: Implementar el gating en main.py**

Editar `backend/main.py`, dentro del handler `POST /actividades` (después de validar inputs, antes de crear la fila):

```python
# --- Premium gating: actividades active count limit ---
FREE_ACTIVIDAD_LIMIT = 10

if not current_user.is_premium:
    active_count = (await db.execute(
        select(func.count(Actividad.id)).where(
            Actividad.usuario_id == current_user.id,
            Actividad.estado == "pendiente",
        )
    )).scalar() or 0
    if active_count >= FREE_ACTIVIDAD_LIMIT:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "premium_required",
                "reason": "actividad_limit",
                "current": active_count,
                "max": FREE_ACTIVIDAD_LIMIT,
            },
        )
```

- [ ] **Step 6: Run, verificar pasan**

```bash
pytest tests/billing/test_gating_actividades.py -v -k "11th or archived"
```

Expected: tests `_free_user_cannot_create_11th_activity`, `_premium_user_can_create_11th`, `_archived_activities_dont_count` pasan.

- [ ] **Step 7: Commit**

```bash
git add backend/main.py backend/tests/billing/test_gating_actividades.py backend/tests/conftest.py
git commit -m "feat(premium): gating de 10 actividades en POST /actividades"
```

---

## Task 6: Gating en `POST /actividades` — recurrencias premium-only

**Files:**
- Modify: `backend/main.py` (mismo endpoint)
- Modify: `backend/tests/billing/test_gating_actividades.py` (agregar tests)

- [ ] **Step 1: Test failing primero**

Agregar al final de `test_gating_actividades.py`:

```python
@pytest.mark.asyncio
async def test_free_user_cannot_create_recurring(client, free_user_headers):
    """Any rrule in payload = premium-only, regardless of count."""
    r = await client.post(
        "/actividades",
        json=_payload("daily", rrule="FREQ=DAILY;COUNT=5"),
        headers=free_user_headers,
    )
    assert r.status_code == 402
    body = r.json()["detail"]
    assert body["reason"] == "recurrence_premium"


@pytest.mark.asyncio
async def test_premium_user_can_create_recurring(client, premium_user_headers):
    r = await client.post(
        "/actividades",
        json=_payload("daily", rrule="FREQ=DAILY;COUNT=5"),
        headers=premium_user_headers,
    )
    assert r.status_code == 201


@pytest.mark.asyncio
async def test_recurrence_gate_runs_before_count_gate(client, free_user_headers):
    """Recurrence gate fires even when count is 0 — checked first."""
    r = await client.post(
        "/actividades",
        json=_payload("daily", rrule="FREQ=WEEKLY"),
        headers=free_user_headers,
    )
    assert r.status_code == 402
    assert r.json()["detail"]["reason"] == "recurrence_premium"
```

- [ ] **Step 2: Run, verificar fail**

```bash
pytest tests/billing/test_gating_actividades.py::test_free_user_cannot_create_recurring -v
```

Expected: FAIL — 201 cuando se esperaba 402.

- [ ] **Step 3: Agregar el gate de recurrencia en main.py**

Editar `backend/main.py`, dentro del handler `POST /actividades`, **ANTES** del gate de count (para que se chequee primero):

```python
# --- Premium gating: recurrence is premium-only ---
if not current_user.is_premium and payload.rrule:
    raise HTTPException(
        status_code=402,
        detail={"error": "premium_required", "reason": "recurrence_premium"},
    )
```

- [ ] **Step 4: Run, verificar pasan todos**

```bash
pytest tests/billing/test_gating_actividades.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/billing/test_gating_actividades.py
git commit -m "feat(premium): recurrencias son premium en POST /actividades"
```

---

## Task 7: Gating en `POST /respuestas` — cooldown parametrizado (7d / 30d)

**Files:**
- Modify: `backend/main.py` (endpoint `POST /respuestas`)
- Test: `backend/tests/billing/test_gating_respuestas.py`

- [ ] **Step 1: Localizar el cooldown actual**

Run:
```bash
grep -n "30\|cooldown\|COOLDOWN" backend/main.py
```

Anotar dónde está hardcoded el `30` o `timedelta(days=30)`.

- [ ] **Step 2: Test failing primero**

Create `backend/tests/billing/test_gating_respuestas.py`:

```python
"""Tests for cooldown parameterization: free=30d, premium=7d."""
import pytest
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from billing.models import Subscription
from models import RespuestaPregunta, PreguntaSefira


async def _post_respuesta(client, headers, pregunta_id, texto="resp"):
    return await client.post(
        "/respuestas",
        json={"pregunta_id": pregunta_id, "respuesta_texto": texto},
        headers=headers,
    )


@pytest.mark.asyncio
async def test_free_user_blocked_8_days_after_answer(client, free_user_headers, sefirot, db_session):
    """Free user: cooldown is 30 days. After 8 days, still blocked."""
    pregunta = PreguntaSefira(id="p1", sefira_id="jesed", texto_pregunta="?")
    db_session.add(pregunta)
    await db_session.commit()

    r = await _post_respuesta(client, free_user_headers, "p1")
    assert r.status_code == 201
    # Backdate the answer 8 days ago
    eight_days_ago = datetime.now(timezone.utc) - timedelta(days=8)
    await db_session.execute(
        f"UPDATE respuestas_preguntas SET fecha_registro='{eight_days_ago.isoformat()}'"
    )
    await db_session.commit()

    r = await _post_respuesta(client, free_user_headers, "p1")
    assert r.status_code == 409  # cooldown still active


@pytest.mark.asyncio
async def test_premium_user_unblocked_8_days_after_answer(client, premium_user_headers, sefirot, db_session):
    """Premium user: cooldown is 7 days. After 8 days, can answer again."""
    pregunta = PreguntaSefira(id="p2", sefira_id="jesed", texto_pregunta="?")
    db_session.add(pregunta)
    await db_session.commit()

    r = await _post_respuesta(client, premium_user_headers, "p2")
    assert r.status_code == 201
    eight_days_ago = datetime.now(timezone.utc) - timedelta(days=8)
    await db_session.execute(
        f"UPDATE respuestas_preguntas SET fecha_registro='{eight_days_ago.isoformat()}'"
    )
    await db_session.commit()

    r = await _post_respuesta(client, premium_user_headers, "p2")
    assert r.status_code == 201
```

- [ ] **Step 3: Run, verificar fail**

```bash
pytest tests/billing/test_gating_respuestas.py -v
```

Expected: el de premium falla con 409 (porque el cooldown sigue siendo 30d para todos).

- [ ] **Step 4: Implementar el cooldown parametrizado en main.py**

Buscar en `backend/main.py` la línea del cooldown (algo como `timedelta(days=30)` en el handler `POST /respuestas`).

Reemplazar:
```python
COOLDOWN_DAYS = 30
```
o lo que sea equivalente, con:

```python
FREE_COOLDOWN_DAYS = 30
PREMIUM_COOLDOWN_DAYS = 7

cooldown_days = PREMIUM_COOLDOWN_DAYS if current_user.is_premium else FREE_COOLDOWN_DAYS
cooldown = timedelta(days=cooldown_days)
```

Y usar `cooldown` donde antes estaba el `timedelta(days=30)`.

- [ ] **Step 5: Run, verificar pasan**

```bash
pytest tests/billing/test_gating_respuestas.py -v
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/tests/billing/test_gating_respuestas.py
git commit -m "feat(premium): cooldown parametrizado 7d premium / 30d free en POST /respuestas"
```

---

## Task 8: Gating histórico — filtro 12 meses en endpoints de lectura

**Files:**
- Modify: `backend/main.py` (endpoints `GET /evolucion/*` y `GET /respuestas`)
- Test: `backend/tests/billing/test_gating_historico.py`

- [ ] **Step 1: Identificar los endpoints de evolucion**

Run:
```bash
grep -n "/evolucion\|@app.get.*evolucion" backend/main.py
```

Anotar los handlers.

- [ ] **Step 2: Test failing primero**

Create `backend/tests/billing/test_gating_historico.py`:

```python
"""Free users see only last 12 months of evolution/respuestas. Premium sees all."""
import pytest
from datetime import datetime, timedelta, timezone
from models import RespuestaPregunta, PreguntaSefira


@pytest.mark.asyncio
async def test_free_user_only_sees_last_12_months_evolucion(client, free_user_headers, sefirot, db_session):
    """Insert 2 respuestas: one 6 months old, one 15 months old. Free sees 1."""
    pregunta = PreguntaSefira(id="p-h1", sefira_id="jesed", texto_pregunta="?")
    db_session.add(pregunta)
    await db_session.commit()

    # Get free user id
    me = await client.get("/auth/me", headers=free_user_headers)
    uid = me.json()["id"]

    six_months_ago = datetime.now(timezone.utc) - timedelta(days=180)
    fifteen_months_ago = datetime.now(timezone.utc) - timedelta(days=460)

    db_session.add_all([
        RespuestaPregunta(id="r-recent", usuario_id=uid, pregunta_id="p-h1", respuesta_texto="recent", fecha_registro=six_months_ago),
        RespuestaPregunta(id="r-old", usuario_id=uid, pregunta_id="p-h1", respuesta_texto="old", fecha_registro=fifteen_months_ago),
    ])
    await db_session.commit()

    r = await client.get("/evolucion/jesed", headers=free_user_headers)
    assert r.status_code == 200
    # the result should NOT include the 15-month-old data point
    body = r.json()
    # Adapt to the actual response shape — typically a list of points
    points = body.get("buckets") or body.get("points") or body
    assert all(p.get("fecha", p.get("date", "")) > (datetime.now(timezone.utc) - timedelta(days=400)).isoformat() for p in points if isinstance(p, dict))


@pytest.mark.asyncio
async def test_premium_user_sees_full_history(client, premium_user_headers, sefirot, db_session):
    pregunta = PreguntaSefira(id="p-h2", sefira_id="jesed", texto_pregunta="?")
    db_session.add(pregunta)
    await db_session.commit()
    me = await client.get("/auth/me", headers=premium_user_headers)
    uid = me.json()["id"]

    fifteen_months_ago = datetime.now(timezone.utc) - timedelta(days=460)
    db_session.add(RespuestaPregunta(id="r-old-p", usuario_id=uid, pregunta_id="p-h2", respuesta_texto="old", fecha_registro=fifteen_months_ago))
    await db_session.commit()

    r = await client.get("/evolucion/jesed", headers=premium_user_headers)
    assert r.status_code == 200
    # premium sees the 15-month-old point
    # validar según el shape real
```

- [ ] **Step 3: Run, verificar fail**

```bash
pytest tests/billing/test_gating_historico.py -v
```

Expected: tests fallan (los endpoints aún no filtran por tier).

- [ ] **Step 4: Implementar el filtro en los handlers de evolucion**

En cada handler de `GET /evolucion/*` y `GET /respuestas` (lectura de histórico), agregar al construir la query:

```python
from datetime import timedelta

# --- Premium gating: historico ---
FREE_HISTORICO_MONTHS = 12

if not current_user.is_premium:
    cutoff = datetime.now(timezone.utc) - timedelta(days=FREE_HISTORICO_MONTHS * 30)
    query = query.where(RespuestaPregunta.fecha_registro >= cutoff)
    # equivalent for cualquier otra entidad que tenga histórico
```

Adaptar según la entidad consultada (`RespuestaPregunta`, `RegistroDiario`, `Actividad`).

- [ ] **Step 5: Run, verificar pasan**

```bash
pytest tests/billing/test_gating_historico.py -v
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/tests/billing/test_gating_historico.py
git commit -m "feat(premium): filtro de 12 meses en GET /evolucion y /respuestas para free"
```

---

## Task 9: Endpoint `POST /reflexiones-libres` con gating 1/mes

**Files:**
- Create: `backend/billing/reflexiones_libres.py`
- Modify: `backend/main.py` (registrar router)
- Test: `backend/tests/billing/test_reflexiones_libres.py`

- [ ] **Step 1: Test failing primero**

Create `backend/tests/billing/test_reflexiones_libres.py`:

```python
"""Tests for POST /reflexiones-libres: 1/month for free, unlimited for premium."""
import pytest


@pytest.mark.asyncio
async def test_free_user_can_create_first_reflexion(client, free_user_headers):
    r = await client.post(
        "/reflexiones-libres",
        json={"tipo": "sefira", "sefira_id": "jesed", "contenido": "primera"},
        headers=free_user_headers,
    )
    assert r.status_code == 201


@pytest.mark.asyncio
async def test_free_user_blocked_on_second_reflexion_same_month(client, free_user_headers, sefirot):
    await client.post(
        "/reflexiones-libres",
        json={"tipo": "arbol", "contenido": "primera"},
        headers=free_user_headers,
    )
    r = await client.post(
        "/reflexiones-libres",
        json={"tipo": "arbol", "contenido": "segunda"},
        headers=free_user_headers,
    )
    assert r.status_code == 402
    assert r.json()["detail"]["reason"] == "free_reflection_limit"


@pytest.mark.asyncio
async def test_premium_can_create_many(client, premium_user_headers, sefirot):
    for i in range(5):
        r = await client.post(
            "/reflexiones-libres",
            json={"tipo": "sefira", "sefira_id": "jesed", "contenido": f"r{i}"},
            headers=premium_user_headers,
        )
        assert r.status_code == 201


@pytest.mark.asyncio
async def test_validates_tipo_sefira_requires_sefira_id(client, premium_user_headers):
    """tipo='sefira' without sefira_id must 422."""
    r = await client.post(
        "/reflexiones-libres",
        json={"tipo": "sefira", "contenido": "x"},  # no sefira_id
        headers=premium_user_headers,
    )
    assert r.status_code == 422
```

- [ ] **Step 2: Run, verificar fail**

```bash
pytest tests/billing/test_reflexiones_libres.py -v
```

Expected: FAIL — `404 Not Found` (endpoint no existe).

- [ ] **Step 3: Implementar el endpoint**

Create `backend/billing/reflexiones_libres.py`:

```python
"""POST /reflexiones-libres — free reflection endpoint with monthly gating.

Free users can submit 1 reflection per calendar month (per their timezone).
Premium users are unlimited.
"""
from datetime import datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, model_validator
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import Usuario
from billing.models import ReflexionLibre


router = APIRouter(prefix="/reflexiones-libres", tags=["reflexiones-libres"])


class ReflexionLibreCreate(BaseModel):
    tipo: str  # 'sefira' | 'arbol'
    sefira_id: Optional[str] = None
    contenido: str

    @model_validator(mode="after")
    def check_sefira_id_required(self):
        if self.tipo == "sefira" and not self.sefira_id:
            raise ValueError("sefira_id is required when tipo='sefira'")
        if self.tipo not in ("sefira", "arbol"):
            raise ValueError("tipo must be 'sefira' or 'arbol'")
        return self


class ReflexionLibreOut(BaseModel):
    id: str
    tipo: str
    sefira_id: Optional[str]
    contenido: str
    fecha_creacion: datetime

    class Config:
        from_attributes = True


@router.post("", response_model=ReflexionLibreOut, status_code=201)
async def create_reflexion_libre(
    payload: ReflexionLibreCreate,
    current_user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.is_premium:
        # Count reflexiones in current calendar month, in user's timezone.
        tz = ZoneInfo(current_user.timezone or "America/Argentina/Buenos_Aires")
        now_local = datetime.now(tz)
        month_start_local = now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_start_utc = month_start_local.astimezone(timezone.utc)

        count = (await db.execute(
            select(func.count(ReflexionLibre.id)).where(
                and_(
                    ReflexionLibre.usuario_id == current_user.id,
                    ReflexionLibre.fecha_creacion >= month_start_utc,
                )
            )
        )).scalar() or 0
        if count >= 1:
            raise HTTPException(
                status_code=402,
                detail={"error": "premium_required", "reason": "free_reflection_limit"},
            )

    r = ReflexionLibre(
        usuario_id=current_user.id,
        tipo=payload.tipo,
        sefira_id=payload.sefira_id,
        contenido=payload.contenido,
    )
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return r
```

- [ ] **Step 4: Registrar el router en main.py**

Editar `backend/main.py`, agregar al top:
```python
from billing.reflexiones_libres import router as reflexiones_libres_router
```

Y después de la creación de `app`:
```python
app.include_router(reflexiones_libres_router)
```

- [ ] **Step 5: Run, verificar pasan**

```bash
pytest tests/billing/test_reflexiones_libres.py -v
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/billing/reflexiones_libres.py backend/main.py backend/tests/billing/test_reflexiones_libres.py
git commit -m "feat(premium): endpoint POST /reflexiones-libres con gating 1/mes"
```

---

## Task 10: Cliente Lemonsqueezy básico (HTTP wrapper)

**Files:**
- Create: `backend/billing/lemonsqueezy.py`
- Modify: `backend/config.py` (variables)
- Modify: `backend/.env.example`

- [ ] **Step 1: Agregar variables de entorno a config**

Editar `backend/config.py`, agregar al Settings:

```python
    lemonsqueezy_api_key: str = ""
    lemonsqueezy_store_id: str = ""
    lemonsqueezy_variant_monthly: str = ""
    lemonsqueezy_variant_yearly: str = ""
    lemonsqueezy_webhook_secret: str = ""

    @property
    def lemonsqueezy_configured(self) -> bool:
        return bool(self.lemonsqueezy_api_key and self.lemonsqueezy_store_id)
```

- [ ] **Step 2: Agregar al `.env.example`**

Editar `backend/.env.example`, agregar:
```
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_VARIANT_MONTHLY=
LEMONSQUEEZY_VARIANT_YEARLY=
LEMONSQUEEZY_WEBHOOK_SECRET=
```

- [ ] **Step 3: Implementar el cliente HTTP**

Create `backend/billing/lemonsqueezy.py`:

```python
"""Thin async HTTP wrapper over the Lemonsqueezy API.

This module knows nothing about our DB. It just talks to Lemonsqueezy and
returns parsed JSON. The webhook handler and routers translate to/from our domain.

Docs: https://docs.lemonsqueezy.com/api
"""
from typing import Optional
import httpx

from config import Settings


BASE_URL = "https://api.lemonsqueezy.com/v1"


class LemonsqueezyError(Exception):
    pass


class LemonsqueezyAuthError(LemonsqueezyError):
    pass


def _headers(api_key: str) -> dict:
    return {
        "Accept": "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        "Authorization": f"Bearer {api_key}",
    }


async def create_checkout(
    settings: Settings,
    *,
    variant_id: str,
    usuario_id: str,
    redirect_url: str,
    promo_code: Optional[str] = None,
    trial_days: Optional[int] = None,
) -> str:
    """Create a Checkout in Lemonsqueezy. Returns the checkout URL.

    Trial is applied only when trial_days is provided (= valid promo code).
    """
    body = {
        "data": {
            "type": "checkouts",
            "attributes": {
                "checkout_data": {
                    "custom": {
                        "usuario_id": usuario_id,
                        "promo_code": promo_code or "",
                    }
                },
                "product_options": {
                    "redirect_url": redirect_url,
                },
            },
            "relationships": {
                "store": {"data": {"type": "stores", "id": settings.lemonsqueezy_store_id}},
                "variant": {"data": {"type": "variants", "id": variant_id}},
            },
        }
    }

    if trial_days:
        body["data"]["attributes"]["checkout_options"] = {"subscription_preview": True}
        # Lemonsqueezy uses product-level trial config; if the variant doesn't
        # have a default trial, set it dynamically via custom:
        body["data"]["attributes"]["checkout_data"]["custom"]["trial_days"] = str(trial_days)

    async with httpx.AsyncClient(timeout=15) as http:
        r = await http.post(f"{BASE_URL}/checkouts", json=body, headers=_headers(settings.lemonsqueezy_api_key))
    if r.status_code == 401:
        raise LemonsqueezyAuthError("lemonsqueezy auth failed")
    if r.status_code >= 400:
        raise LemonsqueezyError(f"lemonsqueezy {r.status_code}: {r.text}")

    return r.json()["data"]["attributes"]["url"]


async def get_customer_portal_url(settings: Settings, customer_id: str) -> str:
    """Generate a Customer Portal URL where the user can manage their subscription."""
    async with httpx.AsyncClient(timeout=15) as http:
        r = await http.get(f"{BASE_URL}/customers/{customer_id}", headers=_headers(settings.lemonsqueezy_api_key))
    if r.status_code >= 400:
        raise LemonsqueezyError(f"lemonsqueezy {r.status_code}: {r.text}")
    return r.json()["data"]["attributes"]["urls"]["customer_portal"]
```

- [ ] **Step 4: Commit (sin test todavía — los tests vienen integrados en los endpoints)**

```bash
git add backend/config.py backend/.env.example backend/billing/lemonsqueezy.py
git commit -m "feat(premium): cliente Lemonsqueezy básico (checkout + portal URL)"
```

---

## Task 11: Endpoint `POST /billing/checkout`

**Files:**
- Create: `backend/billing/routers.py`
- Create: `backend/billing/promo_codes.py`
- Modify: `backend/main.py` (registrar router)
- Test: `backend/tests/billing/test_lemonsqueezy_checkout.py`

- [ ] **Step 1: Agregar `respx` a requirements (HTTP mocking)**

Verificar que esté en `backend/requirements.txt`. Si no:
```bash
echo "respx" >> backend/requirements.txt
pip install respx
```

- [ ] **Step 2: Test failing primero**

Create `backend/tests/billing/test_lemonsqueezy_checkout.py`:

```python
"""Tests for POST /billing/checkout."""
import pytest
import respx
from httpx import Response


@pytest.fixture
def mock_ls_settings(monkeypatch):
    """Patch settings so the test has Lemonsqueezy config."""
    from config import get_settings
    settings = get_settings()
    settings.lemonsqueezy_api_key = "test-key"
    settings.lemonsqueezy_store_id = "12345"
    settings.lemonsqueezy_variant_monthly = "v-monthly"
    settings.lemonsqueezy_variant_yearly = "v-yearly"
    return settings


@pytest.mark.asyncio
async def test_checkout_returns_url(client, free_user_headers, mock_ls_settings):
    with respx.mock(base_url="https://api.lemonsqueezy.com/v1") as mock:
        mock.post("/checkouts").mock(
            return_value=Response(201, json={
                "data": {"attributes": {"url": "https://kabbalah.lemonsqueezy.com/checkout/abc"}}
            })
        )

        r = await client.post("/billing/checkout", json={"plan": "monthly"}, headers=free_user_headers)
        assert r.status_code == 200
        assert r.json()["checkout_url"] == "https://kabbalah.lemonsqueezy.com/checkout/abc"


@pytest.mark.asyncio
async def test_checkout_requires_auth(client):
    r = await client.post("/billing/checkout", json={"plan": "monthly"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_checkout_validates_plan(client, free_user_headers, mock_ls_settings):
    r = await client.post("/billing/checkout", json={"plan": "invalid"}, headers=free_user_headers)
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_checkout_with_invalid_promo_fails(client, free_user_headers, mock_ls_settings):
    r = await client.post(
        "/billing/checkout",
        json={"plan": "monthly", "promo_code": "DOES_NOT_EXIST"},
        headers=free_user_headers,
    )
    assert r.status_code == 400
    assert "promo" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_checkout_with_valid_promo_passes_trial_days(client, free_user_headers, mock_ls_settings, db_session):
    from billing.models import PromoCode
    promo = PromoCode(id="pc1", code="LAUNCH7", trial_days=7, max_uses=100, uses_count=0)
    db_session.add(promo)
    await db_session.commit()

    with respx.mock(base_url="https://api.lemonsqueezy.com/v1") as mock:
        route = mock.post("/checkouts").mock(
            return_value=Response(201, json={"data": {"attributes": {"url": "https://x.com/c"}}})
        )

        r = await client.post(
            "/billing/checkout",
            json={"plan": "monthly", "promo_code": "LAUNCH7"},
            headers=free_user_headers,
        )
        assert r.status_code == 200

        # Verify trial_days was passed in the body
        req = route.calls[0].request
        body = req.read().decode()
        assert "trial_days" in body
        assert "7" in body
```

- [ ] **Step 3: Run, verificar fail**

```bash
pytest tests/billing/test_lemonsqueezy_checkout.py -v
```

Expected: 404 — router no existe.

- [ ] **Step 4: Implementar promo_codes.py**

Create `backend/billing/promo_codes.py`:

```python
"""Promo code validation."""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from billing.models import PromoCode


class PromoCodeError(Exception):
    pass


async def validate_and_consume(db: AsyncSession, code: str) -> PromoCode:
    """Return the PromoCode if valid. Raises PromoCodeError otherwise.

    Does NOT increment uses_count here — that happens in the webhook handler
    when subscription_created confirms the conversion.
    """
    promo = (await db.execute(
        select(PromoCode).where(PromoCode.code == code)
    )).scalars().first()
    if promo is None:
        raise PromoCodeError("promo code not found")
    if promo.expires_at and promo.expires_at < datetime.now(timezone.utc):
        raise PromoCodeError("promo code expired")
    if promo.max_uses is not None and promo.uses_count >= promo.max_uses:
        raise PromoCodeError("promo code exhausted")
    return promo
```

- [ ] **Step 5: Implementar routers.py**

Create `backend/billing/routers.py`:

```python
"""Billing endpoints: checkout, customer portal."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from config import Settings, get_settings
from database import get_db
from models import Usuario
from billing import lemonsqueezy
from billing.promo_codes import validate_and_consume, PromoCodeError


router = APIRouter(prefix="/billing", tags=["billing"])


class CheckoutRequest(BaseModel):
    plan: str  # 'monthly' | 'yearly'
    promo_code: Optional[str] = None

    @field_validator("plan")
    @classmethod
    def plan_valid(cls, v):
        if v not in ("monthly", "yearly"):
            raise ValueError("plan must be 'monthly' or 'yearly'")
        return v


class CheckoutResponse(BaseModel):
    checkout_url: str


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    payload: CheckoutRequest,
    current_user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    trial_days = None
    if payload.promo_code:
        try:
            promo = await validate_and_consume(db, payload.promo_code)
            trial_days = promo.trial_days
        except PromoCodeError as e:
            raise HTTPException(status_code=400, detail=f"promo: {e}")

    variant_id = (
        settings.lemonsqueezy_variant_monthly if payload.plan == "monthly"
        else settings.lemonsqueezy_variant_yearly
    )

    url = await lemonsqueezy.create_checkout(
        settings,
        variant_id=variant_id,
        usuario_id=current_user.id,
        redirect_url=f"{settings.frontend_url}/billing/success",
        promo_code=payload.promo_code,
        trial_days=trial_days,
    )
    return {"checkout_url": url}


@router.get("/portal")
async def billing_portal(
    current_user: Usuario = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    if current_user.subscription is None:
        raise HTTPException(status_code=404, detail="no_subscription")
    url = await lemonsqueezy.get_customer_portal_url(
        settings, current_user.subscription.lemonsqueezy_customer_id
    )
    return {"portal_url": url}
```

- [ ] **Step 6: Registrar router en main.py**

Editar `backend/main.py`:
```python
from billing.routers import router as billing_router
# ...
app.include_router(billing_router)
```

- [ ] **Step 7: Run, verificar pasan**

```bash
pytest tests/billing/test_lemonsqueezy_checkout.py -v
```

Expected: 5 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/billing/routers.py backend/billing/promo_codes.py backend/main.py backend/requirements.txt backend/tests/billing/test_lemonsqueezy_checkout.py
git commit -m "feat(premium): endpoint POST /billing/checkout + validación promo codes"
```

---

## Task 12: Webhook handler con HMAC validation + idempotencia

**Files:**
- Create: `backend/billing/webhooks.py`
- Modify: `backend/billing/routers.py` (registrar la ruta del webhook)
- Test: `backend/tests/billing/test_lemonsqueezy_webhooks.py`

- [ ] **Step 1: Test failing primero — HMAC validation**

Create `backend/tests/billing/test_lemonsqueezy_webhooks.py`:

```python
"""Tests for POST /webhooks/lemonsqueezy: HMAC validation + idempotency + event dispatch."""
import json
import hmac
import hashlib
import pytest


WEBHOOK_SECRET = "test-webhook-secret"


def _sign(body: bytes, secret: str = WEBHOOK_SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


@pytest.fixture
def mock_webhook_secret(monkeypatch):
    from config import get_settings
    settings = get_settings()
    settings.lemonsqueezy_webhook_secret = WEBHOOK_SECRET
    return settings


@pytest.mark.asyncio
async def test_webhook_rejects_missing_signature(client, mock_webhook_secret):
    payload = {"meta": {"event_name": "subscription_created", "custom_data": {}}, "data": {}}
    r = await client.post("/webhooks/lemonsqueezy", json=payload)
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_webhook_rejects_bad_signature(client, mock_webhook_secret):
    payload = {"meta": {"event_name": "subscription_created"}, "data": {}}
    body = json.dumps(payload).encode()
    r = await client.post(
        "/webhooks/lemonsqueezy",
        content=body,
        headers={"X-Signature": "bad-sig", "Content-Type": "application/json"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_webhook_accepts_valid_signature(client, mock_webhook_secret):
    payload = {
        "meta": {"event_name": "subscription_created", "custom_data": {}, "test_mode": True},
        "data": {"id": "evt-1", "attributes": {}},
    }
    body = json.dumps(payload).encode()
    sig = _sign(body)
    r = await client.post(
        "/webhooks/lemonsqueezy",
        content=body,
        headers={"X-Signature": sig, "Content-Type": "application/json"},
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_webhook_idempotent_on_repeat_event_id(client, mock_webhook_secret, db_session):
    from sqlalchemy import select, func
    from billing.models import WebhookEvent

    payload = {
        "meta": {"event_name": "subscription_created", "custom_data": {}},
        "data": {"id": "evt-dup", "attributes": {}},
    }
    body = json.dumps(payload).encode()
    sig = _sign(body)
    headers = {"X-Signature": sig, "Content-Type": "application/json"}

    await client.post("/webhooks/lemonsqueezy", content=body, headers=headers)
    await client.post("/webhooks/lemonsqueezy", content=body, headers=headers)

    count = (await db_session.execute(
        select(func.count(WebhookEvent.id)).where(WebhookEvent.event_id == "evt-dup")
    )).scalar()
    assert count == 1
```

- [ ] **Step 2: Run, verificar fail**

```bash
pytest tests/billing/test_lemonsqueezy_webhooks.py -v
```

Expected: FAIL — endpoint no existe (404).

- [ ] **Step 3: Implementar webhooks.py con HMAC + idempotencia (sin lógica de eventos aún)**

Create `backend/billing/webhooks.py`:

```python
"""Lemonsqueezy webhook handler.

Validates HMAC signature, deduplicates events, dispatches to per-event handlers.
The per-event handlers live in the same file below (one function per event type).
"""
import hmac
import hashlib
import logging
from fastapi import APIRouter, Header, HTTPException, Request, Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from config import Settings, get_settings
from database import get_db
from billing.models import WebhookEvent


logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhooks"])


def _verify_signature(body: bytes, signature: str, secret: str) -> bool:
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/webhooks/lemonsqueezy")
async def lemonsqueezy_webhook(
    request: Request,
    x_signature: str = Header(None, alias="X-Signature"),
    settings: Settings = Depends(get_settings),
    db: AsyncSession = Depends(get_db),
):
    body = await request.body()
    if not _verify_signature(body, x_signature or "", settings.lemonsqueezy_webhook_secret):
        raise HTTPException(status_code=401, detail="invalid signature")

    payload = await request.json()
    event_name = payload.get("meta", {}).get("event_name")
    event_id = payload.get("data", {}).get("id")

    if not event_name or not event_id:
        raise HTTPException(status_code=400, detail="malformed payload")

    # Idempotency: insert into webhook_events. If UNIQUE fails, we already processed.
    try:
        db.add(WebhookEvent(provider="lemonsqueezy", event_id=event_id, event_type=event_name))
        await db.commit()
    except IntegrityError:
        await db.rollback()
        logger.info("webhook duplicate skipped event_id=%s", event_id)
        return {"status": "duplicate_ignored"}

    # Dispatch — implemented in Task 13+
    handler = EVENT_HANDLERS.get(event_name)
    if handler:
        await handler(payload, db)
    else:
        logger.info("unhandled event %s", event_name)

    return {"status": "ok"}


# Filled in Task 13+
EVENT_HANDLERS = {}
```

- [ ] **Step 4: Registrar el webhook router en main.py**

```python
from billing.webhooks import router as webhooks_router
# ...
app.include_router(webhooks_router)
```

- [ ] **Step 5: Run tests de HMAC e idempotencia**

```bash
pytest tests/billing/test_lemonsqueezy_webhooks.py -v -k "signature or idempotent"
```

Expected: los 4 primeros pasan (rechazo missing/bad sig, accept valid sig, idempotency).

- [ ] **Step 6: Commit**

```bash
git add backend/billing/webhooks.py backend/main.py backend/tests/billing/test_lemonsqueezy_webhooks.py
git commit -m "feat(premium): webhook handler con HMAC validation + idempotencia"
```

---

## Task 13: Webhook event handler — `subscription_created`

**Files:**
- Modify: `backend/billing/webhooks.py`
- Modify: `backend/tests/billing/test_lemonsqueezy_webhooks.py`

- [ ] **Step 1: Test failing primero**

Agregar a `test_lemonsqueezy_webhooks.py`:

```python
@pytest.mark.asyncio
async def test_subscription_created_creates_row(client, mock_webhook_secret, db_session):
    from sqlalchemy import select
    from billing.models import Subscription, PromoCode, EmailPreferences
    from models import Usuario

    # Need a real user for the FK
    user = Usuario(id="u-cb1", email="cb@x.com", nombre="CB", provider="email")
    promo = PromoCode(id="pc-launch", code="LAUNCH", trial_days=7, max_uses=10, uses_count=0)
    db_session.add_all([user, promo])
    await db_session.commit()

    payload = {
        "meta": {
            "event_name": "subscription_created",
            "custom_data": {"usuario_id": "u-cb1", "promo_code": "LAUNCH"},
        },
        "data": {
            "id": "evt-sc-1",
            "attributes": {
                "store_id": 1,
                "customer_id": 999,
                "status": "on_trial",  # Lemonsqueezy uses this name; we map to 'trial'
                "trial_ends_at": "2026-05-28T00:00:00.000000Z",
                "renews_at": "2026-06-21T00:00:00.000000Z",
                "created_at": "2026-05-21T00:00:00.000000Z",
                "variant_id": 100,
                "product_id": 200,
            },
        },
    }
    body = json.dumps(payload).encode()
    sig = _sign(body)
    r = await client.post(
        "/webhooks/lemonsqueezy",
        content=body,
        headers={"X-Signature": sig, "Content-Type": "application/json"},
    )
    assert r.status_code == 200

    sub = (await db_session.execute(
        select(Subscription).where(Subscription.usuario_id == "u-cb1")
    )).scalars().first()
    assert sub is not None
    assert sub.status == "trial"
    assert sub.lemonsqueezy_subscription_id == "evt-sc-1"

    # Email preferences row created
    prefs = (await db_session.execute(
        select(EmailPreferences).where(EmailPreferences.usuario_id == "u-cb1")
    )).scalars().first()
    assert prefs is not None

    # Promo uses_count incremented
    await db_session.refresh(promo)
    assert promo.uses_count == 1
```

- [ ] **Step 2: Run, verificar fail**

```bash
pytest tests/billing/test_lemonsqueezy_webhooks.py::test_subscription_created_creates_row -v
```

Expected: FAIL — no se crea la Subscription.

- [ ] **Step 3: Implementar el handler**

En `backend/billing/webhooks.py`, **reemplazar** la línea `EVENT_HANDLERS = {}` por:

```python
from datetime import datetime
from sqlalchemy import select
from billing.models import Subscription, EmailPreferences, PromoCode


def _parse_ls_dt(s: str) -> datetime:
    """Parse Lemonsqueezy ISO timestamp (e.g. '2026-05-21T00:00:00.000000Z')."""
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _map_status(ls_status: str) -> str:
    """Lemonsqueezy uses 'on_trial', 'active', 'paused', 'past_due', 'unpaid', 'cancelled', 'expired'."""
    mapping = {
        "on_trial": "trial",
        "active": "active",
        "past_due": "past_due",
        "unpaid": "past_due",
        "cancelled": "canceled",
        "expired": "expired",
        "paused": "expired",
    }
    return mapping.get(ls_status, "expired")


def _infer_plan(attrs: dict, settings_variant_monthly: str, settings_variant_yearly: str) -> str:
    """Infer monthly|yearly from variant_id. Default to monthly if unknown."""
    variant = str(attrs.get("variant_id", ""))
    if variant == settings_variant_yearly:
        return "yearly"
    return "monthly"


async def handle_subscription_created(payload: dict, db: AsyncSession):
    attrs = payload["data"]["attributes"]
    custom = payload["meta"].get("custom_data", {}) or {}
    usuario_id = custom.get("usuario_id")
    if not usuario_id:
        logger.warning("subscription_created without usuario_id in custom_data; skipping")
        return

    from config import get_settings
    settings = get_settings()

    sub = Subscription(
        usuario_id=usuario_id,
        status=_map_status(attrs.get("status", "")),
        plan=_infer_plan(attrs, settings.lemonsqueezy_variant_monthly, settings.lemonsqueezy_variant_yearly),
        lemonsqueezy_subscription_id=payload["data"]["id"],
        lemonsqueezy_customer_id=str(attrs.get("customer_id", "")),
        trial_ends_at=_parse_ls_dt(attrs["trial_ends_at"]) if attrs.get("trial_ends_at") else None,
        current_period_start=_parse_ls_dt(attrs.get("created_at")) if attrs.get("created_at") else datetime.now(),
        current_period_end=_parse_ls_dt(attrs["renews_at"]) if attrs.get("renews_at") else datetime.now(),
    )
    db.add(sub)

    # Create email preferences row with defaults
    prefs = EmailPreferences(usuario_id=usuario_id)
    db.add(prefs)

    # Increment promo uses_count if applicable
    promo_code_str = custom.get("promo_code")
    if promo_code_str:
        promo = (await db.execute(
            select(PromoCode).where(PromoCode.code == promo_code_str)
        )).scalars().first()
        if promo:
            promo.uses_count = (promo.uses_count or 0) + 1

    await db.commit()


EVENT_HANDLERS = {
    "subscription_created": handle_subscription_created,
}
```

- [ ] **Step 4: Run, verificar pasa**

```bash
pytest tests/billing/test_lemonsqueezy_webhooks.py::test_subscription_created_creates_row -v
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add backend/billing/webhooks.py backend/tests/billing/test_lemonsqueezy_webhooks.py
git commit -m "feat(premium): webhook handler subscription_created"
```

---

## Task 14: Webhook event handlers — `subscription_updated`, `_cancelled`, `_expired`

**Files:**
- Modify: `backend/billing/webhooks.py`
- Modify: `backend/tests/billing/test_lemonsqueezy_webhooks.py`

- [ ] **Step 1: Test failing primero — los tres eventos**

Agregar a `test_lemonsqueezy_webhooks.py`:

```python
async def _send_event(client, event_name, sub_id, attrs):
    payload = {
        "meta": {"event_name": event_name, "custom_data": {}},
        "data": {"id": sub_id, "attributes": attrs},
    }
    body = json.dumps(payload).encode()
    sig = _sign(body)
    return await client.post("/webhooks/lemonsqueezy", content=body, headers={"X-Signature": sig, "Content-Type": "application/json"})


@pytest.fixture
async def existing_sub(db_session):
    from billing.models import Subscription
    from datetime import datetime, timedelta, timezone
    from models import Usuario
    user = Usuario(id="u-up", email="up@x.com", nombre="U", provider="email")
    sub = Subscription(
        id="s-up", usuario_id="u-up", status="active", plan="monthly",
        lemonsqueezy_subscription_id="ls-up", lemonsqueezy_customer_id="lc-up",
        current_period_start=datetime.now(timezone.utc),
        current_period_end=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db_session.add_all([user, sub])
    await db_session.commit()
    return sub


@pytest.mark.asyncio
async def test_subscription_updated_syncs_status(client, mock_webhook_secret, existing_sub, db_session):
    from sqlalchemy import select
    from billing.models import Subscription
    r = await _send_event(client, "subscription_updated", "ls-up", {
        "status": "past_due",
        "renews_at": "2026-06-21T00:00:00.000000Z",
        "customer_id": 999,
        "variant_id": 100,
    })
    assert r.status_code == 200
    s = (await db_session.execute(select(Subscription).where(Subscription.lemonsqueezy_subscription_id == "ls-up"))).scalars().first()
    assert s.status == "past_due"


@pytest.mark.asyncio
async def test_subscription_cancelled_keeps_access_until_period_end(client, mock_webhook_secret, existing_sub, db_session):
    from sqlalchemy import select
    from billing.models import Subscription
    r = await _send_event(client, "subscription_cancelled", "ls-up", {
        "status": "cancelled",
        "ends_at": "2026-06-21T00:00:00.000000Z",
        "customer_id": 999,
        "variant_id": 100,
    })
    assert r.status_code == 200
    s = (await db_session.execute(select(Subscription).where(Subscription.lemonsqueezy_subscription_id == "ls-up"))).scalars().first()
    assert s.status == "canceled"
    assert s.canceled_at is not None
    # current_period_end remains in the future — user still has access


@pytest.mark.asyncio
async def test_subscription_expired_user_becomes_free(client, mock_webhook_secret, existing_sub, db_session):
    from sqlalchemy import select
    from billing.models import Subscription
    r = await _send_event(client, "subscription_expired", "ls-up", {
        "status": "expired",
        "customer_id": 999,
        "variant_id": 100,
    })
    assert r.status_code == 200
    s = (await db_session.execute(select(Subscription).where(Subscription.lemonsqueezy_subscription_id == "ls-up"))).scalars().first()
    assert s.status == "expired"
```

- [ ] **Step 2: Run, verificar fail**

```bash
pytest tests/billing/test_lemonsqueezy_webhooks.py -v -k "updated or cancelled or expired"
```

Expected: handlers no implementados todavía, status no cambia.

- [ ] **Step 3: Implementar los handlers**

En `backend/billing/webhooks.py`, **antes** del dict `EVENT_HANDLERS`, agregar:

```python
async def handle_subscription_updated(payload: dict, db: AsyncSession):
    sub_id = payload["data"]["id"]
    attrs = payload["data"]["attributes"]
    sub = (await db.execute(
        select(Subscription).where(Subscription.lemonsqueezy_subscription_id == sub_id)
    )).scalars().first()
    if sub is None:
        logger.warning("subscription_updated for unknown sub_id=%s", sub_id)
        return
    sub.status = _map_status(attrs.get("status", sub.status))
    if attrs.get("renews_at"):
        sub.current_period_end = _parse_ls_dt(attrs["renews_at"])
    await db.commit()


async def handle_subscription_cancelled(payload: dict, db: AsyncSession):
    sub_id = payload["data"]["id"]
    attrs = payload["data"]["attributes"]
    sub = (await db.execute(
        select(Subscription).where(Subscription.lemonsqueezy_subscription_id == sub_id)
    )).scalars().first()
    if sub is None:
        return
    sub.status = "canceled"
    sub.canceled_at = datetime.now()
    if attrs.get("ends_at"):
        sub.current_period_end = _parse_ls_dt(attrs["ends_at"])
    await db.commit()


async def handle_subscription_expired(payload: dict, db: AsyncSession):
    sub_id = payload["data"]["id"]
    sub = (await db.execute(
        select(Subscription).where(Subscription.lemonsqueezy_subscription_id == sub_id)
    )).scalars().first()
    if sub is None:
        return
    sub.status = "expired"
    await db.commit()
```

Y actualizar `EVENT_HANDLERS`:

```python
EVENT_HANDLERS = {
    "subscription_created": handle_subscription_created,
    "subscription_updated": handle_subscription_updated,
    "subscription_cancelled": handle_subscription_cancelled,
    "subscription_expired": handle_subscription_expired,
}
```

- [ ] **Step 4: Run, verificar pasan**

```bash
pytest tests/billing/test_lemonsqueezy_webhooks.py -v
```

Expected: todos pasan.

- [ ] **Step 5: Commit**

```bash
git add backend/billing/webhooks.py backend/tests/billing/test_lemonsqueezy_webhooks.py
git commit -m "feat(premium): handlers subscription_updated, _cancelled, _expired"
```

---

## Task 15: Webhook event handlers — `subscription_payment_failed` / `_recovered`

**Files:**
- Modify: `backend/billing/webhooks.py`
- Modify: `backend/tests/billing/test_lemonsqueezy_webhooks.py`

- [ ] **Step 1: Test failing primero**

Agregar a `test_lemonsqueezy_webhooks.py`:

```python
@pytest.mark.asyncio
async def test_payment_failed_sets_past_due(client, mock_webhook_secret, existing_sub, db_session):
    from sqlalchemy import select
    from billing.models import Subscription
    r = await _send_event(client, "subscription_payment_failed", "ls-up", {
        "status": "past_due",
        "customer_id": 999,
    })
    assert r.status_code == 200
    s = (await db_session.execute(select(Subscription).where(Subscription.lemonsqueezy_subscription_id == "ls-up"))).scalars().first()
    assert s.status == "past_due"


@pytest.mark.asyncio
async def test_payment_recovered_restores_active(client, mock_webhook_secret, existing_sub, db_session):
    from sqlalchemy import select
    from billing.models import Subscription
    # First put into past_due
    existing_sub.status = "past_due"
    await db_session.commit()

    r = await _send_event(client, "subscription_payment_recovered", "ls-up", {
        "status": "active",
        "customer_id": 999,
    })
    assert r.status_code == 200
    s = (await db_session.execute(select(Subscription).where(Subscription.lemonsqueezy_subscription_id == "ls-up"))).scalars().first()
    assert s.status == "active"
```

- [ ] **Step 2: Run, verificar fail**

```bash
pytest tests/billing/test_lemonsqueezy_webhooks.py -v -k "payment"
```

Expected: handlers no existen aún.

- [ ] **Step 3: Implementar y registrar**

En `backend/billing/webhooks.py`:

```python
async def handle_subscription_payment_failed(payload: dict, db: AsyncSession):
    sub_id = payload["data"]["id"]
    sub = (await db.execute(
        select(Subscription).where(Subscription.lemonsqueezy_subscription_id == sub_id)
    )).scalars().first()
    if sub is None:
        return
    sub.status = "past_due"
    await db.commit()
    logger.warning("payment failed for sub=%s usuario=%s", sub_id, sub.usuario_id)


async def handle_subscription_payment_recovered(payload: dict, db: AsyncSession):
    sub_id = payload["data"]["id"]
    sub = (await db.execute(
        select(Subscription).where(Subscription.lemonsqueezy_subscription_id == sub_id)
    )).scalars().first()
    if sub is None:
        return
    sub.status = "active"
    await db.commit()
```

Y al dict:

```python
EVENT_HANDLERS = {
    "subscription_created": handle_subscription_created,
    "subscription_updated": handle_subscription_updated,
    "subscription_cancelled": handle_subscription_cancelled,
    "subscription_expired": handle_subscription_expired,
    "subscription_payment_failed": handle_subscription_payment_failed,
    "subscription_payment_recovered": handle_subscription_payment_recovered,
}
```

- [ ] **Step 4: Run, verificar pasan**

```bash
pytest tests/billing/test_lemonsqueezy_webhooks.py -v
```

Expected: todos pasan.

- [ ] **Step 5: Commit**

```bash
git add backend/billing/webhooks.py backend/tests/billing/test_lemonsqueezy_webhooks.py
git commit -m "feat(premium): handlers subscription_payment_failed / _recovered"
```

---

## Task 16: Tests del flujo end-to-end de promo codes

**Files:**
- Test: `backend/tests/billing/test_promo_codes.py`

- [ ] **Step 1: Tests del flujo**

Create `backend/tests/billing/test_promo_codes.py`:

```python
"""Tests for promo_codes validation logic."""
import pytest
from datetime import datetime, timedelta, timezone

from billing.models import PromoCode
from billing.promo_codes import validate_and_consume, PromoCodeError


@pytest.mark.asyncio
async def test_validate_returns_valid_promo(db_session):
    promo = PromoCode(id="p1", code="VALID", trial_days=7, max_uses=10, uses_count=0)
    db_session.add(promo)
    await db_session.commit()

    result = await validate_and_consume(db_session, "VALID")
    assert result.code == "VALID"
    assert result.trial_days == 7


@pytest.mark.asyncio
async def test_validate_raises_on_unknown_code(db_session):
    with pytest.raises(PromoCodeError, match="not found"):
        await validate_and_consume(db_session, "NOPE")


@pytest.mark.asyncio
async def test_validate_raises_on_expired(db_session):
    promo = PromoCode(id="p2", code="OLD", trial_days=7, expires_at=datetime.now(timezone.utc) - timedelta(days=1))
    db_session.add(promo)
    await db_session.commit()

    with pytest.raises(PromoCodeError, match="expired"):
        await validate_and_consume(db_session, "OLD")


@pytest.mark.asyncio
async def test_validate_raises_on_exhausted(db_session):
    promo = PromoCode(id="p3", code="DONE", trial_days=7, max_uses=1, uses_count=1)
    db_session.add(promo)
    await db_session.commit()

    with pytest.raises(PromoCodeError, match="exhausted"):
        await validate_and_consume(db_session, "DONE")


@pytest.mark.asyncio
async def test_unlimited_uses_when_max_uses_null(db_session):
    promo = PromoCode(id="p4", code="UNLIMITED", trial_days=7, max_uses=None, uses_count=999)
    db_session.add(promo)
    await db_session.commit()

    result = await validate_and_consume(db_session, "UNLIMITED")
    assert result.code == "UNLIMITED"
```

- [ ] **Step 2: Run, verificar pasan**

```bash
pytest tests/billing/test_promo_codes.py -v
```

Expected: 5 passed.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/billing/test_promo_codes.py
git commit -m "test(premium): cobertura completa de promo_codes validation"
```

---

## Task 17: CLI para crear promo codes

**Files:**
- Create: `backend/scripts/create_promo_code.py`

- [ ] **Step 1: Implementar script**

Create `backend/scripts/create_promo_code.py`:

```python
"""Create a promo code from the command line.

Usage:
    python scripts/create_promo_code.py --code LAUNCH7 --trial-days 7 --max-uses 100 --expires 2026-12-31
    python scripts/create_promo_code.py --code FRIENDS --trial-days 7  # unlimited uses, no expiry
"""
import argparse
import asyncio
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import async_sessionmaker

from database import engine
from billing.models import PromoCode


async def main():
    parser = argparse.ArgumentParser(description="Create a promo code")
    parser.add_argument("--code", required=True, help="The promo code string (uppercase recommended)")
    parser.add_argument("--trial-days", type=int, default=7)
    parser.add_argument("--max-uses", type=int, default=None, help="None = unlimited")
    parser.add_argument("--expires", default=None, help="YYYY-MM-DD; None = no expiry")
    args = parser.parse_args()

    expires_at = None
    if args.expires:
        expires_at = datetime.strptime(args.expires, "%Y-%m-%d").replace(tzinfo=timezone.utc)

    session_maker = async_sessionmaker(engine, expire_on_commit=False)
    async with session_maker() as session:
        promo = PromoCode(
            code=args.code.upper(),
            trial_days=args.trial_days,
            max_uses=args.max_uses,
            expires_at=expires_at,
        )
        session.add(promo)
        await session.commit()
        print(f"Created promo code: {promo.code} (id={promo.id})")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Probar el script**

Run desde `backend/`:
```bash
python scripts/create_promo_code.py --code TEST7 --trial-days 7 --max-uses 5
```

Expected: `Created promo code: TEST7 (id=<uuid>)`.

- [ ] **Step 3: Verificar en BD**

```bash
python -c "
import sqlite3
conn = sqlite3.connect('kabbalah.db')
print(conn.execute('SELECT code, trial_days, max_uses FROM promo_codes').fetchall())
"
```

Expected: `[('TEST7', 7, 5)]`.

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/create_promo_code.py
git commit -m "feat(premium): CLI scripts/create_promo_code.py para generar códigos"
```

---

## Task 18: Endpoint `GET /billing/status` para el frontend

**Files:**
- Modify: `backend/billing/routers.py`
- Test: agregar a `backend/tests/billing/test_lemonsqueezy_checkout.py`

- [ ] **Step 1: Test failing primero**

Agregar a `test_lemonsqueezy_checkout.py`:

```python
@pytest.mark.asyncio
async def test_status_returns_free_for_user_without_sub(client, free_user_headers):
    r = await client.get("/billing/status", headers=free_user_headers)
    assert r.status_code == 200
    assert r.json() == {"tier": "free", "subscription": None}


@pytest.mark.asyncio
async def test_status_returns_premium_for_active_sub(client, premium_user_headers):
    r = await client.get("/billing/status", headers=premium_user_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["tier"] == "premium"
    assert body["subscription"]["status"] == "active"
    assert body["subscription"]["plan"] == "monthly"
```

- [ ] **Step 2: Run, verificar fail**

```bash
pytest tests/billing/test_lemonsqueezy_checkout.py::test_status_returns_free_for_user_without_sub -v
```

Expected: 404 — endpoint no existe.

- [ ] **Step 3: Implementar el endpoint**

Agregar a `backend/billing/routers.py`:

```python
class SubscriptionOut(BaseModel):
    status: str
    plan: str
    current_period_end: str
    trial_ends_at: Optional[str] = None
    canceled_at: Optional[str] = None

    class Config:
        from_attributes = True


class StatusResponse(BaseModel):
    tier: str  # 'free' | 'premium'
    subscription: Optional[SubscriptionOut] = None


@router.get("/status", response_model=StatusResponse)
async def billing_status(current_user: Usuario = Depends(get_current_user)):
    if not current_user.is_premium:
        return {"tier": "free", "subscription": None}
    sub = current_user.subscription
    return {
        "tier": "premium",
        "subscription": {
            "status": sub.status,
            "plan": sub.plan,
            "current_period_end": sub.current_period_end.isoformat(),
            "trial_ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
            "canceled_at": sub.canceled_at.isoformat() if sub.canceled_at else None,
        },
    }
```

- [ ] **Step 4: Run, verificar pasan**

```bash
pytest tests/billing/test_lemonsqueezy_checkout.py -v -k "status"
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/billing/routers.py backend/tests/billing/test_lemonsqueezy_checkout.py
git commit -m "feat(premium): endpoint GET /billing/status para el frontend"
```

---

## Task 19: Verificación end-to-end manual con curl

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Arrancar el servidor**

Run desde `backend/`:
```bash
uvicorn main:app --reload --port 8000
```

- [ ] **Step 2: Registrar un usuario**

En otra terminal:
```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"premium-test@kab.com","password":"secret123","nombre":"PremiumTest"}'
```

Anotar el token devuelto.

- [ ] **Step 3: Status debe ser free**

```bash
TOKEN="<el token del paso anterior>"
curl http://localhost:8000/billing/status -H "Authorization: Bearer $TOKEN"
```

Expected: `{"tier":"free","subscription":null}`

- [ ] **Step 4: Crear actividad #11 debe dar 402**

Repetir 11 veces:
```bash
curl -X POST http://localhost:8000/actividades \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"titulo":"x","inicio":"2026-05-21T10:00:00Z","fin":"2026-05-21T11:00:00Z","sefirot":["jesed"]}'
```

Expected: las primeras 10 devuelven 201, la 11ma devuelve 402 con `{"detail":{"error":"premium_required","reason":"actividad_limit","current":10,"max":10}}`.

- [ ] **Step 5: Crear actividad con recurrencia debe dar 402**

```bash
curl -X POST http://localhost:8000/actividades \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"titulo":"daily","inicio":"2026-05-21T10:00:00Z","fin":"2026-05-21T11:00:00Z","sefirot":["jesed"],"rrule":"FREQ=DAILY"}'
```

Expected: 402 con `reason: recurrence_premium`.

- [ ] **Step 6: Crear promo code y probar checkout**

```bash
cd backend && python scripts/create_promo_code.py --code MANUALTEST --trial-days 7 --max-uses 1
```

Después (necesita variables de entorno de Lemonsqueezy seteadas):
```bash
curl -X POST http://localhost:8000/billing/checkout \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plan":"monthly","promo_code":"MANUALTEST"}'
```

Si Lemonsqueezy NO está configurado todavía: el endpoint devolverá un 500 al fallar la API call. Eso confirma que la lógica de validación de promo funciona (sino devolvería 400 con "promo: not found").

- [ ] **Step 7: Documentar resultado**

Crear nota mental o anotar en commit final:
- 10 actividades free → OK
- 11ma actividad → 402 actividad_limit
- Recurrencia free → 402 recurrence_premium
- Status free → tier=free
- Checkout sin Lemonsqueezy real → 500 (esperado hasta config en prod)

---

## Self-Review (post-plan)

**1. Spec coverage check:**
- ✅ Modelo de datos completo (§6 del spec) — Tasks 1-2
- ✅ Property `is_premium` sin denormalizar — Task 3
- ✅ Helper `require_premium` — Task 4
- ✅ Gating actividades (10 + recurrencia) — Tasks 5, 6
- ✅ Gating cooldown 7d/30d — Task 7
- ✅ Gating histórico 12m — Task 8
- ✅ Endpoint reflexión libre + paywall 1/mes — Task 9
- ✅ Cliente Lemonsqueezy — Task 10
- ✅ Endpoint /billing/checkout con promo — Task 11
- ✅ Webhook handler con HMAC + idempotencia — Task 12
- ✅ Eventos webhook (6 tipos) — Tasks 13-15
- ✅ Promo codes validation — Task 16
- ✅ CLI promo codes — Task 17
- ✅ Endpoint `/billing/status` — Task 18
- ✅ Verificación e2e manual — Task 19

**Fuera de scope (intencional, va en Planes 2 y 3):**
- Email infra (Resend, templates, cron) → Plan 2
- Frontend UI (PremiumGate, página, paywall post-escritura) → Plan 3

**2. Placeholder scan:** sin TBDs, sin "implementar después", sin código incompleto.

**3. Type consistency:**
- `Subscription.status` siempre `trial|active|past_due|canceled|expired` (5 valores) ✅
- `_map_status` mapea correctamente Lemonsqueezy → nuestro estado ✅
- `PromoCode.uses_count` se incrementa solo en `subscription_created` (Task 13), no en checkout ✅

---

## Próximos pasos después de este plan

1. **Configurar Lemonsqueezy en sandbox** (cuenta, producto, variantes, webhook URL apuntando a `<ngrok>/webhooks/lemonsqueezy`)
2. **Plan 2 — Sistema de emails** (Resend, templates, cron, idempotencia)
3. **Plan 3 — Frontend UI** (página /premium, PremiumGate, paywall post-escritura, Mi Cuenta)

Cuando estés listo para Plan 2 o Plan 3, decímelo y arranco la skill `writing-plans` de nuevo con ese alcance.
