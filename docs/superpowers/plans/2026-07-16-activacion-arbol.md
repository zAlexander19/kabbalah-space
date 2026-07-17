# Activación del Árbol — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mejorar activación/completado del Árbol de la Vida (módulo Espejo): info ampliada por sefirá, navegación libre entre preguntas, 3 correos de activación por embudo, e indicador visual de dimensiones sin clasificar.

**Architecture:** Cuatro features sobre una base existente (FastAPI async + SQLAlchemy async en `backend/`, React + TS + Vite + Tailwind + framer-motion en `frontend/`). Los correos reusan el sistema de emails (`emails/sender.py`, `scheduler/jobs.py`, `EmailLog` con idempotencia por UNIQUE). El indicador reusa `/espejo/resumen`.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, APScheduler, Resend (respx en tests), pytest-asyncio; React 18, TypeScript, Tailwind, framer-motion, lucide-react.

## Global Constraints

- **Idioma de la app (UI React):** español rioplatense (voseo) — "respondé", "guardá".
- **Idioma de los correos (templates HTML):** español **neutro, NO voseo** — "responde", "puedes". Los tests de templates asertan que `"podés"`, `"querés"`, `"preferís"` **no** aparecen. Copiar esta convención.
- **"Completar/clasificar una dimensión"** = existe `RegistroDiario` del usuario para esa sefirá con `puntuacion_ia` no nula. Misma definición en correos (F3) e indicador (F4).
- **Correos de activación:** free + premium; gateados por preferencia `activation_nudges` (default `true`); primer envío a los **2 días** de quedar trabado; reintento cada **3 días**; **tope 3 envíos** por etapa; precedencia **A → B → C** (máx. 1 correo de activación por usuario por tick).
- **Tests backend:** las tablas se crean desde `Base.metadata` en el fixture `db_session` (ver `backend/tests/conftest.py`); agregar una columna al modelo basta para los tests. La migración Alembic es solo para prod.
- **Estética emails:** usar `emails/templates/base.py::render_shell`. Estética glass/ámbar en UI.
- Commits frecuentes, uno por tarea. Rama: `feat/activacion-arbol`.

---

## File Structure

**F3 backend (correos):**
- Create `backend/alembic/versions/<autogen>_add_activation_nudges_pref.py` — migración columna.
- Modify `backend/billing/models.py` — columna `activation_nudges` en `EmailPreferences`.
- Create `backend/billing/preferences.py` — helper `get_or_create_email_preferences`.
- Modify `backend/auth.py` — crear prefs al crear usuario Google.
- Modify `backend/emails/router.py` — DTOs + lazy-create + hard-bounce pause.
- Create `backend/emails/templates/activation_no_start.py`, `activation_tree_incomplete.py`, `activation_no_activity.py`.
- Modify `backend/emails/sender.py` — `send_activation_nudge` + constantes.
- Modify `backend/scheduler/jobs.py` — `_activation_for_now` + `nightly_activation_nudge_tick`.
- Modify `backend/scheduler/scheduler.py` — registrar job.
- Create `backend/tests/emails/test_activation_nudges.py`.
- Modify `backend/tests/emails/test_email_preferences.py` — cubrir lazy-create + campo nuevo.

**F3 frontend:**
- Modify `frontend/src/premium/types.ts` — `activation_nudges`.
- Modify `frontend/src/cuenta/EmailPreferencesSection.tsx` — toggle nuevo.

**F1 (info sefirá):**
- Create `frontend/src/espejo/sefirotContent.ts` — contenido por sefirá.
- Create `frontend/src/espejo/components/SefiraInfoCard.tsx`.
- Modify `frontend/src/espejo/components/SefiraDetailPanel.tsx` y `SefiraDetailMobileSheet.tsx`.

**F2 (navegación preguntas):**
- Modify `frontend/src/espejo/components/QuestionCarousel.tsx`.
- Modify `frontend/src/espejo/components/SefiraDetailPanel.tsx`.

**F4 (indicador):**
- Modify `backend/main.py` — `SefiraResumen.clasificada`.
- Modify `frontend/src/espejo/types.ts` — `clasificada`.
- Create `frontend/src/espejo/components/ProgresoArbol.tsx`.
- Modify `frontend/src/espejo/components/SefirotInteractiveTree.tsx` — marca "sin clasificar".
- Modify `frontend/src/espejo/EspejoModule.tsx` — derivar set/contador y pasar props.

---

# PHASE 1 — F3 Backend: correos de activación

### Task 1: Columna `activation_nudges` en EmailPreferences

**Files:**
- Modify: `backend/billing/models.py:47-55`
- Create: `backend/alembic/versions/<autogen>_add_activation_nudges_pref.py`

**Interfaces:**
- Produces: `EmailPreferences.activation_nudges: bool` (server_default `"true"`).

- [ ] **Step 1: Add the column to the model**

En `backend/billing/models.py`, dentro de `class EmailPreferences`, tras `reflection_reminders`:

```python
    reflection_reminders = Column(Boolean, nullable=False, server_default="true")
    activation_nudges = Column(Boolean, nullable=False, server_default="true")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
```

- [ ] **Step 2: Generate the migration skeleton**

Run (desde `backend/`): `alembic revision -m "add activation_nudges pref"`
Esto crea un archivo en `alembic/versions/` con `revision`/`down_revision` ya seteados al head actual. Abrilo y completá `upgrade`/`downgrade`:

```python
def upgrade() -> None:
    op.add_column(
        "email_preferences",
        sa.Column("activation_nudges", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_column("email_preferences", "activation_nudges")
```

- [ ] **Step 3: Apply and verify the migration**

Run: `alembic upgrade head`
Expected: sin errores; `alembic current` muestra la nueva revisión.

- [ ] **Step 4: Commit**

```bash
git add backend/billing/models.py backend/alembic/versions/
git commit -m "feat(emails): columna activation_nudges en email_preferences"
```

---

### Task 2: Helper get-or-create de preferencias + wiring (registro, router, hard-bounce)

**Files:**
- Create: `backend/billing/preferences.py`
- Modify: `backend/auth.py:264-274` (creación de usuario Google)
- Modify: `backend/emails/router.py` (DTOs, GET/PUT lazy-create, hard-bounce)
- Test: `backend/tests/emails/test_email_preferences.py`

**Interfaces:**
- Produces: `async get_or_create_email_preferences(db: AsyncSession, usuario_id: str) -> EmailPreferences`.
- Consumes: `EmailPreferences.activation_nudges` (Task 1).

- [ ] **Step 1: Write the failing test (lazy-create for a user without prefs row)**

En `backend/tests/emails/test_email_preferences.py`, agregar:

```python
@pytest.mark.asyncio
async def test_get_or_create_creates_row_for_free_user(db_session):
    from models import Usuario
    from billing.preferences import get_or_create_email_preferences

    u = Usuario(id="free1", email="free1@x.com", nombre="Free", provider="google")
    db_session.add(u)
    await db_session.commit()

    prefs = await get_or_create_email_preferences(db_session, u.id)
    assert prefs.usuario_id == u.id
    assert prefs.activation_nudges is True
    # segunda llamada no duplica
    prefs2 = await get_or_create_email_preferences(db_session, u.id)
    assert prefs2.usuario_id == u.id
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/emails/test_email_preferences.py::test_get_or_create_creates_row_for_free_user -v`
Expected: FAIL — `ModuleNotFoundError: billing.preferences`.

- [ ] **Step 3: Create the helper**

`backend/billing/preferences.py`:

