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
