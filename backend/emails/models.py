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