```python
"""Helper: obtener o crear la fila de EmailPreferences de un usuario.

Hoy la fila se creaba solo en el webhook de suscripción (premium). Los correos
de activación van a free + premium con toggle propio, así que todo usuario debe
tener fila. Este helper la crea on-demand con defaults (todo en True).
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from billing.models import EmailPreferences


async def get_or_create_email_preferences(db: AsyncSession, usuario_id: str) -> EmailPreferences:
    prefs = (await db.execute(
        select(EmailPreferences).where(EmailPreferences.usuario_id == usuario_id)
    )).scalars().first()
    if prefs is None:
        prefs = EmailPreferences(usuario_id=usuario_id)
        db.add(prefs)
        await db.commit()
        await db.refresh(prefs)
    return prefs
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/emails/test_email_preferences.py::test_get_or_create_creates_row_for_free_user -v`
Expected: PASS.

- [ ] **Step 5: Wire into Google user creation**

En `backend/auth.py`, tras crear el usuario (después de `await db.refresh(user)` en el bloque `user = Usuario(...)`, ~línea 273), antes de `return user`:

```python
    db.add(user)
    await db.commit()
    await db.refresh(user)
    from billing.preferences import get_or_create_email_preferences
    await get_or_create_email_preferences(db, user.id)
    return user
```

- [ ] **Step 6: Add `activation_nudges` to router DTOs + lazy-create + hard-bounce**

En `backend/emails/router.py`:

En `EmailPreferencesOut` agregá el campo:

```python
class EmailPreferencesOut(BaseModel):
    weekly_summary: bool
    monthly_summary: bool
    imbalance_alerts: bool
    reflection_reminders: bool
    activation_nudges: bool

    class Config:
        from_attributes = True
```

En `EmailPreferencesPatch` agregá:

```python
    activation_nudges: Optional[bool] = None
```

En `get_email_preferences`, reemplazá el 404 por lazy-create:

```python
@router.get("/email/preferences", response_model=EmailPreferencesOut)
async def get_email_preferences(
    current_user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from billing.preferences import get_or_create_email_preferences
    prefs = await get_or_create_email_preferences(db, current_user.id)
    return prefs
```

En `update_email_preferences`, reemplazá el 404 por lazy-create también:

```python
    from billing.preferences import get_or_create_email_preferences
    prefs = await get_or_create_email_preferences(db, current_user.id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(prefs, field, value)
    await db.commit()
    await db.refresh(prefs)
    return prefs
```

En el bloque de hard-bounce pause (dentro de `resend_webhook`), sumá la línea:

```python
                prefs.weekly_summary = False
                prefs.monthly_summary = False
                prefs.imbalance_alerts = False
                prefs.reflection_reminders = False
                prefs.activation_nudges = False
                await db.commit()
```

- [ ] **Step 7: Write the failing test for the endpoint lazy-create**

Agregá en `backend/tests/emails/test_email_preferences.py` (usá el helper de auth headers ya existente en la suite — si existe `register_user`/`normal_user_headers`, reusalo; si no, adaptá al patrón del archivo):

```python
@pytest.mark.asyncio
async def test_get_preferences_returns_row_for_free_user(async_client, normal_user_headers):
    res = await async_client.get("/email/preferences", headers=normal_user_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["activation_nudges"] is True
```

> Nota: si los fixtures del archivo se llaman distinto, alineá los nombres. El objetivo del test: un usuario free ya NO recibe 404 y ve `activation_nudges`.

- [ ] **Step 8: Run the full preferences test file**

Run: `pytest backend/tests/emails/test_email_preferences.py -v`
Expected: PASS (incluye tests preexistentes).

- [ ] **Step 9: Commit**

```bash
git add backend/billing/preferences.py backend/auth.py backend/emails/router.py backend/tests/emails/test_email_preferences.py
git commit -m "feat(emails): fila de preferencias para todo usuario (get-or-create) + activation_nudges en router"
```

---

### Task 3: Templates de los 3 correos de activación

**Files:**
- Create: `backend/emails/templates/activation_no_start.py`
- Create: `backend/emails/templates/activation_tree_incomplete.py`
- Create: `backend/emails/templates/activation_no_activity.py`
- Test: `backend/tests/emails/test_activation_nudges.py`

**Interfaces:**
- Produces:
  - `render_activation_no_start(*, nombre: str, app_url: str, preferences_url: str) -> str`
  - `render_activation_tree_incomplete(*, nombre: str, faltan: int, app_url: str, preferences_url: str) -> str`
  - `render_activation_no_activity(*, nombre: str, app_url: str, preferences_url: str) -> str`

- [ ] **Step 1: Write the failing template tests**

Create `backend/tests/emails/test_activation_nudges.py`:

```python
"""Tests de los correos de activación (embudo A→B→C)."""
import pytest
import respx
from datetime import datetime, timedelta, timezone
from httpx import Response
from sqlalchemy import select

from models import Usuario, Sefira, PreguntaSefira, RespuestaPregunta, RegistroDiario, Actividad, ActividadSefira
from emails.models import EmailLog
from emails.templates.activation_no_start import render_activation_no_start
from emails.templates.activation_tree_incomplete import render_activation_tree_incomplete
from emails.templates.activation_no_activity import render_activation_no_activity


def _assert_no_voseo(html: str):
    assert "podés" not in html and "querés" not in html and "preferís" not in html


def test_no_start_template_render():
    html = render_activation_no_start(
        nombre="Alex", app_url="https://kabbalahspace.app",
        preferences_url="https://kabbalahspace.app/cuenta",
    )
    assert "Alex" in html
    assert "kabbalahspace.app/cuenta" in html
    assert "Comenzar" in html  # CTA label
    _assert_no_voseo(html)


def test_tree_incomplete_template_render():
    html = render_activation_tree_incomplete(
        nombre="Alex", faltan=6, app_url="https://kabbalahspace.app",
        preferences_url="https://kabbalahspace.app/cuenta",
    )
    assert "Alex" in html
    assert "6" in html  # cuántas faltan
    _assert_no_voseo(html)


def test_no_activity_template_render():
    html = render_activation_no_activity(
        nombre="Alex", app_url="https://kabbalahspace.app",
        preferences_url="https://kabbalahspace.app/cuenta",
    )
    assert "Alex" in html
    assert "/calendario" in html  # CTA hacia el calendario
    _assert_no_voseo(html)
```

- [ ] **Step 2: Run to verify it fails**

Run: `pytest backend/tests/emails/test_activation_nudges.py -k template -v`
Expected: FAIL — módulos de templates no existen.

- [ ] **Step 3: Create the three templates**

`backend/emails/templates/activation_no_start.py`:

```python
"""Correo etapa A: registrado, sin ninguna dimensión respondida.
Español neutro (NO voseo). Estética Templo Digital."""
from .base import render_shell


def render_activation_no_start(*, nombre: str, app_url: str, preferences_url: str) -> str:
    body = (
        f'<p style="margin:0;">Hola {nombre},</p>'
        f'<p style="margin:14px 0 0;">Tu Árbol de la Vida está esperando el primer trazo. '
        f'Elige una dimensión y responde sus preguntas guía: la IA la clasifica y '
        f'comienza a dibujarse tu mapa interior.</p>'
        f'<p style="margin:14px 0 0;color:rgba(214,211,209,0.9);">'
        f'No hay respuestas correctas — solo tu mirada honesta sobre cada aspecto de tu vida.'
        f'</p>'
    )
    return render_shell(
        preview="Tu Árbol de la Vida está esperando",
        title="Comienza tu Árbol",
        body_html=body,
        cta_label="Comenzar ahora",
        cta_url=f"{app_url}/espejo",
        preferences_url=preferences_url,
    )
```

`backend/emails/templates/activation_tree_incomplete.py`:

