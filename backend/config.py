"""Application settings loaded from environment / .env file.

Uses pydantic-settings to provide a single, typed source of configuration.
Handlers can inject Settings via `Depends(get_settings)`; modules that run
at import time can call `get_settings()` directly.
"""
from functools import lru_cache

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

    # ---------- CORS ----------
    # Comma-separated list of allowed origins. Default = Vite dev server only.
    cors_origins: str = "http://localhost:5173"

    # ---------- JWT (used by issue #7) ----------
    jwt_secret: str = "change-me-in-prod"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 24

    # ---------- LLM (used by issue #9) ----------
    # "stub" | "claude" | "gemini"
    llm_provider: str = "stub"
    llm_api_key: str = ""

    # ---------- Google OAuth (used by issue #24) ----------
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/auth/google/callback"
    frontend_url: str = "http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def google_oauth_configured(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
