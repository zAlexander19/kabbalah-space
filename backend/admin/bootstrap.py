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
