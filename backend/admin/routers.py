"""Endpoints del panel de administrador. Todos exigen require_admin."""
from fastapi import APIRouter, Depends

from admin.deps import require_admin
from models import Usuario

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/ping")
async def ping(_: Usuario = Depends(require_admin)):
    return {"ok": True}
