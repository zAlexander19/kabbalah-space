"""Application settings loaded from environment / .env file.

Uses pydantic-settings to provide a single, typed source of configuration.
Handlers can inject Settings via `Depends(get_settings)`; modules that run
at import time can call `get_settings()` directly.
"""
from functools import lru_cache
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---------- Database ----------
    database_url: str = "sqlite+aiosqlite:///./kabbalah.db"

    @field_validator("database_url")
    @classmethod
    def _normalize_db_url(cls, v: str) -> str:
        """Render/Heroku entregan 'postgres://' o 'postgresql://'; SQLAlchemy async
        necesita el driver asyncpg explícito. Normalizamos para que DATABASE_URL
        funcione tal cual viene del proveedor."""
        if v.startswith("postgres://"):
            return "postgresql+asyncpg://" + v[len("postgres://"):]
        if v.startswith("postgresql://"):
            return "postgresql+asyncpg://" + v[len("postgresql://"):]
        return v

    @property
    def sqlalchemy_url(self) -> str:
        """URL para el engine async, sin params que asyncpg no entiende.

        Los Postgres gestionados (DigitalOcean, Render, Heroku) entregan la URL
        con `?sslmode=require` (y a veces `channel_binding`). asyncpg no acepta
        `sslmode` en la URL —> lo sacamos acá y lo traducimos a connect_args
        (ver `db_connect_args`). Para SQLite devuelve la URL tal cual.
        """
        if not self.database_url.startswith("postgresql+asyncpg"):
            return self.database_url
        parts = urlsplit(self.database_url)
        query = {k: v for k, v in parse_qsl(parts.query) if k not in ("sslmode", "channel_binding")}
        return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))

    @property
    def db_connect_args(self) -> dict:
        """Traduce el `sslmode` de la URL (libpq) al parámetro `ssl` de asyncpg."""
        if not self.database_url.startswith("postgresql+asyncpg"):
            return {}
        sslmode = dict(parse_qsl(urlsplit(self.database_url).query)).get("sslmode")
        if sslmode and sslmode != "disable":
            return {"ssl": "require"}
        return {}

    # ---------- Entorno ----------
    # "development" | "production". En producción la app se niega a arrancar
    # con secretos default (ver assert_production_secrets).
    environment: str = "development"

    # ---------- CORS ----------
    # Comma-separated list of allowed origins. Default = Vite dev server only.
    cors_origins: str = "http://localhost:5173"

    # ---------- JWT (used by issue #7) ----------
    jwt_secret: str = "change-me-in-prod"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 24

    # ---------- LLM / KSpace-AI ----------
    # "stub" | "gemini"
    llm_provider: str = "stub"
    gemini_api_key: str = ""

    # ---------- Google OAuth (used by issue #24) ----------
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/auth/google/callback"
    frontend_url: str = "http://localhost:5173"

    # ---------- Google Calendar sync ----------
    fernet_key: str = ""
    gcal_redirect_uri: str = "http://localhost:8000/sync/google/callback"

    # ---------- Lemonsqueezy (premium / billing) ----------
    lemonsqueezy_api_key: str = ""
    lemonsqueezy_store_id: str = ""
    lemonsqueezy_variant_monthly: str = ""
    lemonsqueezy_variant_yearly: str = ""
    lemonsqueezy_webhook_secret: str = ""

    # Resend (transactional emails)
    resend_api_key: str = ""
    resend_webhook_secret: str = ""
    from_email: str = "Kabbalah Space <hola@kabbalahspace.app>"
    emails_enabled: bool = False  # kill switch — set to True to enable the scheduler + sender
    # El scheduler de emails corre in-process. Si escalás a varios workers/instancias,
    # dejá run_scheduler=True en UNA sola y False en el resto (si no, emails duplicados).
    run_scheduler: bool = True

    # ---------- Admin ----------
    # Emails (separados por coma) que se promueven a admin al arrancar la app.
    admin_bootstrap_emails: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def google_oauth_configured(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def gcal_sync_configured(self) -> bool:
        return bool(self.fernet_key) and self.google_oauth_configured

    @property
    def lemonsqueezy_configured(self) -> bool:
        return bool(self.lemonsqueezy_api_key and self.lemonsqueezy_store_id)

    @property
    def resend_configured(self) -> bool:
        return bool(self.resend_api_key and self.from_email)


INSECURE_JWT_DEFAULT = "change-me-in-prod"


def assert_production_secrets(settings: "Settings") -> None:
    """Aborta el arranque si estamos en producción con secretos default.

    Un JWT_SECRET conocido permite forjar tokens de cualquier usuario
    (incluido admin), así que preferimos no arrancar a arrancar inseguro.
    """
    if settings.environment.strip().lower() != "production":
        return
    if settings.jwt_secret == INSECURE_JWT_DEFAULT:
        raise RuntimeError(
            "JWT_SECRET sigue en el valor default inseguro. "
            "Configurá un secreto fuerte antes de desplegar a producción."
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
