from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class PreguntaCreateIn(BaseModel):
    sefira_id: str
    texto: str


class PreguntaUpdateIn(BaseModel):
    texto: str


class PreguntaReorderIn(BaseModel):
    ids: list[str]


class PreguntaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    sefira_id: str
    texto_pregunta: str
    orden: int
    fecha_creacion: Optional[datetime] = None


class UsuarioAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    nombre: str
    email: str
    provider: str
    is_admin: bool
    is_premium: bool
    fecha_creacion: Optional[datetime] = None


class UsuariosListOut(BaseModel):
    total: int
    items: list[UsuarioAdminOut]
