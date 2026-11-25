"""Identity & Curator Invitation API router."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from fitness_coach.application.ports.identity_storage import VerifiedIdentity
from fitness_coach.application.use_cases.identity import (
    BootstrapCuratorUseCase,
    CreateInvitationUseCase,
    ListInvitationsUseCase,
    RedeemInvitationUseCase,
    RevokeInvitationUseCase,
)
from fitness_coach.domain.identity import (
    AthleteAlreadyExistsError,
    AuthContext,
    ForbiddenError,
    InvalidInvitationError,
    InvitationAlreadyAcceptedError,
    InvitationNotFoundError,
)
from fitness_coach.infrastructure.api.deps import (
    get_current_auth,
    get_db_session,
    get_verified_identity,
    require_curator,
)
from fitness_coach.infrastructure.api.schemas.identity import (
    AuthMeResponse,
    BootstrapCuratorRequest,
    CreateInvitationRequest,
    CreateInvitationResponse,
    InvitationListResponse,
    InvitationSummaryResponse,
    RedeemInvitationRequest,
)
from fitness_coach.infrastructure.config import Settings
from fitness_coach.infrastructure.db.repositories.identity import SqlAlchemyIdentityRepository

router = APIRouter(prefix="/api/v1", tags=["identity"])


@router.get("/auth/me", response_model=AuthMeResponse)
async def get_auth_me(
    auth: Annotated[AuthContext, Depends(get_current_auth)],
) -> AuthMeResponse:
    return AuthMeResponse.from_auth_context(auth)


@router.post(
    "/auth/invitations/redeem",
    response_model=AuthMeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def redeem_invitation(
    payload: RedeemInvitationRequest,
    verified: Annotated[VerifiedIdentity, Depends(get_verified_identity)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AuthMeResponse:
    repo = SqlAlchemyIdentityRepository(session)
    use_case = RedeemInvitationUseCase(repo)
    try:
        athlete = await use_case.execute(
            verified=verified,
            raw_token=payload.token,
            display_name=payload.display_name,
        )
        await session.commit()
    except (InvalidInvitationError, AthleteAlreadyExistsError) as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return AuthMeResponse.from_athlete(athlete)


@router.post(
    "/auth/bootstrap-curator",
    response_model=AuthMeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def bootstrap_curator(
    payload: BootstrapCuratorRequest,
    request: Request,
    verified: Annotated[VerifiedIdentity, Depends(get_verified_identity)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AuthMeResponse:
    settings: Settings = request.app.state.settings
    repo = SqlAlchemyIdentityRepository(session)
    use_case = BootstrapCuratorUseCase(
        repo,
        bootstrap_email=settings.bootstrap_curator_email,
        bootstrap_subject=settings.bootstrap_curator_subject,
    )
    try:
        athlete = await use_case.execute(
            verified=verified,
            display_name=payload.display_name,
        )
        await session.commit()
    except ForbiddenError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    return AuthMeResponse.from_athlete(athlete)


@router.get("/curator/invitations", response_model=InvitationListResponse)
async def list_invitations(
    auth: Annotated[AuthContext, Depends(require_curator)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> InvitationListResponse:
    repo = SqlAlchemyIdentityRepository(session)
    invitations = await ListInvitationsUseCase(repo).execute(auth=auth)
    return InvitationListResponse(
        items=[InvitationSummaryResponse.from_domain(inv) for inv in invitations]
    )


@router.post(
    "/curator/invitations",
    response_model=CreateInvitationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_invitation(
    payload: CreateInvitationRequest,
    request: Request,
    auth: Annotated[AuthContext, Depends(require_curator)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CreateInvitationResponse:
    settings: Settings = request.app.state.settings
    repo = SqlAlchemyIdentityRepository(session)
    use_case = CreateInvitationUseCase(repo, ttl_hours=settings.invitation_ttl_hours)
    try:
        invitation, raw_token = await use_case.execute(
            auth=auth,
            email=payload.email,
            roles=frozenset(payload.roles),
        )
        await session.commit()
    except (InvalidInvitationError, AthleteAlreadyExistsError) as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    summary = InvitationSummaryResponse.from_domain(invitation)
    return CreateInvitationResponse(**summary.model_dump(), invitation_token=raw_token)


@router.delete(
    "/curator/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_invitation(
    invitation_id: UUID,
    auth: Annotated[AuthContext, Depends(require_curator)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Response:
    repo = SqlAlchemyIdentityRepository(session)
    use_case = RevokeInvitationUseCase(repo)
    try:
        await use_case.execute(auth=auth, invitation_id=invitation_id)
        await session.commit()
    except InvitationNotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except InvitationAlreadyAcceptedError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
