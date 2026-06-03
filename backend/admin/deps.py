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
