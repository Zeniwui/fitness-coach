"""FastAPI router for Training (#7): Mesocycles, Today's Session, Sessions & Volume/Deload."""

from __future__ import annotations

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from fitness_coach.application.ports.ai_provider import AIProviderPort
from fitness_coach.application.use_cases.training import (
    ActivateMesocycleUseCase,
    CreateMesocycleUseCase,
    CreateTrainingSessionUseCase,
    DeleteTrainingSessionUseCase,
    DraftMesocycleWithCoachUseCase,
    GetTodaySessionUseCase,
    GetWeeklyVolumeSummaryUseCase,
    ListMesocyclesUseCase,
    ListTrainingSessionsUseCase,
    TransitionMesocycleStatusUseCase,
    UpdateMesocycleUseCase,
    UpdateTrainingSessionUseCase,
)
from fitness_coach.domain.identity import AuthContext
from fitness_coach.domain.training import (
    ActiveMesocycleConflictError,
    InvalidMesocycleTransitionError,
    MesocycleNotFoundError,
    TrainingSessionNotFoundError,
    TrainingValidationError,
)
from fitness_coach.infrastructure.api.deps import (
    get_ai_provider,
    get_current_auth,
    get_db_session,
)
from fitness_coach.infrastructure.api.schemas.training import (
    ActivateMesocycleRequest,
    ActivateMesocycleResponse,
    CoachMesocycleDraftResponse,
    CreateMesocycleRequest,
    CreateTrainingSessionRequest,
    DraftMesocycleWithCoachRequest,
    MesocycleResponse,
    TodaySessionResponse,
    TrainingSessionResponse,
    TransitionMesocycleStatusRequest,
    UpdateMesocycleRequest,
    UpdateTrainingSessionRequest,
    WeeklyVolumeSummaryResponse,
)
from fitness_coach.infrastructure.db.repositories.knowledge import SqlAlchemyKnowledgeRepository
from fitness_coach.infrastructure.db.repositories.profile import SqlAlchemyProfileRepository
from fitness_coach.infrastructure.db.repositories.training import SqlAlchemyTrainingRepository

router = APIRouter(prefix="/api/v1/training", tags=["training"])


