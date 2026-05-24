# Sistema Premium — Plan 2: Sistema de Emails

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el sistema de seguimiento por correo para usuarios premium — Resend como proveedor, 4 templates (resumen semanal, mensual, alertas de desbalance, recordatorios de reflexión), idempotencia por usuario+período, cron jobs con APScheduler, tracking de bounces, endpoints de preferencias y UI en Mi cuenta.

**Architecture:** Módulo nuevo `backend/email/` autónomo (cliente Resend + templates HTML + orquestador + endpoints). Módulo nuevo `backend/scheduler/` con APScheduler integrado al lifespan de FastAPI. Idempotencia via UNIQUE(usuario_id, email_type, periodo) en una nueva tabla `email_log`. Templates HTML construidos como strings Python (sin React Email — no requiere Node tooling). Para Fase 2 (cuando IA esté lista), un hook `generate_insight()` se conecta al motor; por ahora retorna `None` y los templates caen a una plantilla genérica con datos crudos.

**Tech Stack:** Python 3.11 + FastAPI async + SQLAlchemy async + Alembic + httpx (cliente Resend) + APScheduler + zoneinfo (timezone-aware envíos) + pytest-asyncio.

**Spec de referencia:** [docs/superpowers/specs/2026-05-21-sistema-premium-design.md](../specs/2026-05-21-sistema-premium-design.md) — sección 10 (Sistema de emails).

**Plan 2 de 3.** Plan 1 (backend core) ✅ shipped. Plan 3 (frontend UI premium) ✅ shipped. Este plan no depende de Plan 3; solo agrega un sector pequeño a `CuentaPage.tsx`.

**Cosas que ya existen del Plan 1:**
- Tabla `email_preferences` con 4 booleans + `updated_at` (creada y poblada al `subscription_created`)
- Tabla `webhook_events` (reusable para deduplicar webhooks de Resend)
- Columna `timezone` en `usuarios` (para cron timezone-aware)

**Cosas que NO existen y se crean acá:**
- Tabla `email_log` (tracking de envíos: idempotency + status)
- Módulo `backend/email/`
- Módulo `backend/scheduler/`
- Endpoints `/email/preferences` y `/webhooks/resend`
- Sección `EmailPreferencesSection` en `CuentaPage.tsx`

---

## File Structure

### Archivos nuevos (backend)
- `backend/email/__init__.py` — paquete
- `backend/email/models.py` — `EmailLog` SQLAlchemy model
- `backend/email/client.py` — wrapper HTTP de Resend
- `backend/email/templates/__init__.py`
- `backend/email/templates/base.py` — HTML shell común (header + footer + styling Templo Digital)
- `backend/email/templates/weekly_summary.py`
- `backend/email/templates/monthly_summary.py`
- `backend/email/templates/imbalance_alert.py`
- `backend/email/templates/reflection_reminder.py`
- `backend/email/insight.py` — hook opcional para IA generativa (Fase 2)
- `backend/email/sender.py` — orquestador high-level: idempotency check + preferencias + render + send + log
- `backend/email/router.py` — endpoints `/email/preferences` GET/PUT y `/webhooks/resend`
- `backend/scheduler/__init__.py`
- `backend/scheduler/scheduler.py` — APScheduler setup
- `backend/scheduler/jobs.py` — 4 cron functions (weekly, monthly, imbalance, reminder)
- `backend/alembic/versions/<hash>_email_log.py` — migración
- `backend/tests/email/__init__.py`
- `backend/tests/email/test_models.py`
- `backend/tests/email/test_client.py`
- `backend/tests/email/test_templates.py`
- `backend/tests/email/test_sender.py`
- `backend/tests/email/test_email_preferences.py`
- `backend/tests/email/test_resend_webhook.py`
- `backend/tests/email/test_scheduler_jobs.py`

### Archivos nuevos (frontend)
- `frontend/src/cuenta/EmailPreferencesSection.tsx`

### Archivos modificados
- `backend/config.py` — `resend_api_key`, `from_email`, `resend_webhook_secret`
- `backend/.env.example` — vars Resend
- `backend/main.py` — registrar email router + scheduler en lifespan
- `backend/requirements.txt` — agregar `apscheduler`
- `backend/billing/webhooks.py` — `handle_subscription_created` enviará email de bienvenida (opcional)
- `frontend/src/cuenta/CuentaPage.tsx` — agregar `<EmailPreferencesSection />`
- `frontend/src/premium/api.ts` — agregar `getEmailPreferences()`, `updateEmailPreferences()`
- `frontend/src/premium/types.ts` — agregar `EmailPreferences` type
- `frontend/src/premium/index.ts` — re-export

---

## Task 1: Migración `email_log`

**Files:**
- Create: `backend/alembic/versions/<hash>_email_log.py`

- [ ] **Step 1: Generar la revisión Alembic**

Run desde `backend/`:
```bash
venv\Scripts\alembic.exe revision -m "email log table for tracking sent emails"
```

Anotar el hash generado.

- [ ] **Step 2: Reemplazar el contenido del archivo generado**

Verificar primero el head actual:
```bash
venv\Scripts\alembic.exe current
```

Cuál es la down_revision actual depende de qué migraciones haya el otro proyecto (KSpace-AI) commiteado. Probablemente sea `7093ac58ea99` o más reciente. Reemplazar `<down_revision>` con el head actual.

Reemplazar contenido del archivo con:

```python
"""email log table for tracking sent emails

Revision ID: <generated_hash>
Revises: <current_head>
Create Date: <keep_whatever_alembic_generated>
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "<generated_hash>"
down_revision: Union[str, Sequence[str], None] = "<current_head>"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "email_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("usuario_id", sa.String(length=36), sa.ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email_type", sa.String(length=32), nullable=False),  # 'weekly'|'monthly'|'imbalance'|'reminder'
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="queued"),  # queued|sent|delivered|bounced|complained|failed
        sa.Column("sent_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("provider_message_id", sa.String(length=128), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.UniqueConstraint("idempotency_key", name="uq_email_log_idempotency_key"),
    )
    op.create_index("ix_email_log_usuario_type", "email_log", ["usuario_id", "email_type"])
    op.create_index("ix_email_log_status", "email_log", ["status"])


def downgrade() -> None:
    op.drop_index("ix_email_log_status", table_name="email_log")
    op.drop_index("ix_email_log_usuario_type", table_name="email_log")
    op.drop_table("email_log")
```

- [ ] **Step 3: Aplicar migración**

```bash
venv\Scripts\alembic.exe upgrade head
```

Expected: `Running upgrade <prev> -> <hash>`.

- [ ] **Step 4: Verificar la tabla**

```bash
venv\Scripts\python.exe -c "
import sqlite3
conn = sqlite3.connect('kabbalah.db')
cols = conn.execute('PRAGMA table_info(email_log)').fetchall()
print([(c[1], c[2]) for c in cols])
"
```

Expected: lista de columnas incluyendo `id`, `usuario_id`, `email_type`, `idempotency_key`, `status`, `sent_at`, `provider_message_id`, `error_message`.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/<hash>_email_log.py
git commit -m "feat(emails): migracion email_log para tracking de envios"
```

---

## Task 2: Modelo SQLAlchemy `EmailLog`

**Files:**
- Create: `backend/email/__init__.py`
- Create: `backend/email/models.py`
- Create: `backend/tests/email/__init__.py`
- Create: `backend/tests/email/test_models.py`

- [ ] **Step 1: Crear directorios y __init__**

Create `backend/email/__init__.py` empty.
Create `backend/tests/email/__init__.py` empty.

- [ ] **Step 2: Test failing primero**

Create `backend/tests/email/test_models.py`:

```python
"""Tests for email SQLAlchemy models."""
from sqlalchemy import inspect

from email_mod.models import EmailLog


def test_email_log_tablename():
    assert EmailLog.__tablename__ == "email_log"


def test_email_log_required_columns():
    cols = {c.name for c in inspect(EmailLog).columns}
    expected = {
        "id", "usuario_id", "email_type", "idempotency_key",
        "status", "sent_at", "provider_message_id", "error_message",
    }
    assert expected.issubset(cols)


def test_email_log_status_default():
    cols = {c.name: c for c in inspect(EmailLog).columns}
    assert cols["status"].server_default.arg == "queued"


def test_email_log_unique_constraint_on_idempotency():
    from sqlalchemy import UniqueConstraint as UC
    uc = [c for c in EmailLog.__table__.constraints
          if isinstance(c, UC) and c.name == "uq_email_log_idempotency_key"]
    assert len(uc) == 1
    cols = sorted([c.name for c in uc[0].columns])
    assert cols == ["idempotency_key"]
```

**Important note on imports:** Python's stdlib has a module named `email`, which shadows ours. We import from `email_mod` instead — but our module IS named `email`. To avoid conflict, we'll add a workaround in Step 3.

Actually, simpler: rename our backend module to a non-conflicting name. Use `backend/emails/` (plural) instead of `backend/email/`. Update all paths in this plan to `emails/`.

**Revised: replace `backend/email/` with `backend/emails/` everywhere in this plan.**

Recreate the structure with the new name:
- `backend/emails/__init__.py`
- `backend/emails/models.py`
- `backend/tests/emails/__init__.py`
- `backend/tests/emails/test_models.py`

Update the test file accordingly:

```python
"""Tests for email SQLAlchemy models."""
from sqlalchemy import inspect

from emails.models import EmailLog


def test_email_log_tablename():
    assert EmailLog.__tablename__ == "email_log"


def test_email_log_required_columns():
    cols = {c.name for c in inspect(EmailLog).columns}
    expected = {
        "id", "usuario_id", "email_type", "idempotency_key",
        "status", "sent_at", "provider_message_id", "error_message",
    }
    assert expected.issubset(cols)


def test_email_log_status_default():
    cols = {c.name: c for c in inspect(EmailLog).columns}
    assert cols["status"].server_default.arg == "queued"


def test_email_log_unique_constraint_on_idempotency():
    from sqlalchemy import UniqueConstraint as UC
    uc = [c for c in EmailLog.__table__.constraints
          if isinstance(c, UC) and c.name == "uq_email_log_idempotency_key"]
    assert len(uc) == 1
    cols = sorted([c.name for c in uc[0].columns])
    assert cols == ["idempotency_key"]