```python
"""Correo etapa B: empezó pero el árbol no está completo (<10 clasificadas).
Español neutro (NO voseo)."""
from .base import render_shell


def render_activation_tree_incomplete(*, nombre: str, faltan: int, app_url: str, preferences_url: str) -> str:
    dim = "dimensión" if faltan == 1 else "dimensiones"
    body = (
        f'<p style="margin:0;">Hola {nombre},</p>'
        f'<p style="margin:14px 0 0;">Ya comenzaste a recorrer tu Árbol — '
        f'te quedan <strong style="color:#fef3c7;">{faltan} {dim}</strong> por explorar '
        f'para completar el mapa.</p>'
        f'<p style="margin:14px 0 0;color:rgba(214,211,209,0.9);">'
        f'Cada dimensión que respondes suma una pieza a la lectura que la IA hace de tu presente.'
        f'</p>'
    )
    return render_shell(
        preview="Te faltan dimensiones por completar",
        title="Completa tu Árbol",
        body_html=body,
        cta_label="Continuar",
        cta_url=f"{app_url}/espejo",
        preferences_url=preferences_url,
    )
```

`backend/emails/templates/activation_no_activity.py`:

```python
"""Correo etapa C: árbol clasificado pero sin actividades registradas.
Español neutro (NO voseo)."""
from .base import render_shell


def render_activation_no_activity(*, nombre: str, app_url: str, preferences_url: str) -> str:
    body = (
        f'<p style="margin:0;">Hola {nombre},</p>'
        f'<p style="margin:14px 0 0;">Clasificaste tus dimensiones — '
        f'ahora dales vida. Registra actividades en tu calendario y conéctalas con '
        f'las sefirot que trabajan en cada momento de tu día.</p>'
        f'<p style="margin:14px 0 0;color:rgba(214,211,209,0.9);">'
        f'Así el árbol deja de ser un retrato y se vuelve un seguimiento vivo de tu equilibrio.'
        f'</p>'
    )
    return render_shell(
        preview="Dale vida a tus dimensiones",
        title="Registra tu primera actividad",
        body_html=body,
        cta_label="Ir al calendario",
        cta_url=f"{app_url}/calendario",
        preferences_url=preferences_url,
    )
```

- [ ] **Step 4: Run template tests to verify pass**

Run: `pytest backend/tests/emails/test_activation_nudges.py -k template -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/emails/templates/activation_*.py backend/tests/emails/test_activation_nudges.py
git commit -m "feat(emails): templates de los 3 correos de activación (español neutro)"
```

---

### Task 4: `send_activation_nudge` en el sender (gating + tope + espaciado)

**Files:**
- Modify: `backend/emails/sender.py` (agregar al final + imports)
- Test: `backend/tests/emails/test_activation_nudges.py`

**Interfaces:**
- Consumes: `get_or_create_email_preferences` (Task 2), `render_activation_*` (Task 3), `_start_log`/`_finish_log_*` (existentes en sender.py), `EmailLog`.
- Produces: `async send_activation_nudge(db, *, user: Usuario, stage: str, app_url: str, now: datetime, faltan: int = 0) -> Optional[str]` con `stage ∈ {"no_start","tree_incomplete","no_activity"}`.
- Produces constantes: `ACTIVATION_FIRST_DELAY_DAYS = 2`, `ACTIVATION_RETRY_GAP_DAYS = 3`, `ACTIVATION_MAX_SENDS = 3`.

- [ ] **Step 1: Write the failing test (sender gating + cap + spacing)**

Agregá a `backend/tests/emails/test_activation_nudges.py`:

```python
@pytest.fixture
def emails_on(monkeypatch):
    from config import get_settings
    s = get_settings()
    monkeypatch.setattr(s, "resend_api_key", "test")
    monkeypatch.setattr(s, "from_email", "x@x.com")
    monkeypatch.setattr(s, "emails_enabled", True)
    return s


async def _seed_user(db, *, uid, email, signup):
    u = Usuario(id=uid, email=email, nombre="Test", provider="google", fecha_creacion=signup)
    db.add(u)
    await db.commit()
    return u


@pytest.mark.asyncio
async def test_sender_respects_pref_off(emails_on, db_session):
    from billing.preferences import get_or_create_email_preferences
    from emails.sender import send_activation_nudge
    now = datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc)
    u = await _seed_user(db_session, uid="a1", email="a1@x.com", signup=now - timedelta(days=5))
    prefs = await get_or_create_email_preferences(db_session, u.id)
    prefs.activation_nudges = False
    await db_session.commit()

    with respx.mock(base_url="https://api.resend.com", assert_all_called=False) as mock:
        route = mock.post("/emails")
        res = await send_activation_nudge(db_session, user=u, stage="no_start", app_url="https://k.app", now=now)
    assert res is None and len(route.calls) == 0


@pytest.mark.asyncio
async def test_sender_caps_at_three_sends(emails_on, db_session):
    from emails.sender import send_activation_nudge, ACTIVATION_RETRY_GAP_DAYS
    from billing.preferences import get_or_create_email_preferences
    now = datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc)
    u = await _seed_user(db_session, uid="a2", email="a2@x.com", signup=now - timedelta(days=30))
    await get_or_create_email_preferences(db_session, u.id)

    with respx.mock(base_url="https://api.resend.com") as mock:
        mock.post("/emails").mock(return_value=Response(200, json={"id": "m"}))
        t = now
        sent = 0
        for _ in range(5):
            r = await send_activation_nudge(db_session, user=u, stage="no_start", app_url="https://k.app", now=t)
            if r is not None:
                sent += 1
            t = t + timedelta(days=ACTIVATION_RETRY_GAP_DAYS)
    assert sent == 3  # tope de 3


@pytest.mark.asyncio
async def test_sender_spacing_skips_within_gap(emails_on, db_session):
    from emails.sender import send_activation_nudge
    from billing.preferences import get_or_create_email_preferences
    now = datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc)
    u = await _seed_user(db_session, uid="a3", email="a3@x.com", signup=now - timedelta(days=10))
    await get_or_create_email_preferences(db_session, u.id)

    with respx.mock(base_url="https://api.resend.com") as mock:
        mock.post("/emails").mock(return_value=Response(200, json={"id": "m"}))
        r1 = await send_activation_nudge(db_session, user=u, stage="no_start", app_url="https://k.app", now=now)
        r2 = await send_activation_nudge(db_session, user=u, stage="no_start", app_url="https://k.app", now=now + timedelta(days=1))
    assert r1 is not None and r2 is None  # el segundo cae dentro del gap de 3 días
```

- [ ] **Step 2: Run to verify it fails**

Run: `pytest backend/tests/emails/test_activation_nudges.py -k sender -v`
Expected: FAIL — `send_activation_nudge` no existe.

- [ ] **Step 3: Implement `send_activation_nudge`**

En `backend/emails/sender.py`, agregá imports arriba:

```python
from sqlalchemy import func as sql_func
from emails.templates.activation_no_start import render_activation_no_start
from emails.templates.activation_tree_incomplete import render_activation_tree_incomplete
from emails.templates.activation_no_activity import render_activation_no_activity
from billing.preferences import get_or_create_email_preferences
```

Y al final del archivo:

