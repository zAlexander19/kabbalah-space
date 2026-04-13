import uuid

from sqlalchemy import Column, String, Text, Integer, ForeignKey, DateTime

from sqlalchemy.sql import func

from database import Base



def generate_uuid():

    return str(uuid.uuid4())



class Usuario(Base):

    __tablename__ = "usuarios"

    id = Column(String(36), primary_key=True, default=generate_uuid)

    nombre = Column(String(100), nullable=False)

    email = Column(String(255), unique=True, nullable=False, index=True)

    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())



class Sefira(Base):

    __tablename__ = "sefirot"

    id = Column(String(50), primary_key=True) # Using the string id like "keter"

    nombre = Column(String(50), nullable=False, unique=True)

    pilar = Column(String(50), nullable=False)

    descripcion = Column(Text)



class RegistroDiario(Base):

    __tablename__ = "registros_diario"

    id = Column(String(36), primary_key=True, default=generate_uuid)

    usuario_id = Column(String(36), ForeignKey("usuarios.id", ondelete="CASCADE"))

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

    usuario_id = Column(String(36), ForeignKey('usuarios.id', ondelete='CASCADE'))

    pregunta_id = Column(String(36), ForeignKey('preguntas_sefirot.id', ondelete='CASCADE'), nullable=False)

    respuesta_texto = Column(Text, nullable=False)

    fecha_registro = Column(DateTime(timezone=True), server_default=func.now())


class Actividad(Base):

    __tablename__ = "actividades"

    id = Column(String(36), primary_key=True, default=generate_uuid)

    usuario_id = Column(String(36), ForeignKey("usuarios.id", ondelete="CASCADE"))

    titulo = Column(String(200), nullable=False)

    descripcion = Column(Text)

    inicio = Column(DateTime(timezone=True), nullable=False)

    fin = Column(DateTime(timezone=True), nullable=False)

    estado = Column(String(20), nullable=False, default="pendiente")

    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())

    fecha_actualizacion = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ActividadSefira(Base):

    __tablename__ = "actividades_sefirot"

    actividad_id = Column(String(36), ForeignKey("actividades.id", ondelete="CASCADE"), primary_key=True)

    sefira_id = Column(String(50), ForeignKey("sefirot.id", ondelete="CASCADE"), primary_key=True)



