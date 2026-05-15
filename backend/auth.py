"""Authentication primitives: hashing, JWT, schemas, get_current_user dependency.

Endpoints (POST /auth/register, POST /auth/login) live in main.py and use
helpers from this module.
"""
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional, Union
from urllib.parse import urlencode

import bcrypt
import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel, ConfigDict, EmailStr, Field
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
    provider: str = "email"


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------- Password hashing (bcrypt direct, no passlib) ----------

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str | None) -> bool:
    """Returns False (instead of crashing) when hashed is None — i.e. when the
    user authenticates via OAuth and has no local password set. Login attempts
    with email/password against an OAuth account fall through to a clean 401.
    """
    if not hashed:
        return False
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


# =================================================================== OAUTH

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_SCOPES = "openid email profile"
STATE_TOKEN_TTL_MINUTES = 10


# ---------- State token (CSRF protection) ----------

def create_state_token(
    settings: Settings,
    purpose: str = "oauth_state",
    extra_claims: Optional[dict] = None,
) -> str:
    """Signed JWT used as the OAuth `state` parameter.

    The signature ties the state to OUR backend (any tampering breaks it),
    and the short TTL prevents replay if a redirect URL leaks. The `purpose`
    field distinguishes login flow ("oauth_state") from sync flow
    ("gcal_sync_state") and prevents cross-flow attacks. The `extra_claims`
    let the gcal flow embed the user_id so the callback can identify the
    user without an auth header (the callback is a redirect from Google).
    """
    payload = {
        "nonce": secrets.token_urlsafe(16),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=STATE_TOKEN_TTL_MINUTES),
        "purpose": purpose,
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_state_token(
    state: str,
    settings: Settings,
    expected_purpose: str = "oauth_state",
) -> Optional[dict]:
    """Returns the decoded payload if valid and purpose matches; else None.

    Callers that only need a yes/no can do `bool(verify_state_token(...))`.
    Callers that need claims (like the gcal callback reading user_id) can
    pull them from the returned dict.
    """
    try:
        payload = jwt.decode(state, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    if payload.get("purpose") != expected_purpose:
        return None
    return payload


# ---------- Google API calls ----------

def build_google_authorize_url(settings: Settings, state: str) -> str:
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": GOOGLE_SCOPES,
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def exchange_google_code(code: str, settings: Settings) -> dict:
    """Exchange the OAuth `code` for tokens. Raises httpx.HTTPError on failure."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        resp.raise_for_status()
        return resp.json()


async def fetch_google_userinfo(access_token: str) -> dict:
    """Returns the userinfo dict — at minimum sub, email, name (when scopes match)."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json()


# ---------- Find / create OAuth user ----------

class EmailCollisionError(Exception):
    """Raised when an OAuth provider returns an email that already exists with a
    DIFFERENT provider — we don't auto-link accounts in MVP."""


async def find_or_create_google_user(
    db: AsyncSession,
    google_sub: str,
    email: str,
    name: str,
) -> Usuario:
    """Look up by (provider='google', provider_id=sub). If not found, create
    a new user. If the email exists under a different provider → raise
    EmailCollisionError.
    """
    user = (await db.execute(
        select(Usuario).where(
            Usuario.provider == "google",
            Usuario.provider_id == google_sub,
        )
    )).scalars().first()
    if user:
        return user

    email_match = (await db.execute(
        select(Usuario).where(Usuario.email == email)
    )).scalars().first()
    if email_match:
        raise EmailCollisionError(
            f"El email {email} ya está registrado con provider='{email_match.provider}'"
        )

    user = Usuario(
        email=email,
        nombre=name or email.split("@")[0],
        provider="google",
        provider_id=google_sub,
        password_hash=None,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