```python
# ---------------- ACTIVACIÓN (embudo A→B→C, free + premium) ----------------

ACTIVATION_FIRST_DELAY_DAYS = 2
ACTIVATION_RETRY_GAP_DAYS = 3
ACTIVATION_MAX_SENDS = 3

_ACTIVATION_SUBJECTS = {
    "no_start": "Tu Árbol de la Vida está esperando",
    "tree_incomplete": "Te faltan dimensiones por completar",
    "no_activity": "Dale vida a tus dimensiones",
}


async def send_activation_nudge(
    db: AsyncSession,
    *,
    user: Usuario,
    stage: str,
    app_url: str,
    now: datetime,
    faltan: int = 0,
) -> Optional[str]:
    """Nudge de activación. Gateado por preferencia `activation_nudges`.
    Tope de 3 envíos por etapa, espaciados >= ACTIVATION_RETRY_GAP_DAYS días.
    Idempotencia por (usuario, etapa, intento)."""
    prefs = await get_or_create_email_preferences(db, user.id)
    if not prefs.activation_nudges:
        return None

    email_type = f"activation_{stage}"

    # Conteo de intentos previos + último envío (para tope y espaciado).
    prior_count = (await db.execute(
        select(sql_func.count(EmailLog.id)).where(
            EmailLog.usuario_id == user.id,
            EmailLog.email_type == email_type,
        )
    )).scalar() or 0
    if prior_count >= ACTIVATION_MAX_SENDS:
        return None

    last_sent = (await db.execute(
        select(sql_func.max(EmailLog.sent_at)).where(
            EmailLog.usuario_id == user.id,
            EmailLog.email_type == email_type,
        )
    )).scalar()
    if last_sent is not None:
        if last_sent.tzinfo is None:
            last_sent = last_sent.replace(tzinfo=timezone.utc)
        if (now - last_sent) < timedelta(days=ACTIVATION_RETRY_GAP_DAYS):
            return None

    idem = f"{user.id}-{email_type}-{prior_count + 1}"
    log = await _start_log(db, usuario_id=user.id, email_type=email_type, idempotency_key=idem)
    if log is None:
        return None

    settings = get_settings()
    preferences_url = f"{app_url}/cuenta"
    if stage == "no_start":
        html = render_activation_no_start(nombre=user.nombre, app_url=app_url, preferences_url=preferences_url)
    elif stage == "tree_incomplete":
        html = render_activation_tree_incomplete(nombre=user.nombre, faltan=faltan, app_url=app_url, preferences_url=preferences_url)
    else:  # no_activity
        html = render_activation_no_activity(nombre=user.nombre, app_url=app_url, preferences_url=preferences_url)

    try:
        msg_id = await send_email(settings, to=user.email, subject=_ACTIVATION_SUBJECTS[stage], html=html)
        await _finish_log_success(db, log, msg_id)
        return msg_id
    except ResendError as e:
        await _finish_log_failure(db, log, str(e))
        raise
```

- [ ] **Step 4: Run sender tests to verify pass**

Run: `pytest backend/tests/emails/test_activation_nudges.py -k sender -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/emails/sender.py backend/tests/emails/test_activation_nudges.py
git commit -m "feat(emails): send_activation_nudge con gating, tope 3 y espaciado 3d"
```

---

### Task 5: Scheduler tick `_activation_for_now` (precedencia A→B→C) + registro del job

**Files:**
- Modify: `backend/scheduler/jobs.py` (agregar al final)
- Modify: `backend/scheduler/scheduler.py` (registrar job)
- Test: `backend/tests/emails/test_activation_nudges.py`

**Interfaces:**
- Consumes: `send_activation_nudge` (Task 4), modelos `Usuario, RespuestaPregunta, RegistroDiario, Actividad, Sefira`.
- Produces: `async _activation_for_now(db, now: datetime)`, `async nightly_activation_nudge_tick()`.
- Constante: `TOTAL_SEFIROT = 10`.

- [ ] **Step 1: Write the failing tests (stage detection + precedence)**

Agregá a `backend/tests/emails/test_activation_nudges.py` (helpers de seed + 4 tests):

```python
async def _seed_sefirot(db):
    ids = ["keter","jojma","bina","jesed","gevura","tiferet","netzaj","hod","yesod","maljut"]
    for sid in ids:
        db.add(Sefira(id=sid, nombre=sid.capitalize()))
    await db.commit()
    return ids


async def _classify(db, *, usuario_id, sefira_id, when):
    """Marca una sefirá como clasificada: RegistroDiario con puntuacion_ia."""
    db.add(RegistroDiario(
        usuario_id=usuario_id, sefira_id=sefira_id,
        puntuacion_ia=7, reflexion_texto=None, fecha_registro=when,
    ))
    # una respuesta también, para contar "empezó"
    db.add(RespuestaPregunta(
        usuario_id=usuario_id, pregunta_id=f"p-{sefira_id}",
        respuesta_texto="x", fecha_registro=when,
    ))
    await db.commit()


@pytest.mark.asyncio
async def test_stage_a_no_start_fires_after_2_days(emails_on, db_session):
    now = datetime(2026, 6, 10, 12, 0, tzinfo=timezone.utc)
    await _seed_sefirot(db_session)
    await _seed_user(db_session, uid="s1", email="s1@x.com", signup=now - timedelta(days=2))
    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails").mock(return_value=Response(200, json={"id": "m"}))
        from scheduler.jobs import _activation_for_now
        await _activation_for_now(db_session, now)
    log = (await db_session.execute(select(EmailLog).where(EmailLog.usuario_id == "s1"))).scalars().first()
    assert log is not None and log.email_type == "activation_no_start" and len(route.calls) == 1


@pytest.mark.asyncio
async def test_stage_a_skips_before_2_days(emails_on, db_session):
    now = datetime(2026, 6, 10, 12, 0, tzinfo=timezone.utc)
    await _seed_sefirot(db_session)
    await _seed_user(db_session, uid="s2", email="s2@x.com", signup=now - timedelta(hours=12))
    with respx.mock(base_url="https://api.resend.com", assert_all_called=False) as mock:
        route = mock.post("/emails")
        from scheduler.jobs import _activation_for_now
        await _activation_for_now(db_session, now)
    assert len(route.calls) == 0


@pytest.mark.asyncio
async def test_stage_b_tree_incomplete_fires_when_idle(emails_on, db_session):
    now = datetime(2026, 6, 10, 12, 0, tzinfo=timezone.utc)
    ids = await _seed_sefirot(db_session)
    await _seed_user(db_session, uid="s3", email="s3@x.com", signup=now - timedelta(days=10))
    # clasifica 4 de 10, última respuesta hace 3 días (idle)
    for sid in ids[:4]:
        await _classify(db_session, usuario_id="s3", sefira_id=sid, when=now - timedelta(days=3))
    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails").mock(return_value=Response(200, json={"id": "m"}))
        from scheduler.jobs import _activation_for_now
        await _activation_for_now(db_session, now)
    log = (await db_session.execute(select(EmailLog).where(EmailLog.usuario_id == "s3"))).scalars().first()
    assert log.email_type == "activation_tree_incomplete" and len(route.calls) == 1


@pytest.mark.asyncio
async def test_stage_c_no_activity_only_when_tree_complete(emails_on, db_session):
    now = datetime(2026, 6, 10, 12, 0, tzinfo=timezone.utc)
    ids = await _seed_sefirot(db_session)
    await _seed_user(db_session, uid="s4", email="s4@x.com", signup=now - timedelta(days=20))
    for sid in ids:  # las 10, última hace 3 días
        await _classify(db_session, usuario_id="s4", sefira_id=sid, when=now - timedelta(days=3))
    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails").mock(return_value=Response(200, json={"id": "m"}))
        from scheduler.jobs import _activation_for_now
        await _activation_for_now(db_session, now)
    log = (await db_session.execute(select(EmailLog).where(EmailLog.usuario_id == "s4"))).scalars().first()
    assert log.email_type == "activation_no_activity" and len(route.calls) == 1
```

> Nota: los nombres exactos de columnas de `RegistroDiario` (`puntuacion_ia`, `reflexion_texto`, `fecha_registro`, `sefira_id`, `usuario_id`) y `RespuestaPregunta` (`pregunta_id`, `respuesta_texto`, `fecha_registro`, `usuario_id`) se validan al correr; ajustá si el modelo difiere.

- [ ] **Step 2: Run to verify it fails**

Run: `pytest backend/tests/emails/test_activation_nudges.py -k stage -v`
Expected: FAIL — `_activation_for_now` no existe.

- [ ] **Step 3: Implement the scheduler tick**

En `backend/scheduler/jobs.py`, al final:

```python
# ---------------- ACTIVACIÓN (embudo A→B→C, free + premium) ----------------

TOTAL_SEFIROT = 10


async def nightly_activation_nudge_tick():
    settings = get_settings()
    if not settings.emails_enabled:
        return
    from database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        await _activation_for_now(db, _now_utc())


async def _activation_for_now(db: AsyncSession, now: datetime):
    """Para cada usuario, determina su etapa del embudo por precedencia A→B→C y
    envía como mucho un correo de activación. El tope/espaciado lo aplica el sender.

    - A (no_start): 0 respuestas y signup >= 2 días.
    - B (tree_incomplete): >=1 respuesta, <10 sefirot clasificadas, sin nueva
      respuesta en >= 2 días.
    - C (no_activity): 10 sefirot clasificadas, 0 actividades, sin nueva
      respuesta en >= 2 días.
    """
    from models import Usuario, RespuestaPregunta, RegistroDiario, Actividad
    from emails.sender import send_activation_nudge, ACTIVATION_FIRST_DELAY_DAYS

    def _days_since(dt: Optional[datetime]) -> Optional[float]:
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (now - dt).total_seconds() / 86400.0

    users = (await db.execute(select(Usuario))).scalars().all()

    for user in users:
        signup_days = _days_since(user.fecha_creacion)
        if signup_days is None or signup_days < ACTIVATION_FIRST_DELAY_DAYS:
            continue

        total_respuestas = (await db.execute(
            select(sql_func.count(RespuestaPregunta.id)).where(
                RespuestaPregunta.usuario_id == user.id
            )
        )).scalar() or 0

        # ---- Etapa A ----
        if total_respuestas == 0:
            try:
                await send_activation_nudge(db, user=user, stage="no_start", app_url=_get_app_url(), now=now)
            except Exception as e:
                logger.warning("activation no_start failed for usuario_id=%s: %s", user.id, e)
            continue

        # idle: días desde la última respuesta
        last_resp = (await db.execute(
            select(sql_func.max(RespuestaPregunta.fecha_registro)).where(
                RespuestaPregunta.usuario_id == user.id
            )
        )).scalar()
        idle_days = _days_since(last_resp)
        if idle_days is None or idle_days < ACTIVATION_FIRST_DELAY_DAYS:
            continue  # todavía activo respondiendo — no molestar

        # sefirot clasificadas (RegistroDiario con puntuacion_ia)
        clasificadas = (await db.execute(
            select(sql_func.count(sql_func.distinct(RegistroDiario.sefira_id))).where(
                RegistroDiario.usuario_id == user.id,
                RegistroDiario.puntuacion_ia.is_not(None),
            )
        )).scalar() or 0

        # ---- Etapa B ----
        if clasificadas < TOTAL_SEFIROT:
            faltan = TOTAL_SEFIROT - int(clasificadas)
            try:
                await send_activation_nudge(db, user=user, stage="tree_incomplete", app_url=_get_app_url(), now=now, faltan=faltan)
            except Exception as e:
                logger.warning("activation tree_incomplete failed for usuario_id=%s: %s", user.id, e)
            continue

        # ---- Etapa C ----
        total_actividades = (await db.execute(
            select(sql_func.count(Actividad.id)).where(Actividad.usuario_id == user.id)
        )).scalar() or 0
        if total_actividades == 0:
            try:
                await send_activation_nudge(db, user=user, stage="no_activity", app_url=_get_app_url(), now=now)
            except Exception as e:
                logger.warning("activation no_activity failed for usuario_id=%s: %s", user.id, e)
            continue
```

- [ ] **Step 4: Register the job in the scheduler**

En `backend/scheduler/scheduler.py`, agregá al import lazy de jobs:

```python
    from scheduler.jobs import (
        hourly_weekly_summary_tick,
        hourly_monthly_summary_tick,
        nightly_imbalance_tick,
        nightly_reminder_tick,
        hourly_gcal_link_suggestion_tick,
        hourly_evolucion_nudge_tick,
        nightly_activation_nudge_tick,
    )
```

Y registrá el job (nightly, granularidad diaria alcanza para thresholds de 2-3 días):

```python
    sched.add_job(nightly_activation_nudge_tick, CronTrigger(hour=3, minute=30), id="activation_nudge_tick", replace_existing=True)
    sched.start()
    logger.info("scheduler started with 7 jobs")
```

- [ ] **Step 5: Run the stage tests to verify pass**

Run: `pytest backend/tests/emails/test_activation_nudges.py -k stage -v`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full activation + scheduler + preferences suite**

Run: `pytest backend/tests/emails/ -v`
Expected: PASS (incluye tests preexistentes de emails).

- [ ] **Step 7: Commit**

```bash
git add backend/scheduler/jobs.py backend/scheduler/scheduler.py backend/tests/emails/test_activation_nudges.py
git commit -m "feat(emails): tick nocturno de activación con precedencia A→B→C"
```

---

# PHASE 2 — F3 Frontend: toggle en /cuenta

### Task 6: Toggle "Recordatorios de activación" en preferencias

**Files:**
- Modify: `frontend/src/premium/types.ts:73-80`
- Modify: `frontend/src/cuenta/EmailPreferencesSection.tsx:52-63`

**Interfaces:**
- Consumes: `activation_nudges` del endpoint `/email/preferences` (Task 2).

- [ ] **Step 1: Add `activation_nudges` to the frontend type**

En `frontend/src/premium/types.ts`, dentro de `interface EmailPreferences`:

```typescript
export interface EmailPreferences {
  weekly_summary: boolean;
  monthly_summary: boolean;
  imbalance_alerts: boolean;
  reflection_reminders: boolean;
  activation_nudges: boolean;
}
```

- [ ] **Step 2: Add the toggle entry**

En `frontend/src/cuenta/EmailPreferencesSection.tsx`, agregá al final del array `TOGGLES`:

```typescript
  {
    key: 'reflection_reminders',
    label: 'Recordatorios de reflexión',
    description: 'Si pasaste 7 días sin entrar, una pregunta guía te espera.',
  },
  {
    key: 'activation_nudges',
    label: 'Recordatorios de activación',
    description: 'Mientras completás el árbol, te recordamos por dónde seguir.',
  },
];
```

- [ ] **Step 3: Verify the frontend builds**

Run (desde `frontend/`): `npm run build`
Expected: build sin errores de TypeScript.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/premium/types.ts frontend/src/cuenta/EmailPreferencesSection.tsx
git commit -m "feat(cuenta): toggle 'Recordatorios de activación' en preferencias de correo"
```

---

# PHASE 3 — F1: Info ampliada de cada sefirá

### Task 7: Archivo de contenido `sefirotContent.ts`

**Files:**
- Create: `frontend/src/espejo/sefirotContent.ts`

**Interfaces:**
- Produces: `type SefiraContenido = { esencia: string; palabrasClave: string[]; queObserva: string }` y `export const SEFIROT_CONTENIDO: Record<string, SefiraContenido>` con las 10 entradas (ids: `keter, jojma, bina, jesed, gevura, tiferet, netzaj, hod, yesod, maljut`).

- [ ] **Step 1: Create the content file (10 entries, revisables por el usuario)**

`frontend/src/espejo/sefirotContent.ts`:

```typescript
export type SefiraContenido = {
  /** 2-3 frases que expanden la descripción corta. */
  esencia: string;
  /** Etiquetas cortas (2-4) que evocan la dimensión. */
  palabrasClave: string[];
  /** Qué invita a mirar de tu vida esta dimensión. */
  queObserva: string;
};