```

- [ ] **Step 3: Run test, verify fail**

```bash
cd backend
venv\Scripts\python.exe -m pytest tests/emails/test_models.py -v
```

Expected: `ModuleNotFoundError: No module named 'emails.models'`

- [ ] **Step 4: Implementar EmailLog**

Create `backend/emails/models.py`:

```python
"""SQLAlchemy model for tracked email sends (EmailLog).

The UNIQUE constraint on idempotency_key prevents duplicate sends for the
same (usuario_id, type, period) combination. The cron jobs INSERT-then-send;
if a previous run already inserted, the IntegrityError signals "already sent".
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func

from database import Base


class EmailLog(Base):
    __tablename__ = "email_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    usuario_id = Column(String(36), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    email_type = Column(String(32), nullable=False)  # 'weekly'|'monthly'|'imbalance'|'reminder'
    idempotency_key = Column(String(128), nullable=False)
    status = Column(String(20), nullable=False, server_default="queued")
    sent_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    provider_message_id = Column(String(128), nullable=True)
    error_message = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_email_log_idempotency_key"),
    )
```

- [ ] **Step 5: Registrar en alembic env**

Edit `backend/alembic/env.py`. Find the `import billing.models` line and add right after it:
```python
import emails.models  # noqa: F401 — register email_log on Base.metadata
```

- [ ] **Step 6: Run tests, verify pass**

```bash
venv\Scripts\python.exe -m pytest tests/emails/test_models.py -v
```

Expected: 4 passed.

- [ ] **Step 7: Full suite green**

```bash
venv\Scripts\python.exe -m pytest 2>&1 | tail -5
```

Expected: 4 nuevos tests sumados al total. No regressions.

- [ ] **Step 8: Commit**

```bash
git add backend/emails/__init__.py backend/emails/models.py backend/tests/emails/__init__.py backend/tests/emails/test_models.py backend/alembic/env.py
git commit -m "feat(emails): modelo EmailLog + registro en alembic env"
```

---

## Task 3: Config + dependencias

**Files:**
- Modify: `backend/config.py`
- Modify: `backend/.env.example`
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Agregar variables a Settings**

Edit `backend/config.py`. Junto a las settings de Lemonsqueezy, agregar:

```python
    # Resend (transactional emails)
    resend_api_key: str = ""
    resend_webhook_secret: str = ""
    from_email: str = "Kabbalah Space <hola@kabbalahspace.app>"
    emails_enabled: bool = False  # gate global: kill switch para apagar todo el sistema

    @property
    def resend_configured(self) -> bool:
        return bool(self.resend_api_key and self.from_email)
```

- [ ] **Step 2: Agregar al .env.example**

Append:
```
# --- Resend (premium emails) ---
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
FROM_EMAIL="Kabbalah Space <hola@kabbalahspace.app>"
EMAILS_ENABLED=false
```

- [ ] **Step 3: Agregar APScheduler a requirements**

Append to `backend/requirements.txt`:
```
apscheduler>=3.10,<4.0
```

- [ ] **Step 4: Instalar**

```bash
cd backend
venv\Scripts\pip.exe install "apscheduler>=3.10,<4.0"
```

- [ ] **Step 5: Verificar import**

```bash
venv\Scripts\python.exe -c "from apscheduler.schedulers.asyncio import AsyncIOScheduler; print('ok')"
```

Expected: `ok`.

- [ ] **Step 6: Commit**

```bash
git add backend/config.py backend/.env.example backend/requirements.txt
git commit -m "build(emails): config Resend + dep apscheduler"
```

---

## Task 4: Cliente Resend (HTTP wrapper)

**Files:**
- Create: `backend/emails/client.py`
- Test: `backend/tests/emails/test_client.py`

- [ ] **Step 1: Test failing primero**

Create `backend/tests/emails/test_client.py`:

```python
"""Tests for the Resend HTTP client wrapper."""
import pytest
import respx
from httpx import Response

from emails.client import send_email, ResendError, ResendAuthError


@pytest.fixture
def settings_with_resend(monkeypatch):
    from config import get_settings
    s = get_settings()
    monkeypatch.setattr(s, "resend_api_key", "test-key")
    monkeypatch.setattr(s, "from_email", "Kabbalah <test@test.com>")
    monkeypatch.setattr(s, "emails_enabled", True)
    return s


@pytest.mark.asyncio
async def test_send_email_returns_message_id(settings_with_resend):
    with respx.mock(base_url="https://api.resend.com") as mock:
        mock.post("/emails").mock(
            return_value=Response(200, json={"id": "msg-abc-123"})
        )
        msg_id = await send_email(
            settings_with_resend,
            to="user@x.com",
            subject="hola",
            html="<p>hola</p>",
        )
    assert msg_id == "msg-abc-123"


@pytest.mark.asyncio
async def test_send_email_raises_auth_error_on_401(settings_with_resend):
    with respx.mock(base_url="https://api.resend.com") as mock:
        mock.post("/emails").mock(return_value=Response(401, json={"message": "invalid key"}))
        with pytest.raises(ResendAuthError):
            await send_email(settings_with_resend, to="x@x.com", subject="s", html="<p>h</p>")


@pytest.mark.asyncio
async def test_send_email_raises_generic_on_500(settings_with_resend):
    with respx.mock(base_url="https://api.resend.com") as mock:
        mock.post("/emails").mock(return_value=Response(500, text="internal error"))
        with pytest.raises(ResendError):
            await send_email(settings_with_resend, to="x@x.com", subject="s", html="<p>h</p>")


@pytest.mark.asyncio
async def test_send_email_kill_switch_returns_none(monkeypatch):
    from config import get_settings
    s = get_settings()
    monkeypatch.setattr(s, "resend_api_key", "test-key")
    monkeypatch.setattr(s, "from_email", "x@x.com")
    monkeypatch.setattr(s, "emails_enabled", False)  # kill switch OFF

    # Should not call Resend at all; returns None.
    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails")
        result = await send_email(s, to="user@x.com", subject="hola", html="<p>hola</p>")
    assert result is None
    assert len(route.calls) == 0
```

- [ ] **Step 2: Run, verify fail**

```bash
venv\Scripts\python.exe -m pytest tests/emails/test_client.py -v
```

Expected: `ModuleNotFoundError: No module named 'emails.client'`.

- [ ] **Step 3: Implementar el cliente**

Create `backend/emails/client.py`:

```python
"""Thin async HTTP wrapper over the Resend API.

Docs: https://resend.com/docs/api-reference/emails/send-email

The kill-switch `settings.emails_enabled` lets us turn off ALL email sends
without removing the integration — useful for incidents and for tests that
don't want to mock Resend.
"""
from typing import Optional
import httpx

from config import Settings


BASE_URL = "https://api.resend.com"
TIMEOUT_SECONDS = 15


class ResendError(Exception):
    """Base for Resend API failures."""


class ResendAuthError(ResendError):
    """401 from Resend — API key is invalid or missing."""


async def send_email(
    settings: Settings,
    *,
    to: str,
    subject: str,
    html: str,
    text: Optional[str] = None,
    headers: Optional[dict] = None,
) -> Optional[str]:
    """Send an email via Resend. Returns the provider message_id, or None if
    the global kill-switch is off.

    Raises:
        ResendAuthError on 401
        ResendError on any other 4xx/5xx
    """
    if not settings.emails_enabled:
        return None

    body = {
        "from": settings.from_email,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text is not None:
        body["text"] = text
    if headers:
        body["headers"] = headers

    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as http:
        r = await http.post(
            f"{BASE_URL}/emails",
            json=body,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
        )

    if r.status_code == 401:
        raise ResendAuthError("resend auth failed (check RESEND_API_KEY)")
    if r.status_code >= 400:
        raise ResendError(f"resend {r.status_code}: {r.text[:200]}")

    data = r.json()
    return data.get("id")
```

- [ ] **Step 4: Run tests, verify pass**

```bash
venv\Scripts\python.exe -m pytest tests/emails/test_client.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/emails/client.py backend/tests/emails/test_client.py
git commit -m "feat(emails): cliente Resend con kill-switch global"
```

---

## Task 5: Template base + hook de insight

**Files:**
- Create: `backend/emails/templates/__init__.py`
- Create: `backend/emails/templates/base.py`
- Create: `backend/emails/insight.py`

- [ ] **Step 1: Crear paquete templates**

Create `backend/emails/templates/__init__.py` empty.

- [ ] **Step 2: Implementar base.py**

Create `backend/emails/templates/base.py`:

```python
"""HTML shell common to all premium emails. Templo Digital aesthetic:
gold-on-black, sober serif title, terse copy.

Inline CSS only — most email clients strip <style> tags.
"""
from typing import Optional

FOOTER_TEXT = (
    "Recibís este correo porque sos parte de Kabbalah Space Premium. "
    "Podés ajustar tus preferencias o darte de baja en cualquier momento."
)


def render_shell(
    *,
    preview: str,
    title: str,
    body_html: str,
    cta_label: Optional[str] = None,
    cta_url: Optional[str] = None,
    preferences_url: str = "",
) -> str:
    """Wrap body content in the Templo Digital HTML shell.

    Args:
        preview: short text shown as inbox preview (first ~80 chars)
        title: H1 title at the top of the email
        body_html: the content section (paragraphs, lists, etc.)
        cta_label: optional button label
        cta_url: optional button href (required if cta_label is set)
        preferences_url: link to "Mi cuenta → Suscripción" for opt-out
    """
    cta_block = ""
    if cta_label and cta_url:
        cta_block = f"""
        <tr>
          <td align="center" style="padding: 24px 32px 8px;">
            <a href="{cta_url}" style="display:inline-block;background:linear-gradient(135deg,#fde68a,#fbbf24,#f59e0b);color:#1c1917;text-decoration:none;padding:12px 28px;border-radius:9999px;font-family:Georgia,serif;font-size:14px;letter-spacing:0.02em;box-shadow:0 4px 16px rgba(233,195,73,0.35);">{cta_label}</a>
          </td>
        </tr>
        """

    return f"""<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#070709;font-family:Georgia,'Times New Roman',serif;color:#d6d3d1;">
  <!-- preview -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">{preview}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#070709;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#15181d;border:1px solid rgba(120,113,108,0.35);border-radius:24px;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 8px;">
              <p style="margin:0;font-family:Arial,sans-serif;font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:rgba(254,243,199,0.6);">Kabbalah Space</p>
              <h1 style="margin:8px 0 0;font-family:Georgia,serif;font-size:24px;line-height:1.3;color:#fef3c7;font-weight:400;">{title}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;font-family:Georgia,serif;font-size:15px;line-height:1.65;color:#d6d3d1;">
              {body_html}
            </td>
          </tr>
          {cta_block}
          <tr>
            <td style="padding:24px 32px 32px;border-top:1px solid rgba(68,64,60,0.6);">
              <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:11px;color:rgba(168,162,158,0.7);line-height:1.6;">{FOOTER_TEXT}</p>
              <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;">
                <a href="{preferences_url}" style="color:rgba(254,243,199,0.7);text-decoration:underline;">Gestionar preferencias</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body></html>
"""
```

- [ ] **Step 3: Implementar el hook de insight**

Create `backend/emails/insight.py`:

```python
"""Hook for AI-generated insights in email content.

In Phase 1 (this plan), returns None for everything → templates fall back
to a generic plantilla with raw data. In Phase 2, this module wires up to
the KSpace-AI motor (POST /ai/insight) and returns 1-3 paragraphs of
personalized analysis in Spanish.

