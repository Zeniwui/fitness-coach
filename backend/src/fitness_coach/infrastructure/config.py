"""Application configuration loaded via environment variables."""

from __future__ import annotations

from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_INSECURE_JWT_SECRET = "dev-insecure-jwt-secret-change-in-production"


class Settings(BaseSettings):
    """Typed runtime settings for Fitness Coach backend."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Fitness Coach API"
    environment: str = "development"
    database_url: str = (
        "postgresql+asyncpg://fitness_coach:fitness_coach@localhost:5432/fitness_coach"
    )
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # Auth (Supabase Auth JWT verification; public signup disabled)
    supabase_jwt_secret: str = DEFAULT_INSECURE_JWT_SECRET
    supabase_jwt_audience: str = "authenticated"
    invitation_ttl_hours: int = 72

    # Supabase Storage (ADR-0003: private isolated buckets in production)
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    supabase_athlete_bucket: str = "athlete-private"
    supabase_curator_bucket: str = "curator-pdfs"

    # Bootstrap Curator (explicit allowlist required to enable first curator onboarding)
    bootstrap_curator_email: str | None = None
    bootstrap_curator_subject: str | None = None

    # AI Provider (ADR-0003: swappable via env vars without domain changes)
    ai_provider: str = "google_ai_studio"
    ai_fast_model: str = "gemini-2.0-flash"
    ai_reasoning_model: str = "gemini-2.5-pro"
    ai_base_url: str | None = None
    google_api_key: str | None = None
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    embedding_provider: str = "google_ai_studio"
    embedding_model: str = "text-embedding-004"

    @model_validator(mode="after")
    def _validate_security_invariants(self) -> Settings:
        env = self.environment.strip().lower()
        if env not in ("development", "test"):
            if (
                not self.supabase_jwt_secret
                or self.supabase_jwt_secret == DEFAULT_INSECURE_JWT_SECRET
            ):
                raise ValueError(
                    "supabase_jwt_secret must be explicitly configured outside "
                    "development/test environments."
                )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
