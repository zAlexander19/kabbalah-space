"""Authentication primitives: hashing, JWT, schemas, get_current_user dependency.

Endpoints (POST /auth/register, POST /auth/login) live in main.py and use
helpers from this module.
"""
from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import Settings, get_settings
from database import get_db
from models import Usuario


# ---------- Pydantic schemas ----------

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    nombre: str = Field(min_length=1, max_length=100)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    nombre: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------- Password hashing (bcrypt direct, no passlib) ----------

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ---------- JWT ----------

def create_access_token(user_id: str, settings: Settings) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expires_minutes)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str, settings: Settings) -> str:
    """Returns the user_id (sub) or raises JWTError."""
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    user_id = payload.get("sub")
    if not isinstance(user_id, str) or not user_id:
        raise JWTError("missing sub claim")
    return user_id


# ---------- FastAPI dependency ----------

bearer_scheme = HTTPBearer(auto_error=False)

CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Credenciales inválidas",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Usuario:
    if creds is None or creds.scheme.lower() != "bearer":
        raise CREDENTIALS_ERROR
    try:
        user_id = decode_access_token(creds.credentials, settings)
    except JWTError:
        raise CREDENTIALS_ERROR

    user = (await db.execute(select(Usuario).where(Usuario.id == user_id))).scalars().first()
    if user is None:
        raise CREDENTIALS_ERROR
    return user
