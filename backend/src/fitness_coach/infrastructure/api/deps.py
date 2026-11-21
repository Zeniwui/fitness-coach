"""FastAPI dependency injection providers for DB sessions, AuthContext, and testing seams."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from fitness_coach.application.ports.ai_provider import AIProviderPort
from fitness_coach.application.ports.identity_storage import (
    BinaryStoragePort,
    IdentityVerifierPort,
    VerifiedIdentity,
)
from fitness_coach.application.ports.scientific_sources import ScientificSourcesPort
from fitness_coach.domain.identity import AuthContext, ForbiddenError, UnauthorizedError
from fitness_coach.infrastructure.db.repositories.identity import SqlAlchemyIdentityRepository

bearer_scheme = HTTPBearer(auto_error=False)


async def get_db_session(request: Request) -> AsyncIterator[AsyncSession]:
    session_factory = request.app.state.session_factory
    async with session_factory() as session:
        yield session


def get_identity_verifier(request: Request) -> IdentityVerifierPort:
    return request.app.state.identity_verifier


def get_binary_storage(request: Request) -> BinaryStoragePort:
    return request.app.state.binary_storage


def get_ai_provider(request: Request) -> AIProviderPort:
    return request.app.state.ai_provider


def get_scientific_sources(request: Request) -> ScientificSourcesPort:
    return request.app.state.scientific_sources


async def get_verified_identity(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    verifier: Annotated[IdentityVerifierPort, Depends(get_identity_verifier)],
) -> VerifiedIdentity:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Se requiere iniciar sesión para acceder a este recurso.",
        )
    try:
        return await verifier.verify_token(credentials.credentials)
    except UnauthorizedError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc


async def get_current_auth(
    verified: Annotated[VerifiedIdentity, Depends(get_verified_identity)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AuthContext:
    repo = SqlAlchemyIdentityRepository(session)
    athlete = await repo.get_athlete_by_subject(verified.auth_subject)
    if athlete is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cuenta no registrada. Se requiere una invitación válida.",
        )
    return athlete.to_auth_context()


async def require_curator(
    auth: Annotated[AuthContext, Depends(get_current_auth)],
) -> AuthContext:
    try:
        auth.require_curator()
    except ForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    return auth
