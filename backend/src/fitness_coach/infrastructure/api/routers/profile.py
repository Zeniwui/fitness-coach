"""Living Profile and Injury/Restriction API router (strictly isolated by Athlete)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from fitness_coach.application.use_cases.profile import (
    CreateInjuryUseCase,
    DeleteInjuryUseCase,
    GetLivingProfileUseCase,
    ListInjuriesUseCase,
    UpdateInjuryUseCase,
    UpsertLivingProfileUseCase,
)
from fitness_coach.domain.identity import AuthContext
from fitness_coach.domain.profile import (
    InjuryNotFoundError,
    InjuryStatus,
    ProfileValidationError,
)
from fitness_coach.infrastructure.api.deps import get_current_auth, get_db_session
from fitness_coach.infrastructure.api.schemas.profile import (
    CreateInjuryRequest,
    InjuryListResponse,
    InjuryResponse,
    LivingProfileResponse,
    UpdateInjuryRequest,
    UpsertLivingProfileRequest,
)
from fitness_coach.infrastructure.db.repositories.profile import SqlAlchemyProfileRepository

router = APIRouter(prefix="/api/v1/profile", tags=["profile"])


@router.get("", response_model=LivingProfileResponse)
async def get_living_profile(
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> LivingProfileResponse:
    repo = SqlAlchemyProfileRepository(session)
    snapshot = await GetLivingProfileUseCase(repo).execute(auth=auth)
    return LivingProfileResponse.from_snapshot(snapshot)


@router.put("", response_model=LivingProfileResponse)
async def upsert_living_profile(
    payload: UpsertLivingProfileRequest,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> LivingProfileResponse:
    repo = SqlAlchemyProfileRepository(session)
    use_case = UpsertLivingProfileUseCase(repo)
    try:
        snapshot = await use_case.execute(
            auth=auth,
            age=payload.age,
            sex=payload.sex,
            height_cm=payload.height_cm,
            base_weight_kg=payload.base_weight_kg,
            experience_level=payload.experience_level,
            primary_goal=payload.primary_goal,
            training_days_per_week=payload.training_days_per_week,
            session_duration_min=payload.session_duration_min,
            equipment=payload.equipment,
            allergies=payload.allergies,
            food_preferences=payload.food_preferences,
            training_approach=payload.training_approach,
            notes=payload.notes,
        )
        await session.commit()
    except ProfileValidationError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return LivingProfileResponse.from_snapshot(snapshot)


@router.get("/injuries", response_model=InjuryListResponse)
async def list_injuries(
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    status_filter: Annotated[InjuryStatus | None, Query(alias="status")] = None,
) -> InjuryListResponse:
    repo = SqlAlchemyProfileRepository(session)
    injuries = await ListInjuriesUseCase(repo).execute(auth=auth, status=status_filter)
    return InjuryListResponse(
        items=[InjuryResponse.from_domain(injury) for injury in injuries]
    )


@router.post(
    "/injuries",
    response_model=InjuryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_injury(
    payload: CreateInjuryRequest,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> InjuryResponse:
    repo = SqlAlchemyProfileRepository(session)
    use_case = CreateInjuryUseCase(repo)
    try:
        injury = await use_case.execute(
            auth=auth,
            body_part=payload.body_part,
            description=payload.description,
            severity=payload.severity,
        )
        await session.commit()
    except ProfileValidationError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return InjuryResponse.from_domain(injury)


@router.patch("/injuries/{injury_id}", response_model=InjuryResponse)
async def update_injury(
    injury_id: UUID,
    payload: UpdateInjuryRequest,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> InjuryResponse:
    repo = SqlAlchemyProfileRepository(session)
    use_case = UpdateInjuryUseCase(repo)
    try:
        injury = await use_case.execute(
            auth=auth,
            injury_id=injury_id,
            body_part=payload.body_part,
            description=payload.description,
            severity=payload.severity,
            status=payload.status,
            resolved_at=payload.resolved_at,
            resolution_notes=payload.resolution_notes,
            resolution_notes_provided="resolution_notes" in payload.model_fields_set,
        )
        await session.commit()
    except InjuryNotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ProfileValidationError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return InjuryResponse.from_domain(injury)


@router.delete("/injuries/{injury_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_injury(
    injury_id: UUID,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Response:
    repo = SqlAlchemyProfileRepository(session)
    try:
        await DeleteInjuryUseCase(repo).execute(auth=auth, injury_id=injury_id)
        await session.commit()
    except InjuryNotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
