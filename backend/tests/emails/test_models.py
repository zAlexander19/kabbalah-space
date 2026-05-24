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
