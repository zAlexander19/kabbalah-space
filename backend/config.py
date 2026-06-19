"""Application settings loaded from environment / .env file.

Uses pydantic-settings to provide a single, typed source of configuration.
Handlers can inject Settings via `Depends(get_settings)`; modules that run
at import time can call `get_settings()` directly.
"""
from functools import lru_cache

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


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