The contract:
- Input: usuario_id, tipo, periodo_start, periodo_end
- Output: str (paragraph(s)) or None (no AI available — caller uses fallback)
"""
from datetime import datetime
from typing import Optional, Literal

InsightType = Literal["weekly", "monthly", "imbalance", "reminder"]


async def generate_insight(
    usuario_id: str,
    tipo: InsightType,
    periodo_start: datetime,
    periodo_end: datetime,
) -> Optional[str]:
    """Return a generative AI insight or None.

    Phase 1: always None. Phase 2 will call the IA endpoint.
    """
    return None
```

- [ ] **Step 4: Smoke test del rendering**

```bash
venv\Scripts\python.exe -c "
from emails.templates.base import render_shell
html = render_shell(
    preview='Tu semana en el árbol',
    title='Tu semana en el árbol',
    body_html='<p>Sumaste 3 actividades en Jésed y 1 reflexión libre.</p>',
    cta_label='Ver mi árbol',
    cta_url='https://kabbalahspace.app/espejo',
    preferences_url='https://kabbalahspace.app/cuenta',
)
print(len(html), 'chars')
assert '<!doctype html>' in html
assert 'Jésed' in html
assert 'kabbalahspace.app/espejo' in html
print('ok')
"
```

Expected: `~2300 chars` + `ok`.

- [ ] **Step 5: Commit**

```bash
git add backend/emails/templates/__init__.py backend/emails/templates/base.py backend/emails/insight.py
git commit -m "feat(emails): template HTML base + hook insight (Fase 1 fallback)"
```

---

## Task 6: 4 templates de contenido

**Files:**
- Create: `backend/emails/templates/weekly_summary.py`
- Create: `backend/emails/templates/monthly_summary.py`
- Create: `backend/emails/templates/imbalance_alert.py`
- Create: `backend/emails/templates/reflection_reminder.py`
- Test: `backend/tests/emails/test_templates.py`

- [ ] **Step 1: Test failing primero**

Create `backend/tests/emails/test_templates.py`:

```python
"""Tests for each email template — they render and contain the key data points."""
from datetime import datetime, timezone, timedelta

from emails.templates.weekly_summary import render_weekly_summary
from emails.templates.monthly_summary import render_monthly_summary
from emails.templates.imbalance_alert import render_imbalance_alert
from emails.templates.reflection_reminder import render_reflection_reminder


FROZEN_NOW = datetime(2026, 5, 24, 12, 0, tzinfo=timezone.utc)


def test_weekly_summary_includes_top_sefirot_and_counts():
    html = render_weekly_summary(
        nombre="Alex",
        week_start=FROZEN_NOW - timedelta(days=7),
        week_end=FROZEN_NOW,
        top_sefirot=[("Jésed", 3), ("Tiféret", 2)],
        reflexiones_count=2,
        insight=None,
        app_url="https://kabbalahspace.app",
        preferences_url="https://kabbalahspace.app/cuenta",
    )
    assert "Jésed" in html and "3" in html
    assert "Tiféret" in html
    assert "Alex" in html
    assert "kabbalahspace.app/espejo" in html


def test_weekly_summary_uses_insight_when_provided():
    insight = "Esta semana mostraste mucha actividad en el pilar derecho."
    html = render_weekly_summary(
        nombre="Alex",
        week_start=FROZEN_NOW - timedelta(days=7),
        week_end=FROZEN_NOW,
        top_sefirot=[("Jésed", 3)],
        reflexiones_count=1,
        insight=insight,
        app_url="https://x.com",
        preferences_url="https://x.com/cuenta",
    )
    assert insight in html


def test_monthly_summary_includes_month_label():
    html = render_monthly_summary(
        nombre="Alex",
        month_label="mayo de 2026",
        sefirot_breakdown=[("Jésed", 12), ("Gueburá", 5)],
        reflexiones_count=8,
        delta_vs_prev_month=+3,
        insight=None,
        app_url="https://x.com",
        preferences_url="https://x.com/cuenta",
    )
    assert "mayo de 2026" in html
    assert "Jésed" in html
    assert "Gueburá" in html


def test_imbalance_alert_includes_sefira_and_days():
    html = render_imbalance_alert(
        nombre="Alex",
        sefira_nombre="Gueburá",
        days_since=18,
        app_url="https://x.com",
        preferences_url="https://x.com/cuenta",
    )
    assert "Gueburá" in html
    assert "18" in html


def test_reflection_reminder_includes_pregunta_text():
    pregunta = "¿Qué decisión venís postergando?"
    html = render_reflection_reminder(
        nombre="Alex",
        pregunta_texto=pregunta,
        sefira_nombre="Tiféret",
        app_url="https://x.com",
        preferences_url="https://x.com/cuenta",
    )
    assert pregunta in html
    assert "Tiféret" in html
```

- [ ] **Step 2: Run, verify fail**

```bash
venv\Scripts\python.exe -m pytest tests/emails/test_templates.py -v
```

Expected: ImportError on all 4 template modules.

- [ ] **Step 3: Implementar weekly_summary.py**

Create `backend/emails/templates/weekly_summary.py`:

```python
"""Weekly summary email template."""
from datetime import datetime
from typing import Optional

from .base import render_shell


def render_weekly_summary(
    *,
    nombre: str,
    week_start: datetime,
    week_end: datetime,
    top_sefirot: list[tuple[str, int]],
    reflexiones_count: int,
    insight: Optional[str],
    app_url: str,
    preferences_url: str,
) -> str:
    sefirot_items = "".join(
        f'<li style="margin:0 0 6px;"><strong style="color:#fef3c7;">{name}</strong> · {count} actividad{"es" if count != 1 else ""}</li>'
        for name, count in top_sefirot
    )
    sefirot_block = (
        f'<p style="margin:16px 0 8px;color:rgba(254,243,199,0.7);font-size:12px;letter-spacing:0.18em;text-transform:uppercase;">Tus sefirot esta semana</p>'
        f'<ul style="margin:0;padding-left:18px;">{sefirot_items}</ul>'
        if top_sefirot else
        '<p style="margin:8px 0;color:rgba(168,162,158,0.7);font-style:italic;">No registraste actividades esta semana. El templo descansa.</p>'
    )

    reflexiones_block = (
        f'<p style="margin:16px 0 0;">Y volcaste <strong>{reflexiones_count}</strong> reflexión{"es" if reflexiones_count != 1 else ""} en el camino.</p>'
        if reflexiones_count > 0 else ""
    )

    if insight:
        insight_block = (
            f'<div style="margin:20px 0 0;padding:16px;background:rgba(254,243,199,0.05);border-left:2px solid rgba(254,243,199,0.4);border-radius:4px;">'
            f'<p style="margin:0;font-style:italic;color:rgba(254,243,199,0.9);">{insight}</p>'
            f'</div>'
        )
    else:
        insight_block = ""

    body = (
        f'<p style="margin:0;">Hola {nombre},</p>'
        f'<p style="margin:12px 0 0;">Tu semana ({week_start:%d/%m} al {week_end:%d/%m}) en el árbol:</p>'
        + sefirot_block + reflexiones_block + insight_block
    )

    return render_shell(
        preview="Tu semana en el árbol",
        title="Tu semana en el árbol",
        body_html=body,
        cta_label="Ver Mi Evolución",
        cta_url=f"{app_url}/espejo",
        preferences_url=preferences_url,
    )
```

- [ ] **Step 4: Implementar monthly_summary.py**

Create `backend/emails/templates/monthly_summary.py`:

```python
"""Monthly summary email template."""
from typing import Optional

from .base import render_shell


def render_monthly_summary(
    *,
    nombre: str,
    month_label: str,
    sefirot_breakdown: list[tuple[str, int]],
    reflexiones_count: int,
    delta_vs_prev_month: int,
    insight: Optional[str],
    app_url: str,
    preferences_url: str,
) -> str:
    sefirot_items = "".join(
        f'<tr><td style="padding:4px 12px 4px 0;color:#fef3c7;">{name}</td><td style="padding:4px 0;color:#d6d3d1;text-align:right;">{count}</td></tr>'
        for name, count in sefirot_breakdown
    )
    sefirot_table = (
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 0;width:100%;font-size:14px;">{sefirot_items}</table>'
        if sefirot_breakdown else
        '<p style="margin:8px 0;color:rgba(168,162,158,0.7);font-style:italic;">Sin actividades registradas este mes.</p>'
    )

    delta_text = ""
    if delta_vs_prev_month > 0:
        delta_text = f'<p style="margin:12px 0 0;color:rgba(134,239,172,0.85);">Este mes hiciste {delta_vs_prev_month} más que el mes anterior.</p>'
    elif delta_vs_prev_month < 0:
        delta_text = f'<p style="margin:12px 0 0;color:rgba(253,186,116,0.85);">Este mes hiciste {abs(delta_vs_prev_month)} menos que el mes anterior.</p>'

    insight_block = (
        f'<div style="margin:20px 0 0;padding:16px;background:rgba(254,243,199,0.05);border-left:2px solid rgba(254,243,199,0.4);border-radius:4px;">'
        f'<p style="margin:0;font-style:italic;color:rgba(254,243,199,0.9);">{insight}</p>'
        f'</div>'
        if insight else ""
    )

    body = (
        f'<p style="margin:0;">Hola {nombre},</p>'
        f'<p style="margin:12px 0 0;">Tu mes de <strong>{month_label}</strong>:</p>'
        + sefirot_table
        + f'<p style="margin:16px 0 0;">Reflexiones: <strong>{reflexiones_count}</strong>.</p>'
        + delta_text + insight_block
    )

    return render_shell(
        preview=f"Tu mes en el árbol — {month_label}",
        title=f"Tu mes en el árbol",
        body_html=body,
        cta_label="Ver Mi Evolución",
        cta_url=f"{app_url}/evolucion",
        preferences_url=preferences_url,
    )
```

- [ ] **Step 5: Implementar imbalance_alert.py**

Create `backend/emails/templates/imbalance_alert.py`:

```python
"""Imbalance alert email — fires when a sefira hasn't been touched in >14 days."""
from .base import render_shell


def render_imbalance_alert(
    *,
    nombre: str,
    sefira_nombre: str,
    days_since: int,
    app_url: str,
    preferences_url: str,
) -> str:
    body = (
        f'<p style="margin:0;">Hola {nombre},</p>'
        f'<p style="margin:12px 0 0;">Hace <strong>{days_since} días</strong> que <strong style="color:#fef3c7;">{sefira_nombre}</strong> no recibe atención.</p>'
        f'<p style="margin:12px 0 0;color:rgba(168,162,158,0.85);">El árbol vive en equilibrio. Tal vez sea momento de visitarla.</p>'
    )

    return render_shell(
        preview=f"{sefira_nombre} te espera",
        title=f"{sefira_nombre} te espera",
        body_html=body,
        cta_label=f"Visitar {sefira_nombre}",
        cta_url=f"{app_url}/espejo",
        preferences_url=preferences_url,
    )
```

- [ ] **Step 6: Implementar reflection_reminder.py**

Create `backend/emails/templates/reflection_reminder.py`:

```python
"""Reflection reminder email — sent when user has been absent ≥7 days
AND has guide questions available."""
from .base import render_shell


def render_reflection_reminder(
    *,
    nombre: str,
    pregunta_texto: str,
    sefira_nombre: str,
    app_url: str,
    preferences_url: str,
) -> str:
    body = (
        f'<p style="margin:0;">Hola {nombre},</p>'
        f'<p style="margin:12px 0 0;">Una pregunta espera por vos en <strong style="color:#fef3c7;">{sefira_nombre}</strong>:</p>'
        f'<p style="margin:16px 0 0;padding:16px;background:rgba(0,0,0,0.3);border-radius:8px;font-style:italic;color:rgba(254,243,199,0.9);">{pregunta_texto}</p>'
    )

    return render_shell(
        preview="Una pregunta espera por vos",
        title="Una pregunta espera por vos",
        body_html=body,
        cta_label="Responder",
        cta_url=f"{app_url}/espejo",
        preferences_url=preferences_url,
    )
```

- [ ] **Step 7: Run tests, verify pass**

```bash
venv\Scripts\python.exe -m pytest tests/emails/test_templates.py -v
```

Expected: 5 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/emails/templates/weekly_summary.py backend/emails/templates/monthly_summary.py backend/emails/templates/imbalance_alert.py backend/emails/templates/reflection_reminder.py backend/tests/emails/test_templates.py
git commit -m "feat(emails): 4 templates (weekly, monthly, imbalance, reminder)"
```

---

## Task 7: Orquestador `sender.py` — idempotencia + preferencias + envío

**Files:**
- Create: `backend/emails/sender.py`
- Test: `backend/tests/emails/test_sender.py`