// Contenido inicial redactado (rioplatense). Reemplazable cuando el usuario
// entregue sus textos definitivos — es la única fuente de este contenido.
export const SEFIROT_CONTENIDO: Record<string, SefiraContenido> = {
  keter: {
    esencia:
      'La Corona: la voluntad primigenia, anterior a toda forma. El punto donde tu deseo más profundo todavía no tiene nombre, pero ya empuja.',
    palabrasClave: ['Voluntad', 'Propósito', 'Origen'],
    queObserva:
      'Mirá qué te mueve de raíz: eso que querés antes de saber por qué. La dirección que tu vida toma cuando nadie te está mirando.',
  },
  jojma: {
    esencia:
      'La Sabiduría: el destello, la intuición que llega antes del razonamiento. La chispa que abre una posibilidad nueva.',
    palabrasClave: ['Intuición', 'Chispa', 'Visión'],
    queObserva:
      'Prestá atención a tus insights repentinos y a cuánto confiás en ellos. Cómo aparece lo nuevo en vos antes de que lo entiendas.',
  },
  bina: {
    esencia:
      'El Entendimiento: la vasija que da estructura a la chispa. Donde la intuición se vuelve idea comprensible y forma.',
    palabrasClave: ['Comprensión', 'Estructura', 'Reflexión'],
    queObserva:
      'Observá cómo procesás y ordenás lo que sentís. Tu capacidad de darle forma y sentido a lo que todavía es difuso.',
  },
  jesed: {
    esencia:
      'La Misericordia: la generosidad que se expande, el amor que da sin medir. El impulso de abrirte hacia los demás.',
    palabrasClave: ['Amor', 'Generosidad', 'Entrega'],
    queObserva:
      'Mirá cómo das y hasta dónde. Tu apertura hacia los otros y el equilibrio entre entregar y entregarte de más.',
  },
  gevura: {
    esencia:
      'La Severidad: el rigor, el límite, el juicio que contiene. La fuerza que dice "hasta acá" y sostiene la forma.',
    palabrasClave: ['Límite', 'Disciplina', 'Fuerza'],
    queObserva:
      'Observá tus límites y tu disciplina. Dónde ponés freno, cómo te sostenés y si tu rigor cuida o aprieta demasiado.',
  },
  tiferet: {
    esencia:
      'La Belleza: el equilibrio entre dar y contener, el corazón del árbol. La armonía que integra la misericordia y la severidad.',
    palabrasClave: ['Equilibrio', 'Armonía', 'Corazón'],
    queObserva:
      'Mirá tu centro: cómo balanceás lo que das y lo que retenés. La coherencia entre lo que sentís, pensás y hacés.',
  },
  netzaj: {
    esencia:
      'La Victoria: la perseverancia, el impulso que insiste. La fuerza que sostiene el deseo en el tiempo y no afloja.',
    palabrasClave: ['Perseverancia', 'Impulso', 'Pasión'],
    queObserva:
      'Observá tu constancia frente a lo que querés. Cómo sostenés el esfuerzo cuando la motivación inicial ya pasó.',
  },
  hod: {
    esencia:
      'El Esplendor: la inteligencia práctica, la palabra y la forma. Donde la idea se organiza para poder comunicarse y concretarse.',
    palabrasClave: ['Comunicación', 'Método', 'Detalle'],
    queObserva:
      'Mirá cómo comunicás y ordenás lo cotidiano. Tu relación con los detalles, la palabra justa y los métodos que usás.',
  },
  yesod: {
    esencia:
      'El Fundamento: la imaginación y el motor psíquico, el puente entre lo interno y lo que se manifiesta. Tu mundo íntimo en movimiento.',
    palabrasClave: ['Imaginación', 'Vínculo', 'Cimiento'],
    queObserva:
      'Observá tu mundo interior y cómo conecta con el afuera. Tus vínculos, tu sexualidad, la base sobre la que apoyás todo.',
  },
  maljut: {
    esencia:
      'El Reino: la acción física, el mundo material, lo concreto. Donde todo lo anterior finalmente se vuelve realidad tangible.',
    palabrasClave: ['Acción', 'Cuerpo', 'Presencia'],
    queObserva:
      'Mirá cómo habitás lo material y lo cotidiano. Tu cuerpo, tu casa, tu dinero, y qué de vos se hace realmente presente en el mundo.',
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/espejo/sefirotContent.ts
git commit -m "feat(espejo): contenido ampliado por sefirá (archivo aislado, revisable)"
```

---

### Task 8: Componente `SefiraInfoCard` + inserción en panel y sheet

**Files:**
- Create: `frontend/src/espejo/components/SefiraInfoCard.tsx`
- Modify: `frontend/src/espejo/components/SefiraDetailPanel.tsx` (insertar tras `SefiraHeader`)
- Modify: `frontend/src/espejo/components/SefiraDetailMobileSheet.tsx`

**Interfaces:**
- Consumes: `SEFIROT_CONTENIDO` (Task 7).
- Produces: `<SefiraInfoCard sefiraId={string} />` — no renderiza nada si no hay entrada.

- [ ] **Step 1: Create the component**

`frontend/src/espejo/components/SefiraInfoCard.tsx`:

```typescript
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { SEFIROT_CONTENIDO } from '../sefirotContent';

type Props = { sefiraId: string };

const ease = [0.16, 1, 0.3, 1] as const;

export default function SefiraInfoCard({ sefiraId }: Props) {
  const contenido = SEFIROT_CONTENIDO[sefiraId];
  const [open, setOpen] = useState(true);
  if (!contenido) return null;

  return (
    <div className="rounded-2xl border border-stone-700/40 bg-stone-950/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="text-xs uppercase tracking-[0.16em] text-stone-400">
          Sobre esta dimensión
        </span>
        <ChevronDown
          size={16}
          className={`text-stone-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease }}
          >
            <div className="px-4 pb-4 space-y-3">
              <p className="text-sm text-stone-300/90 leading-relaxed">{contenido.esencia}</p>
              <div className="flex flex-wrap gap-1.5">
                {contenido.palabrasClave.map((k) => (
                  <span
                    key={k}
                    className="px-2 py-0.5 rounded-full bg-amber-300/10 border border-amber-300/25 text-amber-100/90 text-[10px] tracking-wide"
                  >
                    {k}
                  </span>
                ))}
              </div>
              <div className="pt-1">
                <p className="text-[10px] uppercase tracking-[0.16em] text-stone-500 mb-1">
                  Qué observar
                </p>
                <p className="text-sm text-stone-300/80 leading-relaxed">{contenido.queObserva}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Insert into the desktop panel**

En `frontend/src/espejo/components/SefiraDetailPanel.tsx`, importá y agregá una `Section` tras el header:

```typescript
import SefiraInfoCard from './SefiraInfoCard';
```

```tsx
      <Section><SefiraHeader resumen={resumen} description={description} registros={registros} /></Section>

      <Section><SefiraInfoCard sefiraId={resumen.sefira_id} /></Section>

      <Section>
        <div className="flex items-baseline justify-between mb-3">
```

- [ ] **Step 3: Insert into the mobile sheet**

Abrí `frontend/src/espejo/components/SefiraDetailMobileSheet.tsx`, importá `SefiraInfoCard` y renderizalo entre el header/descr y la sección de preguntas (mismo lugar lógico que en el panel — usá `resumen.sefira_id`). Mantené el estilo de secciones del sheet.

- [ ] **Step 4: Verify the build**

Run (desde `frontend/`): `npm run build`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/espejo/components/SefiraInfoCard.tsx frontend/src/espejo/components/SefiraDetailPanel.tsx frontend/src/espejo/components/SefiraDetailMobileSheet.tsx
git commit -m "feat(espejo): card 'Sobre esta dimensión' antes de las preguntas (desktop + mobile)"
```

---

# PHASE 4 — F2: Navegación libre por las preguntas

### Task 9: Carrusel — navegación libre + lectura de respondidas/cooldown + guardar desacoplado

**Files:**
- Modify: `frontend/src/espejo/components/QuestionCarousel.tsx`
- Modify: `frontend/src/espejo/components/SefiraDetailPanel.tsx` (rama de render)

**Interfaces:**
- Consumes: `PreguntaConEstado` (con `bloqueada`, `ultima_respuesta`, `dias_restantes`).
- Contrato de save sin cambios: `onBatchSave(answers: Record<string,string>)`.

- [ ] **Step 1: Include all questions and free navigation**

En `QuestionCarousel.tsx`, cambiá el universo de items para incluir todas las preguntas (no solo no bloqueadas):

```typescript
  // Todas las preguntas entran al carrusel (disponibles + respondidas/cooldown).
  // Las bloqueadas se muestran en modo lectura.
  const items = useMemo(() => preguntas, [preguntas]);
```

Y permití navegar libremente (quitá el gate `canAdvance` de `goNext`):

```typescript
  function goPrev() {
    if (index > 0) setIndex((i) => i - 1);
  }
  function goNext() {
    if (!isLast) setIndex((i) => i + 1);
  }
```

- [ ] **Step 2: Read-only mode for blocked/answered questions**

En el render de la card, distinguí pregunta disponible vs. lectura. Reemplazá el bloque del textarea por:

```tsx
            <p className="text-sm text-stone-200 leading-relaxed mb-3">
              {current.texto_pregunta}
            </p>
            {current.bloqueada ? (
              <div className="flex-1 min-h-[100px] rounded-lg border border-stone-700/40 bg-[#1b1f25]/60 px-3 py-2 space-y-2">
                {current.ultima_respuesta ? (
                  <p className="text-sm text-stone-300/80 leading-relaxed whitespace-pre-wrap">
                    {current.ultima_respuesta}
                  </p>
                ) : (
                  <p className="text-sm text-stone-500 italic">Sin respuesta registrada.</p>
                )}
                <span className="inline-block text-[10px] uppercase tracking-[0.14em] text-amber-200/70">
                  Respondida{current.dias_restantes ? ` · vuelve en ${current.dias_restantes} ${current.dias_restantes === 1 ? 'día' : 'días'}` : ''}
                </span>
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                value={currentText}
                onChange={(e) => setText(e.target.value)}
                placeholder="Escribí tu reflexión..."
                disabled={saving}
                className="flex-1 min-h-[100px] resize-y bg-[#1b1f25] border border-stone-700/50 focus:border-amber-300/60 focus:outline-none text-sm text-stone-100 rounded-lg px-3 py-2 transition-colors disabled:opacity-60"
              />
            )}
```

Ajustá el autofocus para que no intente enfocar cuando la card es de lectura:

```typescript
  useEffect(() => {
    if (current?.bloqueada) return;
    const t = window.setTimeout(() => textareaRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [index, current?.bloqueada]);
```

> `current` se define más abajo; movés el cálculo de `current`/`currentText`/`isLast` arriba de este `useEffect`, o duplicás la guarda con `items[Math.min(index, items.length - 1)]?.bloqueada`. Mantené el orden de hooks estable (sin returns tempranos antes de los hooks).

- [ ] **Step 3: Decouple the Save button from "last card"**

Reemplazá el footer de acciones. El botón Guardar aparece cuando hay ≥1 respuesta nueva no vacía, sin importar el índice; Siguiente sigue disponible en cards no-última:

```tsx
      {/* Footer / actions */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={goPrev}
          disabled={index === 0 || saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-stone-400 hover:text-amber-200 hover:bg-stone-900/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs tracking-wide"
        >
          <ChevronLeft size={14} />
          Anterior
        </button>

        <div className="flex items-center gap-2">
          {hasNewAnswers && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-300/15 hover:bg-amber-300/25 border border-amber-300/30 text-amber-100 text-sm tracking-wide disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-[0_0_14px_rgba(233,195,73,0.15)]"
            >
              <Save size={14} />
              {saving ? 'Guardando…' : 'Guardar respuestas'}
            </button>
          )}
          {!isLast && (
            <button
              type="button"
              onClick={goNext}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900/70 hover:bg-stone-900 border border-stone-800/60 hover:border-amber-300/30 text-stone-200 hover:text-amber-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs tracking-wide"
            >
              Siguiente
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
```

Definí `hasNewAnswers` junto a los otros derivados (tras `const current = ...`):

```typescript
  const hasNewAnswers = Object.values(answers).some((t) => t.trim().length > 0);
```

- [ ] **Step 4: Update the progress counter to count answered**

El header "Pregunta X de N" ya usa `items.length` (ahora total). Dejá el contador de "respondidas" como está (`Object.values(answers).filter(...)`). Verificá que `progress` use `items.length` (total).

- [ ] **Step 5: Always render the carousel in the panel**

En `SefiraDetailPanel.tsx`, simplificá la rama para renderizar siempre el carrusel cuando hay preguntas (el carrusel maneja el estado mixto). Reemplazá:

```tsx
        {preguntas.length === 0 ? (
          <p className="text-xs text-stone-500 italic text-center py-4">
            No hay preguntas guía para esta sefirá. Agregá algunas desde el Panel de Administrador.
          </p>
        ) : (
          <QuestionCarousel sefiraId={resumen.sefira_id} preguntas={preguntas} onBatchSave={handleBatchSave} />
        )}
```

(Se retira el uso de `AllAnsweredEmptyState` en la rama; podés dejar la función sin usar o eliminarla. El auto-open del `AnswersGridModal` cuando todo está respondido se conserva.)

- [ ] **Step 6: Verify the build + manual smoke**

Run (desde `frontend/`): `npm run build`
Expected: sin errores TypeScript.
Manual (con `npm run dev`): abrir una sefirá, moverse con Anterior/Siguiente sin responder; verificar cards de lectura para respondidas; escribir una respuesta nueva y ver aparecer "Guardar respuestas".

- [ ] **Step 7: Commit**

```bash
git add frontend/src/espejo/components/QuestionCarousel.tsx frontend/src/espejo/components/SefiraDetailPanel.tsx
git commit -m "feat(espejo): navegación libre por preguntas + lectura de respondidas/cooldown"
```

---

# PHASE 5 — F4: Indicador de dimensiones sin clasificar

### Task 10: Campo `clasificada` en `/espejo/resumen`

**Files:**
- Modify: `backend/main.py:536-548` (modelo `SefiraResumen`)
- Modify: `backend/main.py:795-826` (cómputo + construcción)
- Test: `backend/tests/` (archivo de tests del resumen, o crear `backend/tests/test_espejo_resumen.py`)

**Interfaces:**
- Produces: `SefiraResumen.clasificada: bool` (`True` si la sefirá tiene ≥1 `RegistroDiario` con `puntuacion_ia`).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_espejo_resumen.py` (adaptá fixtures de auth a los del repo — mirá cómo otros tests obtienen `async_client` + headers autenticados):

```python
import pytest
from datetime import datetime, timezone


@pytest.mark.asyncio
async def test_resumen_marks_clasificada_true_when_ia_score_exists(async_client, seeded_user_headers, db_session):
    from models import Sefira, RegistroDiario
    # asumiendo que hay al menos una sefirá 'keter' seedeada por conftest;
    # si no, seedéala aquí.
    db_session.add(RegistroDiario(
        usuario_id="<uid del header>", sefira_id="keter",
        puntuacion_ia=8, reflexion_texto=None, fecha_registro=datetime.now(timezone.utc),
    ))
    await db_session.commit()

    res = await async_client.get("/espejo/resumen", headers=seeded_user_headers)
    assert res.status_code == 200
    data = {r["sefira_id"]: r for r in res.json()}
    assert data["keter"]["clasificada"] is True
```

> Ajustá el nombre del fixture de usuario/headers y el `usuario_id` al patrón real del repo (reusá el helper `register_user`/headers de la suite de emails si aplica).

- [ ] **Step 2: Run to verify it fails**

Run: `pytest backend/tests/test_espejo_resumen.py -v`
Expected: FAIL — `KeyError: 'clasificada'`.

- [ ] **Step 3: Add the field to the model**

En `backend/main.py`, en `class SefiraResumen`:

```python
    intensidad: float = 0.0
    actividades_total: int = 0
    clasificada: bool = False
```

- [ ] **Step 4: Compute and set it**

En `espejo_resumen`, `ia_scores` ya existe. En el `out.append(SefiraResumen(...))` agregá:

```python
        out.append(SefiraResumen(
            sefira_id=s.id, sefira_nombre=s.nombre,
            preguntas_total=total, preguntas_frescas=frescas, preguntas_disponibles=disponibles,
            score_ia_promedio=score_promedio,
            score_ia_ultimos=ultimos,
            ultima_reflexion_texto=ultima.reflexion_texto if ultima else None,
            ultima_reflexion_score=ultima.puntuacion_ia if ultima else None,
            ultima_actividad=ultima.fecha_registro if ultima else None,
            intensidad=intensidad,
            actividades_total=actividades_total,
            clasificada=len(ia_scores) > 0,
        ))
```

- [ ] **Step 5: Run to verify pass**

Run: `pytest backend/tests/test_espejo_resumen.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/tests/test_espejo_resumen.py
git commit -m "feat(espejo): campo 'clasificada' en /espejo/resumen"
```

---

### Task 11: Marca "sin clasificar" en el árbol + contador de progreso

**Files:**
- Modify: `frontend/src/espejo/types.ts:1-14` (agregar `clasificada`)
- Create: `frontend/src/espejo/components/ProgresoArbol.tsx`
- Modify: `frontend/src/espejo/components/SefirotInteractiveTree.tsx` (prop + marca)
- Modify: `frontend/src/espejo/EspejoModule.tsx` (derivar set/contador, pasar props, montar contador)

**Interfaces:**
- Consumes: `SefiraResumen.clasificada` (Task 10).
- Produces: `<SefirotInteractiveTree ... clasificadas={Set<string>} />`, `<ProgresoArbol total={10} completadas={number} />`.

- [ ] **Step 1: Add `clasificada` to the frontend type**

En `frontend/src/espejo/types.ts`, en `type SefiraResumen`:

```typescript
  intensidad: number;
  actividades_total: number;
  clasificada: boolean;
};
```

- [ ] **Step 2: Create the progress component**

`frontend/src/espejo/components/ProgresoArbol.tsx`:

```typescript
import { motion } from 'framer-motion';

type Props = { total: number; completadas: number };

export default function ProgresoArbol({ total, completadas }: Props) {
  const pct = total > 0 ? (completadas / total) * 100 : 0;
  const done = completadas >= total && total > 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] uppercase tracking-[0.16em] text-stone-400 whitespace-nowrap">
        {done ? '¡Árbol completo!' : `${completadas} de ${total} dimensiones exploradas`}
      </span>
      <div className="h-[3px] w-28 bg-stone-800/60 rounded-full overflow-hidden">
        <motion.div
          className={`h-full ${done ? 'bg-amber-300' : 'bg-amber-300/70'}`}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the "unclassified" marker to the tree**

En `SefirotInteractiveTree.tsx`, agregá la prop:

```typescript
type Props = {
  sefirot: SefiraNode[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  clasificadas?: Set<string>;
};

export default function SefirotInteractiveTree({ sefirot, selectedId, onSelect, clasificadas }: Props) {
```

Dentro del `.map(node => {...})`, tras calcular `isSelected`/`isOther`, calculá:

```typescript
          const sinClasificar = clasificadas !== undefined && !clasificadas.has(node.id);
```

Y dentro del `<motion.g>` del nodo, tras el "Main circle" (antes o después de la selection ring), agregá un anillo punteado sutil que pulsa solo en las no clasificadas y cuando no está seleccionada:

```tsx
                {sinClasificar && !isSelected && (
                  <motion.circle
                    cx={0} cy={0}
                    r={NODE_R + 5}
                    fill="none"
                    stroke="rgba(253, 230, 138, 0.55)"
                    strokeWidth={1.4}
                    strokeDasharray="3 5"
                    initial={{ opacity: 0.25 }}
                    animate={reduced ? { opacity: 0.4 } : { opacity: [0.2, 0.6, 0.2] }}
                    transition={reduced ? { duration: 0.4 } : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ transformOrigin: '0px 0px', pointerEvents: 'none' }}
                  />
                )}
```

- [ ] **Step 4: Derive and pass props from EspejoModule**

En `EspejoModule.tsx`, tras obtener `summary`, derivá el set y el contador:

```typescript
  const clasificadas = useMemo(
    () => new Set(summary.filter((s) => s.clasificada).map((s) => s.sefira_id)),
    [summary],
  );
```

Pasá la prop al árbol:

```tsx
            <SefirotInteractiveTree
              sefirot={sefirot}
              selectedId={selectedId}
              onSelect={setSelectedId}
              clasificadas={clasificadas.size > 0 ? clasificadas : undefined}
            />
```

Y montá el contador en la barra superior. Reemplazá el `<div className="flex justify-end">` que envuelve el botón "Nueva reflexión libre" por un contenedor con el progreso a la izquierda:

```tsx
      <div className="flex items-center justify-between gap-4">
        {clasificadas.size > 0 ? (
          <ProgresoArbol total={sefirot.length} completadas={clasificadas.size} />
        ) : <span />}
        <button
          type="button"
          onClick={() => setLibreEditorOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-300/10 hover:bg-amber-300/20 border border-amber-300/30 text-amber-100 text-xs tracking-wide transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">edit_note</span>
          Nueva reflexión libre
        </button>
      </div>
```

Agregá el import: `import ProgresoArbol from './components/ProgresoArbol';`

- [ ] **Step 5: Verify the build + manual smoke**

Run (desde `frontend/`): `npm run build`
Expected: sin errores.
Manual: usuario sin clasificar ve anillos punteados en todas; al clasificar una, esa deja de tener anillo y el contador sube.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/espejo/types.ts frontend/src/espejo/components/ProgresoArbol.tsx frontend/src/espejo/components/SefirotInteractiveTree.tsx frontend/src/espejo/EspejoModule.tsx
git commit -m "feat(espejo): indicador de dimensiones sin clasificar + contador X de 10"
```

---

# PHASE 6 — Cierre

### Task 12: Verificación integral + grafo

**Files:** —

- [ ] **Step 1: Full backend test suite**

Run (desde `backend/`): `pytest -q`
Expected: PASS (sin regresiones).

- [ ] **Step 2: Frontend build**

Run (desde `frontend/`): `npm run build`
Expected: sin errores.

- [ ] **Step 3: Update the knowledge graph**

Run (desde raíz): `graphify update .`
Expected: grafo actualizado (AST-only, sin costo API).

- [ ] **Step 4: Commit graph refresh (si cambió)**

```bash
git add graphify-out/
git commit -m "chore(graphify): update graph tras activación del árbol"
```

---

## Self-Review

**1. Spec coverage:**
- F1 info ampliada → Tasks 7, 8. ✓
- F2 navegación libre + lectura → Task 9. ✓
- F3 correos (embudo A→B→C, cadencia/tope, free+premium, toggle, prefs para todos, hard-bounce) → Tasks 1-6. ✓
- F4 indicador sobre el árbol (campo `clasificada`, marca, contador) → Tasks 10, 11. ✓
- Verificación + grafo → Task 12. ✓

**2. Placeholder scan:** Todas las tareas de código llevan código real. Los puntos "ajustá al fixture del repo" (Tasks 2, 5, 10) son notas de alineación de nombres de fixtures preexistentes, no lógica faltante — el test y la aserción están completos.

**3. Type consistency:**
- `send_activation_nudge(stage, now, faltan)` — firma idéntica en sender (Task 4) y llamadas del scheduler (Task 5). ✓
- `email_type = f"activation_{stage}"` consistente entre sender e idempotencia. ✓
- `activation_nudges` — modelo (T1), helper/router/DTO (T2), sender (T4), frontend type + toggle (T6). ✓
- `clasificada` — pydantic (T10) ↔ TS type (T11) ↔ `SEFIROT_CONTENIDO`/`clasificadas` set. ✓
- `SEFIROT_CONTENIDO` keys ↔ `SefiraInfoCard` lookup por `resumen.sefira_id`. ✓
