"""FastAPI router for Nutrition Phases and Weekly Check-ins (#8)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from fitness_coach.application.ports.ai_provider import AIProviderPort
from fitness_coach.application.use_cases.nutrition import (
    ApplyCheckInAdjustmentUseCase,
    CompleteNutritionPhaseUseCase,
    CreateNutritionPhaseUseCase,
    DismissCheckInAdjustmentUseCase,
    ListNutritionPhasesUseCase,
    ListWeeklyCheckInsUseCase,
    SubmitWeeklyCheckInUseCase,
    UpdateNutritionPhaseUseCase,
)
from fitness_coach.domain.identity import AuthContext
from fitness_coach.domain.nutrition import (
    CheckInNotFoundError,
    InvalidAdjustmentStateError,
    InvalidNutritionPhaseStateError,
    NutritionPhaseNotFoundError,
    NutritionValidationError,
)
from fitness_coach.infrastructure.api.deps import (
    get_ai_provider,
    get_current_auth,
    get_db_session,
)
from fitness_coach.infrastructure.api.schemas.nutrition import (
    ApplyCheckInAdjustmentResponse,
    CompleteNutritionPhaseRequest,
    CreateNutritionPhaseRequest,
    CreateWeeklyCheckInRequest,
    NutritionPhaseResponse,
    UpdateNutritionPhaseRequest,
    WeeklyCheckInResponse,
)
from fitness_coach.infrastructure.db.repositories.knowledge import SqlAlchemyKnowledgeRepository
from fitness_coach.infrastructure.db.repositories.nutrition import SqlAlchemyNutritionRepository
from fitness_coach.infrastructure.db.repositories.profile import SqlAlchemyProfileRepository

router = APIRouter(tags=["nutrition"])


@router.get(
    "/api/v1/nutrition/phases",
    response_model=list[NutritionPhaseResponse],
)
async def list_nutrition_phases(
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[NutritionPhaseResponse]:
    use_case = ListNutritionPhasesUseCase(SqlAlchemyNutritionRepository(session))
    phases = await use_case.execute(auth=auth)
    return [NutritionPhaseResponse.from_domain(p) for p in phases]


@router.post(
    "/api/v1/nutrition/phases",
    response_model=NutritionPhaseResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_nutrition_phase(
    body: CreateNutritionPhaseRequest,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> NutritionPhaseResponse:
    use_case = CreateNutritionPhaseUseCase(SqlAlchemyNutritionRepository(session))
    try:
        phase = await use_case.execute(
            auth=auth,
            phase_type=body.phase_type,
            start_date=body.start_date,
            target_calories=body.target_calories,
            protein_g=body.protein_g,
            fat_g=body.fat_g,
            carbs_g=body.carbs_g,
            target_weekly_weight_change_kg=body.target_weekly_weight_change_kg,
            notes=body.notes,
        )
    except NutritionValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    await session.commit()
    return NutritionPhaseResponse.from_domain(phase)


@router.patch(
    "/api/v1/nutrition/phases/{phase_id}",
    response_model=NutritionPhaseResponse,
)
async def update_nutrition_phase(
    phase_id: UUID,
    body: UpdateNutritionPhaseRequest,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> NutritionPhaseResponse:
    use_case = UpdateNutritionPhaseUseCase(SqlAlchemyNutritionRepository(session))
    try:
        phase = await use_case.execute(
            auth=auth,
            phase_id=phase_id,
            phase_type=body.phase_type,
            target_calories=body.target_calories,
            protein_g=body.protein_g,
            fat_g=body.fat_g,
            carbs_g=body.carbs_g,
            target_weekly_weight_change_kg=body.target_weekly_weight_change_kg,
            notes=body.notes,
            update_notes="notes" in body.model_fields_set,
        )
    except NutritionPhaseNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except InvalidNutritionPhaseStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except NutritionValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    await session.commit()
    return NutritionPhaseResponse.from_domain(phase)


@router.post(
    "/api/v1/nutrition/phases/{phase_id}/complete",
    response_model=NutritionPhaseResponse,
)
async def complete_nutrition_phase(
    phase_id: UUID,
    body: CompleteNutritionPhaseRequest,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> NutritionPhaseResponse:
    use_case = CompleteNutritionPhaseUseCase(SqlAlchemyNutritionRepository(session))
    try:
        phase = await use_case.execute(
            auth=auth,
            phase_id=phase_id,
            end_date=body.end_date,
        )
    except NutritionPhaseNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except InvalidNutritionPhaseStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except NutritionValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    await session.commit()
    return NutritionPhaseResponse.from_domain(phase)


@router.get(
    "/api/v1/nutrition/checkins",
    response_model=list[WeeklyCheckInResponse],
)
async def list_weekly_checkins(
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[WeeklyCheckInResponse]:
    use_case = ListWeeklyCheckInsUseCase(SqlAlchemyNutritionRepository(session))
    checkins = await use_case.execute(auth=auth)
    return [WeeklyCheckInResponse.from_domain(c) for c in checkins]


@router.post(
    "/api/v1/nutrition/checkins",
    response_model=WeeklyCheckInResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_weekly_checkin(
    body: CreateWeeklyCheckInRequest,
    response: Response,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    ai_provider: Annotated[AIProviderPort, Depends(get_ai_provider)],
) -> WeeklyCheckInResponse:
    use_case = SubmitWeeklyCheckInUseCase(
        nutrition_repo=SqlAlchemyNutritionRepository(session),
        profile_repo=SqlAlchemyProfileRepository(session),
        knowledge_repo=SqlAlchemyKnowledgeRepository(session),
        ai_provider=ai_provider,
    )
    try:
        checkin, created = await use_case.execute(
            auth=auth,
            checkin_date=body.checkin_date,
            idempotency_key=body.idempotency_key,
            average_weight_kg=body.average_weight_kg,
            daily_weights=body.daily_weights,
            body_measurements=body.body_measurements,
            adherence_score=body.adherence_score,
            sleep_quality=body.sleep_quality,
            energy_level=body.energy_level,
            hunger_level=body.hunger_level,
            recovery_score=body.recovery_score,
            perceived_fatigue=body.perceived_fatigue,
            performance_notes=body.performance_notes,
        )
    except NutritionValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    if created:
        await session.commit()
        response.status_code = status.HTTP_201_CREATED
    else:
        response.status_code = status.HTTP_200_OK
    return WeeklyCheckInResponse.from_domain(checkin)


@router.post(
    "/api/v1/nutrition/checkins/{checkin_id}/apply-adjustment",
    response_model=ApplyCheckInAdjustmentResponse,
)
async def apply_checkin_adjustment(
    checkin_id: UUID,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ApplyCheckInAdjustmentResponse:
    use_case = ApplyCheckInAdjustmentUseCase(SqlAlchemyNutritionRepository(session))
    try:
        checkin, phase = await use_case.execute(auth=auth, checkin_id=checkin_id)
    except (CheckInNotFoundError, NutritionPhaseNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except InvalidAdjustmentStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except NutritionValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    await session.commit()
    return ApplyCheckInAdjustmentResponse(
        checkin=WeeklyCheckInResponse.from_domain(checkin),
        phase=NutritionPhaseResponse.from_domain(phase),
    )


@router.post(
    "/api/v1/nutrition/checkins/{checkin_id}/dismiss-adjustment",
    response_model=WeeklyCheckInResponse,
)
async def dismiss_checkin_adjustment(
    checkin_id: UUID,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> WeeklyCheckInResponse:
    use_case = DismissCheckInAdjustmentUseCase(SqlAlchemyNutritionRepository(session))
    try:
        checkin = await use_case.execute(auth=auth, checkin_id=checkin_id)
    except CheckInNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except InvalidAdjustmentStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    await session.commit()
    return WeeklyCheckInResponse.from_domain(checkin)
