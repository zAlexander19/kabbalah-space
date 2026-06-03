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


class StatsUsuarios(BaseModel):
    total: int
    nuevos_hoy: int
    nuevos_semana: int
    nuevos_mes: int
    por_provider: dict[str, int]
    premium: int


class StatsActividad(BaseModel):
    reflexiones_total: int
    respuestas_total: int
    actividades_total: int
    usuarios_activos_7d: int
    usuarios_activos_30d: int
    gcal_sync_activos: int


class StatsPremium(BaseModel):
    activos: int
    trial: int
    cancelados: int
    por_plan: dict[str, int]


class StatsOut(BaseModel):
    usuarios: StatsUsuarios
    actividad: StatsActividad
    premium: StatsPremium