@router.get("/mesocycles", response_model=list[MesocycleResponse])
async def list_mesocycles(
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[MesocycleResponse]:
    use_case = ListMesocyclesUseCase(SqlAlchemyTrainingRepository(session))
    mesocycles = await use_case.execute(auth=auth)
    return [MesocycleResponse.from_domain(m) for m in mesocycles]


@router.post(
    "/mesocycles",
    response_model=MesocycleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_mesocycle(
    body: CreateMesocycleRequest,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MesocycleResponse:
    use_case = CreateMesocycleUseCase(SqlAlchemyTrainingRepository(session))
    try:
        created = await use_case.execute(
            auth=auth,
            name=body.name,
            goal=body.goal,
            duration_weeks=body.duration_weeks,
            progression_criteria=body.progression_criteria,
            deload_criteria=body.deload_criteria,
            notes=body.notes,
            planned_sessions=tuple(ps.to_domain() for ps in body.planned_sessions),
        )
    except TrainingValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    await session.commit()
    return MesocycleResponse.from_domain(created)


@router.post(
    "/mesocycles/draft-with-coach",
    response_model=CoachMesocycleDraftResponse,
    status_code=status.HTTP_201_CREATED,
)
async def draft_mesocycle_with_coach(
    body: DraftMesocycleWithCoachRequest,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    ai_provider: Annotated[AIProviderPort, Depends(get_ai_provider)],
) -> CoachMesocycleDraftResponse:
    use_case = DraftMesocycleWithCoachUseCase(
        training_repo=SqlAlchemyTrainingRepository(session),
        profile_repo=SqlAlchemyProfileRepository(session),
        knowledge_repo=SqlAlchemyKnowledgeRepository(session),
        ai_provider=ai_provider,
    )
    try:
        result = await use_case.execute(
            auth=auth,
            focus_notes=body.focus_notes,
            duration_weeks=body.duration_weeks,
        )
    except TrainingValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    await session.commit()
    return CoachMesocycleDraftResponse(
        mesocycle=MesocycleResponse.from_domain(result.mesocycle),
        cited_card_ids=list(result.cited_card_ids),
        coach_rationale_es=result.coach_rationale_es,
    )


@router.patch("/mesocycles/{mesocycle_id}", response_model=MesocycleResponse)
async def update_mesocycle(
    mesocycle_id: UUID,
    body: UpdateMesocycleRequest,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MesocycleResponse:
    use_case = UpdateMesocycleUseCase(SqlAlchemyTrainingRepository(session))
    try:
        updated = await use_case.execute(
            auth=auth,
            mesocycle_id=mesocycle_id,
            name=body.name,
            goal=body.goal,
            duration_weeks=body.duration_weeks,
            progression_criteria=body.progression_criteria,
            deload_criteria=body.deload_criteria,
            notes=body.notes,
            planned_sessions=(
                tuple(ps.to_domain() for ps in body.planned_sessions)
                if body.planned_sessions is not None
                else None
            ),
        )
    except MesocycleNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except TrainingValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    await session.commit()
    return MesocycleResponse.from_domain(updated)


@router.post("/mesocycles/{mesocycle_id}/activate", response_model=ActivateMesocycleResponse)
async def activate_mesocycle(
    mesocycle_id: UUID,
    body: ActivateMesocycleRequest,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ActivateMesocycleResponse:
    use_case = ActivateMesocycleUseCase(SqlAlchemyTrainingRepository(session))
    try:
        result = await use_case.execute(
            auth=auth,
            mesocycle_id=mesocycle_id,
            confirm_transition_status=body.confirm_transition_status,
        )
    except MesocycleNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ActiveMesocycleConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": str(exc),
                "active_mesocycle_id": str(exc.active_mesocycle.id),
                "active_mesocycle_name": exc.active_mesocycle.name,
                "active_mesocycle_status": exc.active_mesocycle.status.value,
            },
        ) from exc
    except InvalidMesocycleTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    await session.commit()
    return ActivateMesocycleResponse(
        mesocycle=MesocycleResponse.from_domain(result.mesocycle),
        previous_mesocycle=(
            MesocycleResponse.from_domain(result.previous_mesocycle)
            if result.previous_mesocycle is not None
            else None
        ),
    )


@router.post("/mesocycles/{mesocycle_id}/status", response_model=MesocycleResponse)
async def transition_mesocycle_status(
    mesocycle_id: UUID,
    body: TransitionMesocycleStatusRequest,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MesocycleResponse:
    use_case = TransitionMesocycleStatusUseCase(SqlAlchemyTrainingRepository(session))
    try:
        updated = await use_case.execute(
            auth=auth,
            mesocycle_id=mesocycle_id,
            target_status=body.status,
        )
    except MesocycleNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except (ActiveMesocycleConflictError, InvalidMesocycleTransitionError) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    await session.commit()
    return MesocycleResponse.from_domain(updated)


@router.get("/today", response_model=TodaySessionResponse)
async def get_today_session(
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    planned_session_id: Annotated[UUID | None, Query()] = None,
) -> TodaySessionResponse:
    use_case = GetTodaySessionUseCase(SqlAlchemyTrainingRepository(session))
    view = await use_case.execute(auth=auth, planned_session_id=planned_session_id)
    return TodaySessionResponse.from_domain(view)


@router.get("/sessions", response_model=list[TrainingSessionResponse])
async def list_training_sessions(
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    mesocycle_id: Annotated[UUID | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[TrainingSessionResponse]:
    use_case = ListTrainingSessionsUseCase(SqlAlchemyTrainingRepository(session))
    sessions = await use_case.execute(auth=auth, mesocycle_id=mesocycle_id, limit=limit)
    return [TrainingSessionResponse.from_domain(ts) for ts in sessions]


@router.post(
    "/sessions",
    response_model=TrainingSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_training_session(
    body: CreateTrainingSessionRequest,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TrainingSessionResponse:
    use_case = CreateTrainingSessionUseCase(SqlAlchemyTrainingRepository(session))
    try:
        created = await use_case.execute(
            auth=auth,
            session_date=body.session_date,
            name=body.name,
            sets=tuple(s.to_domain() for s in body.sets),
            mesocycle_id=body.mesocycle_id,
            planned_session_id=body.planned_session_id,
            origin=body.origin,
            fatigue_notes=body.fatigue_notes,
        )
    except MesocycleNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except TrainingValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    await session.commit()
    return TrainingSessionResponse.from_domain(created)


@router.put("/sessions/{session_id}", response_model=TrainingSessionResponse)
async def update_training_session(
    session_id: UUID,
    body: UpdateTrainingSessionRequest,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TrainingSessionResponse:
    use_case = UpdateTrainingSessionUseCase(SqlAlchemyTrainingRepository(session))
    try:
        updated = await use_case.execute(
            auth=auth,
            session_id=session_id,
            session_date=body.session_date,
            name=body.name,
            sets=tuple(s.to_domain() for s in body.sets),
            mesocycle_id=body.mesocycle_id,
            planned_session_id=body.planned_session_id,
            fatigue_notes=body.fatigue_notes,
        )
    except (TrainingSessionNotFoundError, MesocycleNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except TrainingValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    await session.commit()
    return TrainingSessionResponse.from_domain(updated)


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_training_session(
    session_id: UUID,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Response:
    use_case = DeleteTrainingSessionUseCase(SqlAlchemyTrainingRepository(session))
    try:
        await use_case.execute(auth=auth, session_id=session_id)
    except TrainingSessionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/volume-summary", response_model=WeeklyVolumeSummaryResponse)
async def get_weekly_volume_summary(
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    week_start: Annotated[date | None, Query()] = None,
) -> WeeklyVolumeSummaryResponse:
    use_case = GetWeeklyVolumeSummaryUseCase(SqlAlchemyTrainingRepository(session))
    summary = await use_case.execute(auth=auth, week_start=week_start)
    return WeeklyVolumeSummaryResponse.from_domain(summary)