The sender is the single entry point that the cron jobs use. Its responsibilities:
1. Read EmailPreferences row; respect opt-outs
2. Compute idempotency_key for the (user, type, period) tuple
3. INSERT into email_log; if UNIQUE constraint fails, skip (already sent)
4. Render template (with optional insight from `insight.py`)
5. Call Resend
6. Update email_log row with `provider_message_id` + status='sent', or `status='failed'` + error

- [ ] **Step 1: Test failing primero**

Create `backend/tests/emails/test_sender.py`:

```python
"""Tests for the email sender orquestrator: idempotency + preferencias + send."""
import pytest
import respx
from datetime import datetime, timezone
from httpx import Response
from sqlalchemy import select, func

from models import Usuario
from billing.models import EmailPreferences
from emails.models import EmailLog
from emails.sender import send_weekly_summary


@pytest.fixture
def emails_enabled(monkeypatch):
    from config import get_settings
    s = get_settings()
    monkeypatch.setattr(s, "resend_api_key", "test-key")
    monkeypatch.setattr(s, "from_email", "Kabbalah <test@x.com>")
    monkeypatch.setattr(s, "emails_enabled", True)
    return s


@pytest.fixture
async def premium_user_with_prefs(db_session):
    user = Usuario(id="u-mail-1", email="recipient@x.com", nombre="Alex", provider="email")
    prefs = EmailPreferences(usuario_id="u-mail-1")  # defaults: all true
    db_session.add_all([user, prefs])
    await db_session.commit()
    return user


@pytest.mark.asyncio
async def test_sender_sends_weekly_and_logs(emails_enabled, premium_user_with_prefs, db_session):
    with respx.mock(base_url="https://api.resend.com") as mock:
        mock.post("/emails").mock(return_value=Response(200, json={"id": "msg-1"}))

        result = await send_weekly_summary(
            db_session,
            user=premium_user_with_prefs,
            week_start=datetime(2026, 5, 17, tzinfo=timezone.utc),
            week_end=datetime(2026, 5, 24, tzinfo=timezone.utc),
            app_url="https://kab.app",
        )

    assert result == "msg-1"
    log = (await db_session.execute(
        select(EmailLog).where(EmailLog.usuario_id == "u-mail-1")
    )).scalars().first()
    assert log is not None
    assert log.email_type == "weekly"
    assert log.status == "sent"
    assert log.provider_message_id == "msg-1"


@pytest.mark.asyncio
async def test_sender_idempotent_on_same_period(emails_enabled, premium_user_with_prefs, db_session):
    """Calling twice with the same (user, week) → 1 email sent, 1 log row."""
    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails").mock(return_value=Response(200, json={"id": "msg-1"}))

        await send_weekly_summary(
            db_session,
            user=premium_user_with_prefs,
            week_start=datetime(2026, 5, 17, tzinfo=timezone.utc),
            week_end=datetime(2026, 5, 24, tzinfo=timezone.utc),
            app_url="https://kab.app",
        )
        result_2 = await send_weekly_summary(
            db_session,
            user=premium_user_with_prefs,
            week_start=datetime(2026, 5, 17, tzinfo=timezone.utc),
            week_end=datetime(2026, 5, 24, tzinfo=timezone.utc),
            app_url="https://kab.app",
        )

    assert result_2 is None  # second call skipped
    assert len(route.calls) == 1

    count = (await db_session.execute(
        select(func.count(EmailLog.id)).where(EmailLog.usuario_id == "u-mail-1")
    )).scalar()
    assert count == 1


@pytest.mark.asyncio
async def test_sender_respects_opt_out_preference(emails_enabled, premium_user_with_prefs, db_session):
    """If weekly_summary preference is False, no email sent, no log row."""
    prefs = (await db_session.execute(
        select(EmailPreferences).where(EmailPreferences.usuario_id == "u-mail-1")
    )).scalars().first()
    prefs.weekly_summary = False
    await db_session.commit()

    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails")
        result = await send_weekly_summary(
            db_session,
            user=premium_user_with_prefs,
            week_start=datetime(2026, 5, 17, tzinfo=timezone.utc),
            week_end=datetime(2026, 5, 24, tzinfo=timezone.utc),
            app_url="https://kab.app",
        )

    assert result is None
    assert len(route.calls) == 0

    count = (await db_session.execute(
        select(func.count(EmailLog.id)).where(EmailLog.usuario_id == "u-mail-1")
    )).scalar()
    assert count == 0


@pytest.mark.asyncio
async def test_sender_marks_failed_on_resend_error(emails_enabled, premium_user_with_prefs, db_session):
    with respx.mock(base_url="https://api.resend.com") as mock:
        mock.post("/emails").mock(return_value=Response(500, text="boom"))

        with pytest.raises(Exception):
            await send_weekly_summary(
                db_session,
                user=premium_user_with_prefs,
                week_start=datetime(2026, 5, 17, tzinfo=timezone.utc),
                week_end=datetime(2026, 5, 24, tzinfo=timezone.utc),
                app_url="https://kab.app",
            )

    log = (await db_session.execute(
        select(EmailLog).where(EmailLog.usuario_id == "u-mail-1")
    )).scalars().first()
    assert log is not None
    assert log.status == "failed"
    assert "boom" in (log.error_message or "")
```

- [ ] **Step 2: Run, verify fail**

```bash
venv\Scripts\python.exe -m pytest tests/emails/test_sender.py -v
```

Expected: ImportError on `emails.sender`.

- [ ] **Step 3: Implementar sender.py**

Create `backend/emails/sender.py`:

```python
"""High-level orquestrator for sending premium emails.

Each `send_*` function:
1. Loads the user's EmailPreferences. If the type is opted-out → skip.
2. Computes the idempotency_key for the (user, type, period).
3. INSERTs an EmailLog row with status='queued'. If UNIQUE fails (already
   sent), skip and return None.
4. Renders the template (with optional AI insight from emails.insight).
5. Calls Resend. On success → update row to status='sent' +
   provider_message_id. On failure → status='failed' + error_message, then re-raise.

Importing this module gives the cron jobs a clean API:
    await send_weekly_summary(db, user=..., week_start=..., week_end=..., app_url=...)
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from models import Usuario
from billing.models import EmailPreferences
from emails.client import send_email, ResendError
from emails.insight import generate_insight
from emails.models import EmailLog
from emails.templates.weekly_summary import render_weekly_summary
from emails.templates.monthly_summary import render_monthly_summary
from emails.templates.imbalance_alert import render_imbalance_alert
from emails.templates.reflection_reminder import render_reflection_reminder


logger = logging.getLogger(__name__)


async def _check_preference(db: AsyncSession, usuario_id: str, attr: str) -> bool:
    prefs = (await db.execute(
        select(EmailPreferences).where(EmailPreferences.usuario_id == usuario_id)
    )).scalars().first()
    if prefs is None:
        # No prefs row = not premium / not yet provisioned → no email.
        return False
    return bool(getattr(prefs, attr))


async def _start_log(db: AsyncSession, *, usuario_id: str, email_type: str, idempotency_key: str) -> Optional[EmailLog]:
    """Insert email_log row with status='queued'. Returns the row if inserted,
    or None if UNIQUE constraint blocked it (already sent)."""
    log = EmailLog(
        usuario_id=usuario_id,
        email_type=email_type,
        idempotency_key=idempotency_key,
        status="queued",
    )
    db.add(log)
    try:
        await db.commit()
        await db.refresh(log)
        return log
    except IntegrityError:
        await db.rollback()
        logger.info("email_log duplicate key=%s; skipping", idempotency_key)
        return None


async def _finish_log_success(db: AsyncSession, log: EmailLog, message_id: Optional[str]):
    log.status = "sent"
    log.provider_message_id = message_id
    await db.commit()


async def _finish_log_failure(db: AsyncSession, log: EmailLog, error: str):
    log.status = "failed"
    log.error_message = error[:1000]
    await db.commit()


# ---------------- WEEKLY ----------------

async def send_weekly_summary(
    db: AsyncSession,
    *,
    user: Usuario,
    week_start: datetime,
    week_end: datetime,
    app_url: str,
    top_sefirot: Optional[list[tuple[str, int]]] = None,
    reflexiones_count: int = 0,
) -> Optional[str]:
    if not await _check_preference(db, user.id, "weekly_summary"):
        return None

    iso_year, iso_week, _ = week_start.isocalendar()
    idem = f"{user.id}-weekly-{iso_year}-W{iso_week:02d}"

    log = await _start_log(db, usuario_id=user.id, email_type="weekly", idempotency_key=idem)
    if log is None:
        return None

    settings = get_settings()
    preferences_url = f"{app_url}/cuenta"
    insight = await generate_insight(user.id, "weekly", week_start, week_end)

    html = render_weekly_summary(
        nombre=user.nombre,
        week_start=week_start,
        week_end=week_end,
        top_sefirot=top_sefirot or [],
        reflexiones_count=reflexiones_count,
        insight=insight,
        app_url=app_url,
        preferences_url=preferences_url,
    )

    try:
        msg_id = await send_email(
            settings,
            to=user.email,
            subject="Tu semana en el árbol",
            html=html,
        )
        await _finish_log_success(db, log, msg_id)
        return msg_id
    except ResendError as e:
        await _finish_log_failure(db, log, str(e))
        raise


# ---------------- MONTHLY ----------------

async def send_monthly_summary(
    db: AsyncSession,
    *,
    user: Usuario,
    month_start: datetime,
    month_label: str,
    app_url: str,
    sefirot_breakdown: Optional[list[tuple[str, int]]] = None,
    reflexiones_count: int = 0,
    delta_vs_prev_month: int = 0,
) -> Optional[str]:
    if not await _check_preference(db, user.id, "monthly_summary"):
        return None

    idem = f"{user.id}-monthly-{month_start.year:04d}-{month_start.month:02d}"
    log = await _start_log(db, usuario_id=user.id, email_type="monthly", idempotency_key=idem)
    if log is None:
        return None

    settings = get_settings()
    preferences_url = f"{app_url}/cuenta"
    month_end = month_start.replace(day=28)  # rough — only used for insight period bounds
    insight = await generate_insight(user.id, "monthly", month_start, month_end)

    html = render_monthly_summary(
        nombre=user.nombre,
        month_label=month_label,
        sefirot_breakdown=sefirot_breakdown or [],
        reflexiones_count=reflexiones_count,
        delta_vs_prev_month=delta_vs_prev_month,
        insight=insight,
        app_url=app_url,
        preferences_url=preferences_url,
    )

    try:
        msg_id = await send_email(
            settings,
            to=user.email,
            subject=f"Tu mes en el árbol — {month_label}",
            html=html,
        )
        await _finish_log_success(db, log, msg_id)
        return msg_id
    except ResendError as e:
        await _finish_log_failure(db, log, str(e))
        raise


# ---------------- IMBALANCE ALERT ----------------

async def send_imbalance_alert(
    db: AsyncSession,
    *,
    user: Usuario,
    sefira_id: str,
    sefira_nombre: str,
    days_since: int,
    app_url: str,
) -> Optional[str]:
    if not await _check_preference(db, user.id, "imbalance_alerts"):
        return None

    # Idempotent per sefira per week — don't spam if it stays imbalanced
    iso_year, iso_week, _ = datetime.now(timezone.utc).isocalendar()
    idem = f"{user.id}-imbalance-{sefira_id}-{iso_year}-W{iso_week:02d}"

    log = await _start_log(db, usuario_id=user.id, email_type="imbalance", idempotency_key=idem)
    if log is None:
        return None

    settings = get_settings()
    preferences_url = f"{app_url}/cuenta"

    html = render_imbalance_alert(
        nombre=user.nombre,
        sefira_nombre=sefira_nombre,
        days_since=days_since,
        app_url=app_url,
        preferences_url=preferences_url,
    )

    try:
        msg_id = await send_email(
            settings,
            to=user.email,
            subject=f"{sefira_nombre} te espera",
            html=html,
        )
        await _finish_log_success(db, log, msg_id)
        return msg_id
    except ResendError as e:
        await _finish_log_failure(db, log, str(e))
        raise


# ---------------- REFLECTION REMINDER ----------------

async def send_reflection_reminder(
    db: AsyncSession,
    *,
    user: Usuario,
    pregunta_id: str,
    pregunta_texto: str,
    sefira_nombre: str,
    app_url: str,
) -> Optional[str]:
    if not await _check_preference(db, user.id, "reflection_reminders"):
        return None

    # Idempotent per pregunta per month — don't ping again for the same q
    now = datetime.now(timezone.utc)
    idem = f"{user.id}-reminder-{pregunta_id}-{now.year:04d}-{now.month:02d}"

    log = await _start_log(db, usuario_id=user.id, email_type="reminder", idempotency_key=idem)
    if log is None:
        return None

    settings = get_settings()
    preferences_url = f"{app_url}/cuenta"

    html = render_reflection_reminder(
        nombre=user.nombre,
        pregunta_texto=pregunta_texto,
        sefira_nombre=sefira_nombre,
        app_url=app_url,
        preferences_url=preferences_url,
    )

    try:
        msg_id = await send_email(
            settings,
            to=user.email,
            subject="Una pregunta espera por vos",
            html=html,
        )
        await _finish_log_success(db, log, msg_id)
        return msg_id
    except ResendError as e:
        await _finish_log_failure(db, log, str(e))
        raise
```

