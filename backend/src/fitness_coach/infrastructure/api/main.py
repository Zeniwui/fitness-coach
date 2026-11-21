"""FastAPI application factory."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from fitness_coach.application.ports.ai_provider import AIProviderPort
from fitness_coach.application.ports.identity_storage import (
    BinaryStoragePort,
    IdentityVerifierPort,
)
from fitness_coach.application.ports.scientific_sources import ScientificSourcesPort
from fitness_coach.infrastructure.ai.provider import build_ai_provider
from fitness_coach.infrastructure.api.routers.coach import router as coach_router
from fitness_coach.infrastructure.api.routers.curation import router as curation_router
from fitness_coach.infrastructure.api.routers.identity import router as identity_router
from fitness_coach.infrastructure.api.routers.knowledge import router as knowledge_router
from fitness_coach.infrastructure.api.routers.monthly_cut import router as monthly_cut_router
from fitness_coach.infrastructure.api.routers.profile import router as profile_router
from fitness_coach.infrastructure.api.routers.training import router as training_router
from fitness_coach.infrastructure.api.schemas.identity import HealthResponse
from fitness_coach.infrastructure.auth.supabase_jwt import SupabaseJWTVerifier
from fitness_coach.infrastructure.config import Settings, get_settings
from fitness_coach.infrastructure.db.session import create_engine, create_session_factory
from fitness_coach.infrastructure.storage.local_storage import InMemoryBinaryStorage


def create_app(
    *,
    settings: Settings | None = None,
    identity_verifier: IdentityVerifierPort | None = None,
    binary_storage: BinaryStoragePort | None = None,
    ai_provider: AIProviderPort | None = None,
    scientific_sources: ScientificSourcesPort | None = None,
) -> FastAPI:
    resolved_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = create_engine(resolved_settings.database_url)
        app.state.engine = engine
        app.state.session_factory = create_session_factory(engine)
        yield
        await engine.dispose()

    app = FastAPI(
        title=resolved_settings.app_name,
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.state.settings = resolved_settings
    app.state.identity_verifier = identity_verifier or SupabaseJWTVerifier(
        jwt_secret=resolved_settings.supabase_jwt_secret,
        audience=resolved_settings.supabase_jwt_audience,
    )
    app.state.binary_storage = binary_storage or InMemoryBinaryStorage()
    app.state.ai_provider = ai_provider or build_ai_provider(resolved_settings)
    app.state.scientific_sources = scientific_sources

    @app.get("/api/v1/health", response_model=HealthResponse, tags=["system"])
    async def health() -> HealthResponse:
        return HealthResponse(status="ok", service="fitness-coach-api")

    app.include_router(identity_router)
    app.include_router(profile_router)
    app.include_router(knowledge_router)
    app.include_router(curation_router)
    app.include_router(monthly_cut_router)
    app.include_router(coach_router)
    app.include_router(training_router)

    return app


app = create_app()
