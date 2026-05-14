import uuid

from sqlalchemy import Column, String, Text, Integer, ForeignKey, DateTime, Index, Boolean

from sqlalchemy.sql import func

from database import Base



def generate_uuid():

    return str(uuid.uuid4())



class Usuario(Base):

    __tablename__ = "usuarios"

    id = Column(String(36), primary_key=True, default=generate_uuid)

    nombre = Column(String(100), nullable=False)

    email = Column(String(255), unique=True, nullable=False, index=True)

    # Auth provider: "email" (password local) | "google" | future: apple, etc.
    provider = Column(String(50), nullable=False, server_default="email")

    # External id from the OAuth provider (e.g. Google's `sub`). NULL for provider="email".
    provider_id = Column(String(255), nullable=True)

    # NULL when the user authenticates via OAuth (no local password).
    password_hash = Column(String(255), nullable=True)

    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())

    google_refresh_token_enc = Column(Text, nullable=True)
    google_calendar_id       = Column(String(255), nullable=True)
    gcal_sync_enabled        = Column(Boolean, nullable=False, server_default="false")

    __table_args__ = (
        Index("ix_usuarios_provider_provider_id", "provider", "provider_id"),
    )



class Sefira(Base):

    __tablename__ = "sefirot"

    id = Column(String(50), primary_key=True) # Using the string id like "keter"

    nombre = Column(String(50), nullable=False, unique=True)

    pilar = Column(String(50), nullable=False)

    descripcion = Column(Text)



class RegistroDiario(Base):

    __tablename__ = "registros_diario"

    id = Column(String(36), primary_key=True, default=generate_uuid)

    usuario_id = Column(String(36), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)

    sefira_id = Column(String(50), ForeignKey("sefirot.id"))

    reflexion_texto = Column(Text, nullable=False)

    puntuacion_usuario = Column(Integer)

    puntuacion_ia = Column(Integer)

    fecha_registro = Column(DateTime(timezone=True), server_default=func.now())



class PreguntaSefira(Base):

    __tablename__ = "preguntas_sefirot"

    id = Column(String(36), primary_key=True, default=generate_uuid)

    sefira_id = Column(String(50), ForeignKey("sefirot.id", ondelete="CASCADE"), nullable=False)

    texto_pregunta = Column(Text, nullable=False)

    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())

class RespuestaPregunta(Base):

    __tablename__ = 'respuestas_preguntas'

    id = Column(String(36), primary_key=True, default=generate_uuid)

    usuario_id = Column(String(36), ForeignKey('usuarios.id', ondelete='CASCADE'), nullable=False, index=True)

    pregunta_id = Column(String(36), ForeignKey('preguntas_sefirot.id', ondelete='CASCADE'), nullable=False)

    respuesta_texto = Column(Text, nullable=False)

    fecha_registro = Column(DateTime(timezone=True), server_default=func.now())


class Actividad(Base):

    __tablename__ = "actividades"

    id = Column(String(36), primary_key=True, default=generate_uuid)

    usuario_id = Column(String(36), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)

    titulo = Column(String(200), nullable=False)

    descripcion = Column(Text)

    inicio = Column(DateTime(timezone=True), nullable=False)

    fin = Column(DateTime(timezone=True), nullable=False)

    estado = Column(String(20), nullable=False, default="pendiente")

    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())

    fecha_actualizacion = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    serie_id = Column(String(36), nullable=True, index=True)

    rrule = Column(String(500), nullable=True)

    gcal_event_id  = Column(String(255), nullable=True, index=True)
    sync_status    = Column(String(20), nullable=False, server_default="pending")


class ActividadSefira(Base):

    __tablename__ = "actividades_sefirot"

    actividad_id = Column(String(36), ForeignKey("actividades.id", ondelete="CASCADE"), primary_key=True)

    sefira_id = Column(String(50), ForeignKey("sefirot.id", ondelete="CASCADE"), primary_key=True)