- [ ] **Step 4: Run tests, verify pass**

```bash
venv\Scripts\python.exe -m pytest tests/emails/test_sender.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/emails/sender.py backend/tests/emails/test_sender.py
git commit -m "feat(emails): orquestador sender con idempotencia + preferencias + logging"
```

---

## Task 8: Endpoints `/email/preferences` GET y PUT

**Files:**
- Create: `backend/emails/router.py`
- Test: `backend/tests/emails/test_email_preferences.py`
- Modify: `backend/main.py` (registrar router)

- [ ] **Step 1: Test failing primero**

Create `backend/tests/emails/test_email_preferences.py`:

```python
"""Tests for GET/PUT /email/preferences."""
import pytest


@pytest.mark.asyncio
async def test_get_preferences_requires_auth(client):
    r = await client.get("/email/preferences")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_get_preferences_returns_defaults_for_premium_user(client, premium_user_headers):
    r = await client.get("/email/preferences", headers=premium_user_headers)
    assert r.status_code == 200
    body = r.json()
    # Defaults: all 4 toggles True
    assert body["weekly_summary"] is True
    assert body["monthly_summary"] is True
    assert body["imbalance_alerts"] is True
    assert body["reflection_reminders"] is True


@pytest.mark.asyncio
async def test_get_preferences_404_for_free_user(client, free_user_headers):
    """Free users have no email_preferences row."""
    r = await client.get("/email/preferences", headers=free_user_headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_put_preferences_updates_only_provided_fields(client, premium_user_headers):
    r = await client.put(
        "/email/preferences",
        json={"weekly_summary": False, "imbalance_alerts": False},
        headers=premium_user_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["weekly_summary"] is False
    assert body["imbalance_alerts"] is False
    # Untouched fields remain true
    assert body["monthly_summary"] is True
    assert body["reflection_reminders"] is True


@pytest.mark.asyncio
async def test_put_preferences_persists(client, premium_user_headers):
    await client.put(
        "/email/preferences",
        json={"weekly_summary": False},
        headers=premium_user_headers,
    )
    r = await client.get("/email/preferences", headers=premium_user_headers)
    assert r.json()["weekly_summary"] is False
```

The `premium_user_headers` fixture (from Plan 1's conftest) creates a Subscription. Note that EmailPreferences is created by the `subscription_created` webhook handler — so the fixture needs to also create an EmailPreferences row. Update the fixture if needed.

- [ ] **Step 2: Update conftest premium_user_headers to also insert EmailPreferences**

Check `backend/tests/conftest.py` for the `premium_user_headers` fixture. After creating the Subscription, also insert an EmailPreferences row:

```python
    # Also seed EmailPreferences (normally done by subscription_created webhook)
    from billing.models import EmailPreferences
    prefs = EmailPreferences(usuario_id=user_id)
    db_session.add(prefs)
    await db_session.commit()
```

Add this inside `premium_user_headers` right after the `Subscription(...)` add+commit.

- [ ] **Step 3: Run, verify fail**

```bash
venv\Scripts\python.exe -m pytest tests/emails/test_email_preferences.py -v
```

Expected: 404 on every endpoint (router doesn't exist).

- [ ] **Step 4: Implementar router.py**

Create `backend/emails/router.py`:

```python
"""HTTP endpoints for email preferences and Resend webhooks."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import Usuario
from billing.models import EmailPreferences


router = APIRouter(tags=["emails"])


class EmailPreferencesOut(BaseModel):
    weekly_summary: bool
    monthly_summary: bool
    imbalance_alerts: bool
    reflection_reminders: bool

    class Config:
        from_attributes = True


class EmailPreferencesPatch(BaseModel):
    weekly_summary: Optional[bool] = None
    monthly_summary: Optional[bool] = None
    imbalance_alerts: Optional[bool] = None
    reflection_reminders: Optional[bool] = None


@router.get("/email/preferences", response_model=EmailPreferencesOut)
async def get_email_preferences(
    current_user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    prefs = (await db.execute(
        select(EmailPreferences).where(EmailPreferences.usuario_id == current_user.id)
    )).scalars().first()
    if prefs is None:
        raise HTTPException(status_code=404, detail="no_email_preferences")
    return prefs


@router.put("/email/preferences", response_model=EmailPreferencesOut)
async def update_email_preferences(
    payload: EmailPreferencesPatch,
    current_user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    prefs = (await db.execute(
        select(EmailPreferences).where(EmailPreferences.usuario_id == current_user.id)
    )).scalars().first()
    if prefs is None:
        raise HTTPException(status_code=404, detail="no_email_preferences")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(prefs, field, value)
    await db.commit()
    await db.refresh(prefs)
    return prefs
```

- [ ] **Step 5: Registrar router en main.py**

Edit `backend/main.py`. Junto a los otros `app.include_router(...)`:

```python
from emails.router import router as emails_router
# ...
app.include_router(emails_router)
```

- [ ] **Step 6: Run tests, verify pass**

```bash
venv\Scripts\python.exe -m pytest tests/emails/test_email_preferences.py -v
```

Expected: 5 passed.

- [ ] **Step 7: Full suite green**

```bash
venv\Scripts\python.exe -m pytest 2>&1 | tail -5
```

- [ ] **Step 8: Commit**

```bash
git add backend/emails/router.py backend/main.py backend/tests/conftest.py backend/tests/emails/test_email_preferences.py
git commit -m "feat(emails): endpoints GET/PUT /email/preferences"
```

---

## Task 9: Resend webhook handler (bounces + complaints + delivered)

**Files:**
- Modify: `backend/emails/router.py` (add webhook endpoint)
- Test: `backend/tests/emails/test_resend_webhook.py`

Resend webhooks notify us of delivery state changes. Events we care about:
- `email.delivered` — set status='delivered'
- `email.bounced` — set status='bounced'
- `email.complained` — set status='complained' (spam complaint)
- `email.delivery_delayed` — informational, ignore

After 3 hard bounces from the same user, pause email sends for that user (set ALL their EmailPreferences flags to False so future cron skips them).

Security: Resend signs webhooks with `Svix-Signature`. We use the Svix secret pattern (HMAC-SHA256 over the request body, base64-encoded). Compare constant-time.

- [ ] **Step 1: Test failing primero**

Create `backend/tests/emails/test_resend_webhook.py`:

```python
"""Tests for POST /webhooks/resend — Resend delivery events."""
import json
import hmac
import hashlib
import base64
import pytest
from sqlalchemy import select


WEBHOOK_SECRET = "whsec_test_secret"


def _sign(body: bytes, secret: str = WEBHOOK_SECRET) -> str:
    """Resend uses Svix; the signature is base64(hmac_sha256(secret, body))."""
    digest = hmac.new(secret.encode(), body, hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


@pytest.fixture
def resend_secret_configured(monkeypatch):
    from config import get_settings
    s = get_settings()
    monkeypatch.setattr(s, "resend_webhook_secret", WEBHOOK_SECRET)
    return s


@pytest.fixture
async def email_log_row(db_session):
    """Seed an EmailLog row that the webhook will update."""
    from emails.models import EmailLog
    from models import Usuario

    user = Usuario(id="u-wh-1", email="recipient@x.com", nombre="X", provider="email")
    log = EmailLog(
        usuario_id="u-wh-1",
        email_type="weekly",
        idempotency_key="u-wh-1-weekly-2026-W22",
        status="sent",
        provider_message_id="msg-xyz",
    )
    db_session.add_all([user, log])
    await db_session.commit()
    return log


@pytest.mark.asyncio
async def test_webhook_rejects_missing_signature(client, resend_secret_configured):
    r = await client.post(
        "/webhooks/resend",
        json={"type": "email.delivered", "data": {"email_id": "msg-1"}},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_webhook_rejects_bad_signature(client, resend_secret_configured):
    body = json.dumps({"type": "email.delivered", "data": {"email_id": "msg-1"}}).encode()
    r = await client.post(
        "/webhooks/resend",
        content=body,
        headers={"Svix-Signature": "v1,bad-sig", "Content-Type": "application/json"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_webhook_delivered_updates_status(client, resend_secret_configured, email_log_row, db_session):
    from emails.models import EmailLog
    body = json.dumps({"type": "email.delivered", "data": {"email_id": "msg-xyz"}}).encode()
    r = await client.post(
        "/webhooks/resend",
        content=body,
        headers={"Svix-Signature": _sign(body), "Content-Type": "application/json"},
    )
    assert r.status_code == 200
    log = (await db_session.execute(
        select(EmailLog).where(EmailLog.provider_message_id == "msg-xyz")
    )).scalars().first()
    assert log.status == "delivered"


@pytest.mark.asyncio
async def test_webhook_bounced_updates_status(client, resend_secret_configured, email_log_row, db_session):
    from emails.models import EmailLog
    body = json.dumps({"type": "email.bounced", "data": {"email_id": "msg-xyz", "bounce_type": "hard"}}).encode()
    r = await client.post(
        "/webhooks/resend",
        content=body,
        headers={"Svix-Signature": _sign(body), "Content-Type": "application/json"},
    )
    assert r.status_code == 200
    log = (await db_session.execute(
        select(EmailLog).where(EmailLog.provider_message_id == "msg-xyz")
    )).scalars().first()
    assert log.status == "bounced"


@pytest.mark.asyncio
async def test_webhook_three_hard_bounces_pauses_user(client, resend_secret_configured, db_session):
    """After 3 hard bounces for the same user, all their email prefs flip to False."""
    from emails.models import EmailLog
    from billing.models import EmailPreferences
    from models import Usuario

    user = Usuario(id="u-wh-2", email="bounce@x.com", nombre="X", provider="email")
    prefs = EmailPreferences(usuario_id="u-wh-2")  # all true by default
    # 2 existing bounced rows + 1 fresh "sent" row that the webhook will bounce
    logs = [
        EmailLog(usuario_id="u-wh-2", email_type="weekly", idempotency_key=f"u-wh-2-weekly-W{i}", status="bounced", provider_message_id=f"msg-old-{i}")
        for i in range(2)
    ]
    logs.append(EmailLog(usuario_id="u-wh-2", email_type="weekly", idempotency_key="u-wh-2-weekly-W3", status="sent", provider_message_id="msg-fresh"))
    db_session.add_all([user, prefs, *logs])
    await db_session.commit()

    body = json.dumps({"type": "email.bounced", "data": {"email_id": "msg-fresh", "bounce_type": "hard"}}).encode()
    r = await client.post(
        "/webhooks/resend",
        content=body,
        headers={"Svix-Signature": _sign(body), "Content-Type": "application/json"},
    )
    assert r.status_code == 200

    await db_session.refresh(prefs)
    assert prefs.weekly_summary is False
    assert prefs.monthly_summary is False
    assert prefs.imbalance_alerts is False
    assert prefs.reflection_reminders is False
```

- [ ] **Step 2: Run, verify fail**

```bash
venv\Scripts\python.exe -m pytest tests/emails/test_resend_webhook.py -v
```

Expected: 404 (endpoint missing).

- [ ] **Step 3: Implementar webhook endpoint**

Append to `backend/emails/router.py`:

```python
import base64
import hashlib
import hmac
import logging

from fastapi import Header, Request
from sqlalchemy import func


logger = logging.getLogger(__name__)
HARD_BOUNCE_THRESHOLD = 3


def _verify_resend_signature(body: bytes, signature: str, secret: str) -> bool:
    """Resend uses Svix-style signatures: 'v1,<base64-hmac-sha256>'."""
    if not signature or not secret:
        return False
    try:
        version, sig_b64 = signature.split(",", 1)
    except ValueError:
        return False
    if version != "v1":
        return False
    expected_digest = hmac.new(secret.encode(), body, hashlib.sha256).digest()
    expected_b64 = base64.b64encode(expected_digest).decode()
    return hmac.compare_digest(expected_b64, sig_b64)


@router.post("/webhooks/resend")
async def resend_webhook(
    request: Request,
    svix_signature: Optional[str] = Header(default=None, alias="Svix-Signature"),
    db: AsyncSession = Depends(get_db),
):
    from config import get_settings
    settings = get_settings()

    body = await request.body()
    if not _verify_resend_signature(body, svix_signature or "", settings.resend_webhook_secret):
        raise HTTPException(status_code=401, detail="invalid signature")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid json")

    event_type = payload.get("type")
    email_id = payload.get("data", {}).get("email_id")
    if not event_type or not email_id:
        raise HTTPException(status_code=400, detail="malformed payload")

    # Lazy import to avoid circular
    from emails.models import EmailLog
    from billing.models import EmailPreferences

    log = (await db.execute(
        select(EmailLog).where(EmailLog.provider_message_id == email_id)
    )).scalars().first()
    if log is None:
        logger.info("resend webhook for unknown email_id=%s; ignoring", email_id)
        return {"status": "unknown_email"}

    status_map = {
        "email.delivered": "delivered",
        "email.bounced": "bounced",
        "email.complained": "complained",
    }
    new_status = status_map.get(event_type)
    if new_status is None:
        # delivery_delayed and other informational events: no state change
        return {"status": "ignored"}

    log.status = new_status
    await db.commit()

    # If this user has hit the hard-bounce threshold, pause all their emails
    if event_type == "email.bounced":
        bounce_count = (await db.execute(
            select(func.count(EmailLog.id)).where(
                EmailLog.usuario_id == log.usuario_id,
                EmailLog.status == "bounced",
            )
        )).scalar() or 0
        if bounce_count >= HARD_BOUNCE_THRESHOLD:
            prefs = (await db.execute(
                select(EmailPreferences).where(EmailPreferences.usuario_id == log.usuario_id)
            )).scalars().first()
            if prefs is not None:
                prefs.weekly_summary = False
                prefs.monthly_summary = False
                prefs.imbalance_alerts = False
                prefs.reflection_reminders = False
                await db.commit()
                logger.warning("paused all emails for usuario_id=%s after %d hard bounces", log.usuario_id, bounce_count)

    return {"status": "ok"}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
venv\Scripts\python.exe -m pytest tests/emails/test_resend_webhook.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/emails/router.py backend/tests/emails/test_resend_webhook.py
git commit -m "feat(emails): webhook Resend con HMAC + auto-pause tras 3 bounces"
```

---

## Task 10: Scheduler con APScheduler

**Files:**
- Create: `backend/scheduler/__init__.py`
- Create: `backend/scheduler/scheduler.py`
- Modify: `backend/main.py` (lifespan startup/shutdown)

The scheduler starts at FastAPI startup and stops at shutdown. It runs jobs in the background using the same AsyncSession factory as the app.

- [ ] **Step 1: Crear paquete**

Create `backend/scheduler/__init__.py` empty.

- [ ] **Step 2: Implementar scheduler.py**

Create `backend/scheduler/scheduler.py`:

```python
"""APScheduler setup for premium email cron jobs.

The scheduler starts at FastAPI lifespan startup and stops at shutdown.
Job definitions live in `scheduler.jobs`.

Cron strategy: each cron triggers HOURLY on UTC (cheap), then per-user logic
inside the job filters to "is it 09:00 local time for this user now?". This
keeps the schedule simple and timezone-correct without minute-precision crons.
"""
import logging
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger


logger = logging.getLogger(__name__)


_scheduler: Optional[AsyncIOScheduler] = None


def get_scheduler() -> Optional[AsyncIOScheduler]:
    return _scheduler


def start_scheduler() -> AsyncIOScheduler:
    """Register and start the scheduler. Idempotent: calling twice returns the same instance."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return _scheduler

    # Lazy import to avoid circular at module load
    from scheduler.jobs import (
        hourly_weekly_summary_tick,
        hourly_monthly_summary_tick,
        nightly_imbalance_tick,
        nightly_reminder_tick,
    )

    sched = AsyncIOScheduler(timezone="UTC")
    sched.add_job(hourly_weekly_summary_tick, CronTrigger(minute=0), id="weekly_tick", replace_existing=True)
    sched.add_job(hourly_monthly_summary_tick, CronTrigger(minute=5), id="monthly_tick", replace_existing=True)
    sched.add_job(nightly_imbalance_tick, CronTrigger(hour=2, minute=15), id="imbalance_tick", replace_existing=True)
    sched.add_job(nightly_reminder_tick, CronTrigger(hour=2, minute=30), id="reminder_tick", replace_existing=True)
    sched.start()
    logger.info("scheduler started with 4 jobs")

    _scheduler = sched
    return sched


def stop_scheduler():
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("scheduler stopped")
    _scheduler = None
```

- [ ] **Step 3: Wire en main.py lifespan**

Find the FastAPI `app = FastAPI()` in `backend/main.py`. If there's already a `lifespan` context, extend it. If not, create one:

```python
from contextlib import asynccontextmanager
from scheduler.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    settings = get_settings()
    if settings.emails_enabled:
        start_scheduler()
    yield
    # Shutdown
    stop_scheduler()


app = FastAPI(lifespan=lifespan)
```

If the existing `app = FastAPI()` has args, preserve them: `FastAPI(lifespan=lifespan, ...)`.

- [ ] **Step 4: Smoke test del startup**

```bash
venv\Scripts\python.exe -c "
import os
os.environ['EMAILS_ENABLED'] = 'true'
os.environ['RESEND_API_KEY'] = 'test'
import main
# import succeeds = lifespan registration works
print('ok')
"
```

Expected: `ok`. (We don't actually start the server; just verify import works.)

- [ ] **Step 5: Commit (jobs viene en Task 11)**

The scheduler can't actually start until Task 11 implements the jobs. To keep the build green, defer the commit until Task 11 is done, OR commit a stub `jobs.py` with empty function bodies. Let's do the stub:

Create `backend/scheduler/jobs.py`:

```python
"""Cron job entry points for premium emails.

Each `*_tick` function runs hourly (or nightly) and decides per-user whether
to actually send. Real implementations come in Task 11.
"""
import logging

logger = logging.getLogger(__name__)


async def hourly_weekly_summary_tick():
    logger.debug("weekly_tick (stub)")


async def hourly_monthly_summary_tick():
    logger.debug("monthly_tick (stub)")


async def nightly_imbalance_tick():
    logger.debug("imbalance_tick (stub)")


async def nightly_reminder_tick():
    logger.debug("reminder_tick (stub)")
```

Now commit:

```bash
git add backend/scheduler/__init__.py backend/scheduler/scheduler.py backend/scheduler/jobs.py backend/main.py
git commit -m "feat(emails): APScheduler setup + stubs (jobs en Task 11)"
```

---

## Task 11: Implementar los 4 cron jobs

**Files:**
- Modify: `backend/scheduler/jobs.py`
- Test: `backend/tests/emails/test_scheduler_jobs.py`

Each tick:
1. Opens an AsyncSession
2. Queries premium users (Subscription.status in trial|active)
3. For each user, checks "is now the right time for this user in their tz?"
4. If yes, calls the matching `send_*` from `emails.sender`

- [ ] **Step 1: Test failing primero**

Create `backend/tests/emails/test_scheduler_jobs.py`:

```python
"""Tests for the per-tick job logic — focused on the "is it time for this user?" decision."""
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, AsyncMock
import respx
from httpx import Response

from models import Usuario
from billing.models import Subscription, EmailPreferences


@pytest.fixture
async def premium_user_arg_tz(db_session):
    """Premium user with Buenos Aires timezone (UTC-3)."""
    user = Usuario(
        id="u-cron-1", email="ba@x.com", nombre="Alex",
        provider="email", timezone="America/Argentina/Buenos_Aires",
    )
    sub = Subscription(
        usuario_id="u-cron-1", status="active", plan="monthly",
        lemonsqueezy_subscription_id="ls-cron-1",
        lemonsqueezy_customer_id="lc-cron-1",
        current_period_start=datetime.now(timezone.utc),
        current_period_end=datetime.now(timezone.utc) + timedelta(days=30),
    )
    prefs = EmailPreferences(usuario_id="u-cron-1")
    db_session.add_all([user, sub, prefs])
    await db_session.commit()
    return user


@pytest.mark.asyncio
async def test_weekly_tick_sends_on_sunday_9am_user_tz(premium_user_arg_tz, db_session, monkeypatch):
    """At Sunday 09:00 in user's local tz (= Sunday 12:00 UTC for BA), weekly fires."""
    from scheduler import jobs
    from config import get_settings
    s = get_settings()
    monkeypatch.setattr(s, "resend_api_key", "test")
    monkeypatch.setattr(s, "from_email", "x@x.com")
    monkeypatch.setattr(s, "emails_enabled", True)
    monkeypatch.setattr(jobs, "APP_URL", "https://kab.app")

    # Sunday 2026-05-24 12:00 UTC = Sunday 09:00 in Buenos Aires
    fake_now = datetime(2026, 5, 24, 12, 0, tzinfo=timezone.utc)

    with patch("scheduler.jobs._now_utc", return_value=fake_now):
        with patch("scheduler.jobs.get_session_factory") as mock_sf:
            mock_sf.return_value = lambda: db_session  # very simplified — see note

            with respx.mock(base_url="https://api.resend.com") as mock:
                mock.post("/emails").mock(return_value=Response(200, json={"id": "msg-test"}))
                await jobs.hourly_weekly_summary_tick()

    # The exact assertion depends on how the job composes — at minimum,
    # the Resend mock should be called once for this user.
```

**Note:** Testing the full tick with a real DB session factory is fiddly. The test above shows the intent — adapt as needed using a session-fixture-aware mock or by refactoring the job to take a session as parameter for testing.

Pragmatic alternative: make each tick split into a thin entrypoint + an inner async function that takes (db, now) explicitly. Test the inner function directly.

Refactored design:

```python
# jobs.py
async def hourly_weekly_summary_tick():
    """Entrypoint — opens session and delegates."""
    from database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        await _weekly_summary_for_now(db, _now_utc())


async def _weekly_summary_for_now(db: AsyncSession, now: datetime):
    """Testable inner: given a session and a 'now', send weekly emails to
    any premium user whose local time is currently Sunday 09:xx."""
    ...
```

Tests target `_weekly_summary_for_now` directly with a db_session fixture and a fixed `now`.

- [ ] **Step 2: Implementar jobs.py**

Replace `backend/scheduler/jobs.py` with:

```python
"""Cron job entry points for premium email sends.

Each tick runs hourly on UTC. The inner functions filter to users whose
local-time alignment matches the trigger window:
- Weekly summary: Sunday 09:00 local time
- Monthly summary: 1st of month 09:00 local time
- Imbalance alerts: any time after midnight local
- Reflection reminders: any time after midnight local

This keeps APScheduler config trivial and timezone handling per-user.
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from dateutil.tz import gettz as _gettz
    def ZoneInfo(name: str):
        return _gettz(name) or timezone.utc

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings


logger = logging.getLogger(__name__)


APP_URL = "https://kabbalahspace.app"  # overridable via env in future


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _user_local(now_utc: datetime, tz_name: str) -> datetime:
    try:
        tz = ZoneInfo(tz_name or "America/Argentina/Buenos_Aires")
        return now_utc.astimezone(tz)
    except Exception:
        return now_utc


# ---------------- WEEKLY ----------------

async def hourly_weekly_summary_tick():
    """Entry point — APScheduler calls this hourly on UTC."""
    settings = get_settings()
    if not settings.emails_enabled:
        return
    from database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        await _weekly_summary_for_now(db, _now_utc())


async def _weekly_summary_for_now(db: AsyncSession, now: datetime):
    """Inner — for each active premium user, if their local time is currently
    Sunday between 09:00 and 09:59, send the weekly summary."""
    from models import Usuario
    from billing.models import Subscription
    from emails.sender import send_weekly_summary

    subs = (await db.execute(
        select(Subscription).where(Subscription.status.in_(("trial", "active")))
    )).scalars().all()

    for sub in subs:
        user = (await db.execute(
            select(Usuario).where(Usuario.id == sub.usuario_id)
        )).scalars().first()
        if user is None:
            continue
        local = _user_local(now, user.timezone)
        if local.weekday() != 6:  # 6 = Sunday
            continue
        if local.hour != 9:
            continue

        week_end = now
        week_start = now - timedelta(days=7)
        try:
            await send_weekly_summary(
                db, user=user, week_start=week_start, week_end=week_end, app_url=APP_URL,
            )
        except Exception as e:
            logger.warning("weekly_summary failed for usuario_id=%s: %s", user.id, e)


# ---------------- MONTHLY ----------------

async def hourly_monthly_summary_tick():
    settings = get_settings()
    if not settings.emails_enabled:
        return
    from database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        await _monthly_summary_for_now(db, _now_utc())


async def _monthly_summary_for_now(db: AsyncSession, now: datetime):
    from models import Usuario
    from billing.models import Subscription
    from emails.sender import send_monthly_summary

    subs = (await db.execute(
        select(Subscription).where(Subscription.status.in_(("trial", "active")))
    )).scalars().all()

    for sub in subs:
        user = (await db.execute(
            select(Usuario).where(Usuario.id == sub.usuario_id)
        )).scalars().first()
        if user is None:
            continue
        local = _user_local(now, user.timezone)
        if local.day != 1 or local.hour != 9:
            continue

        # Month being summarized = previous month
        if local.month == 1:
            month_start_local = local.replace(year=local.year - 1, month=12, day=1, hour=0, minute=0, second=0, microsecond=0)
            month_label = f"diciembre de {local.year - 1}"
        else:
            month_start_local = local.replace(month=local.month - 1, day=1, hour=0, minute=0, second=0, microsecond=0)
            spanish_months = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                              "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
            month_label = f"{spanish_months[month_start_local.month - 1]} de {month_start_local.year}"

        month_start_utc = month_start_local.astimezone(timezone.utc)
        try:
            await send_monthly_summary(
                db, user=user, month_start=month_start_utc, month_label=month_label, app_url=APP_URL,
            )
        except Exception as e:
            logger.warning("monthly_summary failed for usuario_id=%s: %s", user.id, e)


# ---------------- IMBALANCE ALERTS ----------------

async def nightly_imbalance_tick():
    settings = get_settings()
    if not settings.emails_enabled:
        return
    from database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        await _imbalance_for_now(db, _now_utc())


async def _imbalance_for_now(db: AsyncSession, now: datetime):
    """For each premium user, find sefirot with no activity in last 14 days;
    fire an alert (one per sefira, idempotent per week via send_imbalance_alert).
    """
    from models import Usuario, Sefira, Actividad, ActividadSefira, RegistroDiario
    from billing.models import Subscription
    from emails.sender import send_imbalance_alert

    subs = (await db.execute(
        select(Subscription).where(Subscription.status.in_(("trial", "active")))
    )).scalars().all()
    sefirot = (await db.execute(select(Sefira))).scalars().all()
    cutoff = now - timedelta(days=14)

    for sub in subs:
        user = (await db.execute(
            select(Usuario).where(Usuario.id == sub.usuario_id)
        )).scalars().first()
        if user is None:
            continue
        for sefira in sefirot:
            # Has any activity or reflexion for this sefira in the last 14 days?
            acts = (await db.execute(
                select(Actividad.id)
                .join(ActividadSefira, ActividadSefira.actividad_id == Actividad.id)
                .where(ActividadSefira.sefira_id == sefira.id, Actividad.usuario_id == user.id, Actividad.inicio >= cutoff)
                .limit(1)
            )).scalars().first()
            if acts:
                continue
            regs = (await db.execute(
                select(RegistroDiario.id).where(
                    RegistroDiario.sefira_id == sefira.id,
                    RegistroDiario.usuario_id == user.id,
                    RegistroDiario.fecha_registro >= cutoff,
                ).limit(1)
            )).scalars().first()
            if regs:
                continue
            # Inactive — send alert (idempotent per week)
            try:
                await send_imbalance_alert(
                    db, user=user, sefira_id=sefira.id, sefira_nombre=sefira.nombre,
                    days_since=14, app_url=APP_URL,
                )
            except Exception as e:
                logger.warning("imbalance alert failed for usuario_id=%s sefira=%s: %s", user.id, sefira.id, e)


# ---------------- REFLECTION REMINDERS ----------------

async def nightly_reminder_tick():
    settings = get_settings()
    if not settings.emails_enabled:
        return
    from database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        await _reminder_for_now(db, _now_utc())


async def _reminder_for_now(db: AsyncSession, now: datetime):
    """For premium users absent ≥7 days with available guide questions,
    send a reminder (idempotent per pregunta per month)."""
    from models import Usuario, PreguntaSefira, RespuestaPregunta, RegistroDiario, Sefira
    from billing.models import Subscription
    from emails.sender import send_reflection_reminder
    from sqlalchemy import func as sql_func

    subs = (await db.execute(
        select(Subscription).where(Subscription.status.in_(("trial", "active")))
    )).scalars().all()
    cutoff_absent = now - timedelta(days=7)

    for sub in subs:
        user = (await db.execute(
            select(Usuario).where(Usuario.id == sub.usuario_id)
        )).scalars().first()
        if user is None:
            continue

        # Has the user been active in the last 7 days?
        recent_reg = (await db.execute(
            select(RegistroDiario.id).where(
                RegistroDiario.usuario_id == user.id,
                RegistroDiario.fecha_registro >= cutoff_absent,
            ).limit(1)
        )).scalars().first()
        if recent_reg:
            continue

        # Find one guide question they haven't answered in 30+ days
        sub_q = select(RespuestaPregunta.pregunta_id, sql_func.max(RespuestaPregunta.fecha_registro).label("last_at")).where(
            RespuestaPregunta.usuario_id == user.id
        ).group_by(RespuestaPregunta.pregunta_id).subquery()

        pregunta = (await db.execute(
            select(PreguntaSefira, Sefira.nombre)
            .join(Sefira, Sefira.id == PreguntaSefira.sefira_id)
            .outerjoin(sub_q, sub_q.c.pregunta_id == PreguntaSefira.id)
            .where(
                (sub_q.c.last_at.is_(None)) | (sub_q.c.last_at < (now - timedelta(days=30)))
            )
            .limit(1)
        )).first()
        if pregunta is None:
            continue

        pregunta_row, sefira_nombre = pregunta
        try:
            await send_reflection_reminder(
                db, user=user, pregunta_id=pregunta_row.id, pregunta_texto=pregunta_row.texto_pregunta,
                sefira_nombre=sefira_nombre, app_url=APP_URL,
            )
        except Exception as e:
            logger.warning("reminder failed for usuario_id=%s: %s", user.id, e)
```

- [ ] **Step 3: Tests más simples (focus on inner functions)**

Replace `tests/emails/test_scheduler_jobs.py` with:

```python
"""Tests for the inner per-tick functions — given a known 'now' and a seeded DB,
verify the right email is sent (via respx) for the right user."""
import pytest
import respx
from datetime import datetime, timedelta, timezone
from httpx import Response
from sqlalchemy import select

from models import Usuario
from billing.models import Subscription, EmailPreferences
from emails.models import EmailLog
from scheduler.jobs import _weekly_summary_for_now, _monthly_summary_for_now


@pytest.fixture
def emails_on(monkeypatch):
    from config import get_settings
    s = get_settings()
    monkeypatch.setattr(s, "resend_api_key", "test")
    monkeypatch.setattr(s, "from_email", "x@x.com")
    monkeypatch.setattr(s, "emails_enabled", True)
    return s


@pytest.fixture
async def premium_ba(db_session):
    user = Usuario(id="u-ba", email="ba@x.com", nombre="Alex", provider="email",
                   timezone="America/Argentina/Buenos_Aires")
    sub = Subscription(usuario_id="u-ba", status="active", plan="monthly",
                       lemonsqueezy_subscription_id="ls-ba", lemonsqueezy_customer_id="lc-ba",
                       current_period_start=datetime.now(timezone.utc),
                       current_period_end=datetime.now(timezone.utc) + timedelta(days=30))
    prefs = EmailPreferences(usuario_id="u-ba")
    db_session.add_all([user, sub, prefs])
    await db_session.commit()
    return user


@pytest.mark.asyncio
async def test_weekly_fires_on_sunday_9am_local(emails_on, premium_ba, db_session):
    # Sunday 2026-05-24 12:00 UTC = Sunday 09:00 ART
    fake_now = datetime(2026, 5, 24, 12, 0, tzinfo=timezone.utc)
    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails").mock(return_value=Response(200, json={"id": "msg-w"}))
        await _weekly_summary_for_now(db_session, fake_now)
    assert len(route.calls) == 1
    log = (await db_session.execute(
        select(EmailLog).where(EmailLog.usuario_id == "u-ba", EmailLog.email_type == "weekly")
    )).scalars().first()
    assert log is not None


@pytest.mark.asyncio
async def test_weekly_does_not_fire_at_other_times(emails_on, premium_ba, db_session):
    # Sunday 2026-05-24 18:00 UTC = Sunday 15:00 ART
    fake_now = datetime(2026, 5, 24, 18, 0, tzinfo=timezone.utc)
    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails")
        await _weekly_summary_for_now(db_session, fake_now)
    assert len(route.calls) == 0


@pytest.mark.asyncio
async def test_monthly_fires_on_first_of_month_9am_local(emails_on, premium_ba, db_session):
    # 2026-06-01 12:00 UTC = 2026-06-01 09:00 ART
    fake_now = datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc)
    with respx.mock(base_url="https://api.resend.com") as mock:
        route = mock.post("/emails").mock(return_value=Response(200, json={"id": "msg-m"}))
        await _monthly_summary_for_now(db_session, fake_now)
    assert len(route.calls) == 1
    log = (await db_session.execute(
        select(EmailLog).where(EmailLog.usuario_id == "u-ba", EmailLog.email_type == "monthly")
    )).scalars().first()
    assert log is not None
```

- [ ] **Step 4: Run tests, verify pass**

```bash
venv\Scripts\python.exe -m pytest tests/emails/test_scheduler_jobs.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Full suite**

```bash
venv\Scripts\python.exe -m pytest 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add backend/scheduler/jobs.py backend/tests/emails/test_scheduler_jobs.py
git commit -m "feat(emails): cron jobs (weekly, monthly, imbalance, reminder) timezone-aware"
```

---

## Task 12: Frontend — endpoints API + types para email prefs

**Files:**
- Modify: `frontend/src/premium/types.ts`
- Modify: `frontend/src/premium/api.ts`
- Modify: `frontend/src/premium/index.ts`

- [ ] **Step 1: Agregar EmailPreferences type**

Append to `frontend/src/premium/types.ts`:

```typescript
export interface EmailPreferences {
  weekly_summary: boolean;
  monthly_summary: boolean;
  imbalance_alerts: boolean;
  reflection_reminders: boolean;
}

export type EmailPreferenceKey = keyof EmailPreferences;
```

- [ ] **Step 2: Agregar API functions**

Append to `frontend/src/premium/api.ts`:

```typescript
import type { EmailPreferences } from './types';

export async function getEmailPreferences(): Promise<EmailPreferences> {
  const res = await apiFetch('/email/preferences');
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function updateEmailPreferences(patch: Partial<EmailPreferences>): Promise<EmailPreferences> {
  const res = await apiFetch('/email/preferences', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
```

- [ ] **Step 3: Re-export en index.ts**

Append to `frontend/src/premium/index.ts`:

```typescript
export type { EmailPreferences, EmailPreferenceKey } from './types';
export { getEmailPreferences, updateEmailPreferences } from './api';
```

- [ ] **Step 4: TS check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/premium/types.ts frontend/src/premium/api.ts frontend/src/premium/index.ts
git commit -m "feat(emails-ui): tipos + API client para email preferences"
```

---

## Task 13: Frontend — sección EmailPreferences en CuentaPage

**Files:**
- Create: `frontend/src/cuenta/EmailPreferencesSection.tsx`
- Modify: `frontend/src/cuenta/CuentaPage.tsx`

- [ ] **Step 1: Crear EmailPreferencesSection**

Create `frontend/src/cuenta/EmailPreferencesSection.tsx`:

```typescript
import { useEffect, useState } from 'react';

import { getEmailPreferences, updateEmailPreferences } from '../premium/api';
import type { EmailPreferences, EmailPreferenceKey } from '../premium/types';

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  saving: boolean;
}

function ToggleRow({ label, description, checked, onChange, saving }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-stone-800/60 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-stone-200">{label}</p>
        <p className="text-xs text-stone-500 leading-snug mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={saving}
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 rounded-full transition-colors shrink-0 mt-0.5 ${
          checked ? 'bg-amber-300/70' : 'bg-stone-700'
        } ${saving ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-stone-950 shadow transform transition-transform mt-0.5 ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}


const TOGGLES: { key: EmailPreferenceKey; label: string; description: string }[] = [
  { key: 'weekly_summary', label: 'Resumen semanal',
    description: 'Domingo a la mañana: top sefirot, reflexiones, lectura de la semana.' },
  { key: 'monthly_summary', label: 'Resumen mensual',
    description: 'Día 1 de cada mes: evolución del mes con comparativa con el anterior.' },
  { key: 'imbalance_alerts', label: 'Alertas de desbalance',
    description: 'Cuando una sefirá lleva >14 días sin atención.' },
  { key: 'reflection_reminders', label: 'Recordatorios de reflexión',
    description: 'Si pasaste ≥7 días sin entrar, una pregunta guía te espera.' },
];


export function EmailPreferencesSection() {
  const [prefs, setPrefs] = useState<EmailPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<EmailPreferenceKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await getEmailPreferences();
        if (!cancelled) setPrefs(p);
      } catch (e) {
        // 404 = free user with no prefs row. Just hide the section.
        if (!cancelled) setPrefs(null);
        const msg = e instanceof Error ? e.message : 'unknown';
        if (msg !== 'no_email_preferences' && !cancelled) {
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function toggle(key: EmailPreferenceKey) {
    if (!prefs || saving) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(key);
    setError(null);
    try {
      const updated = await updateEmailPreferences({ [key]: next[key] });
      setPrefs(updated);
    } catch (e) {
      // Roll back local state
      setPrefs(prefs);
      setError(e instanceof Error ? e.message : 'unknown');
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="bg-[#15181d] border border-stone-700/40 rounded-2xl p-6">
        <p className="text-stone-400 text-sm">Cargando preferencias de correo...</p>
      </div>
    );
  }

  if (prefs === null) {
    // Free user — no prefs row exists. Don't render the section at all.
    return null;
  }

  return (
    <div className="bg-[#15181d] border border-stone-700/40 rounded-2xl p-6 space-y-2">
      <div className="mb-2">
        <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-1">Preferencias de correo</p>
        <h3 className="font-serif text-xl text-amber-100/95">Seguimiento por email</h3>
      </div>
      <div>
        {TOGGLES.map(({ key, label, description }) => (
          <ToggleRow
            key={key}
            label={label}
            description={description}
            checked={prefs[key]}
            onChange={() => toggle(key)}
            saving={saving === key}
          />
        ))}
      </div>
      {error && (
        <p className="text-red-300 text-xs mt-2" role="alert">{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Integrar en CuentaPage**

Edit `frontend/src/cuenta/CuentaPage.tsx`. Add import:
```typescript
import { EmailPreferencesSection } from './EmailPreferencesSection';
```

After `<SubscriptionSection ... />`:
```tsx
<EmailPreferencesSection />
```

- [ ] **Step 3: Build check**

```bash
cd frontend && npm run build
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/cuenta/EmailPreferencesSection.tsx frontend/src/cuenta/CuentaPage.tsx
git commit -m "feat(emails-ui): EmailPreferencesSection con 4 toggles en CuentaPage"
```

---

## Task 14: Smoke test e2e

**Files:** ninguno

This task is manual verification with the server running.

- [ ] **Step 1: Setup .env**

In `backend/.env`, ensure:
```
EMAILS_ENABLED=true
RESEND_API_KEY=re_test_xxx   # use a Resend sandbox key
FROM_EMAIL="Kabbalah Test <noreply@your-domain.com>"
RESEND_WEBHOOK_SECRET=whsec_test
```

(If you don't have a real Resend account yet, the kill-switch path was tested — you can leave `EMAILS_ENABLED=false` and only the scheduler will not start; everything else works for code verification.)

- [ ] **Step 2: Start backend**

```bash
cd backend
venv\Scripts\uvicorn.exe main:app --reload --port 8000
```

Expected log: `scheduler started with 4 jobs` if `EMAILS_ENABLED=true`.

- [ ] **Step 3: Start frontend**

```bash
cd frontend && npm run dev
```

- [ ] **Step 4: Sanity flow**

1. Log in as a free user → Mi cuenta → no "Seguimiento por email" section visible (404 from `/email/preferences`).
2. Manually insert a Subscription + EmailPreferences row in DB for your user (or use the seeded `premium_user_headers` flow via a script).
3. Refresh Mi cuenta → "Seguimiento por email" section appears with 4 toggles all ON.
4. Click "Resumen semanal" off → toggle slides, PUT request fires, persists on reload.
5. Backend logs: at the next hour boundary, weekly_tick runs and silently skips (you're off).

- [ ] **Step 5: Trigger a manual send (optional, for visual QA)**

If you have Resend configured, fire a one-off in a python shell:

```bash
cd backend
venv\Scripts\python.exe -c "
import asyncio
from datetime import datetime, timezone
from database import AsyncSessionLocal
from sqlalchemy import select
from models import Usuario
from emails.sender import send_weekly_summary

async def main():
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(Usuario).where(Usuario.email == 'YOUR_EMAIL@x.com'))).scalars().first()
        msg_id = await send_weekly_summary(
            db, user=user,
            week_start=datetime.now(timezone.utc),
            week_end=datetime.now(timezone.utc),
            app_url='http://localhost:5173',
        )
        print('sent', msg_id)

asyncio.run(main())
"
```

Check your inbox.

- [ ] **Step 6: Commit (empty)**

```bash
git commit --allow-empty -m "test(emails): smoke e2e OK (sender + toggles + scheduler)"
```

---

## Self-Review

**1. Spec coverage (sección 10 del spec):**
- ✅ Stack Resend + APScheduler — Tasks 3, 4, 10
- ✅ 4 templates (weekly, monthly, imbalance, reminder) — Tasks 5, 6
- ✅ Footer común + link unsubscribe — Task 5
- ✅ Cron timezone-aware — Tasks 10, 11
- ✅ Idempotency keys — Tasks 1, 7
- ✅ Webhook Resend + auto-pause tras 3 bounces — Task 9
- ✅ Endpoints GET/PUT /email/preferences — Task 8
- ✅ Hook IA en Fase 1 (None, fallback) — Task 5
- ✅ Kill-switch global `EMAILS_ENABLED` — Tasks 3, 4
- ✅ UI: sección con 4 toggles en CuentaPage — Tasks 12, 13

**2. Placeholder scan:** Sin "TBD", sin "implementar después", todos los steps tienen código completo o comandos exactos.

**3. Type consistency:**
- `EmailLog` columns matchean entre Task 1 (migración) y Task 2 (modelo)
- `EmailPreferences` ya existe (Plan 1) — su shape se reutiliza en Tasks 8, 12, 13
- `idempotency_key` formato consistente: `{usuario_id}-{tipo}-{periodo}`
- Status enum: `queued | sent | delivered | bounced | complained | failed` — consistente en sender, webhook handler, modelo
- `email_type` valores: `weekly | monthly | imbalance | reminder` — consistente en sender, scheduler, templates

**4. Module name resolution:**
- Decisión documentada en Task 2: usar `backend/emails/` (plural) para evitar conflicto con stdlib `email`. Todos los imports posteriores usan `from emails.X`.

---

## Próximos pasos después de este plan

1. **Configurar cuenta Resend** y verificar dominio (DKIM + SPF + DMARC). Sin esto los emails caen a spam.
2. **Crear webhook endpoint en Resend dashboard** apuntando a `<ngrok>/webhooks/resend` y copiar el `whsec_*` a `.env`.
3. **Test de deliverability** real con un par de emails reales antes del launch.
4. **Fase 2 — wire del motor de IA**: cuando KSpace-AI esté listo, implementar `generate_insight()` realmente (POST `/ai/insight` interno).
5. **Apuntar `APP_URL` real** en `scheduler/jobs.py` (hardcoded ahora, mover a env var).
