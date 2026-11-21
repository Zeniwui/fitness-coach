"""API routers for Monthly Cut, Seed Batch & Trending Topics (#5)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from fitness_coach.application.ports.ai_provider import AIProviderPort
from fitness_coach.application.ports.scientific_sources import ScientificSourcesPort
from fitness_coach.application.use_cases.monthly_cut import (
    GetMonthlyCutRunUseCase,
    ListMonthlyCutRunsUseCase,
    ListTrendingTopicsUseCase,
    LoadSeedBatchUseCase,
    ResumeMonthlyCutUseCase,
    ReviewTrendingTopicUseCase,
    RunMonthlyCutUseCase,
)
from fitness_coach.domain.identity import AuthContext
from fitness_coach.domain.monthly_cut import (
    MonthlyCutNotFoundError,
    MonthlyCutRunType,
    MonthlyCutStateError,
    MonthlyCutValidationError,
    TrendingTopicNotFoundError,
    TrendingTopicStatus,
)
from fitness_coach.infrastructure.api.deps import (
    get_ai_provider,
    get_current_auth,
    get_db_session,
    get_scientific_sources,
    require_curator,
)
from fitness_coach.infrastructure.api.schemas.monthly_cut import (
    MonthlyCutRunListResponse,
    MonthlyCutRunResponse,
    ReviewTrendingTopicRequest,
    SeedBatchResponse,
    TrendingTopicListResponse,
    TrendingTopicResponse,
    TriggerMonthlyCutRequest,
)
from fitness_coach.infrastructure.db.repositories.knowledge import SqlAlchemyKnowledgeRepository
from fitness_coach.infrastructure.db.repositories.monthly_cut import (
    SqlAlchemyMonthlyCutRepository,
)

router = APIRouter(tags=["monthly-cut"])


@router.get("/api/v1/curator/monthly-cuts", response_model=MonthlyCutRunListResponse)
async def list_monthly_cut_runs(
    auth: Annotated[AuthContext, Depends(require_curator)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> MonthlyCutRunListResponse:
    repo = SqlAlchemyMonthlyCutRepository(session)
    runs = await ListMonthlyCutRunsUseCase(repo).execute(auth=auth, limit=limit)
    return MonthlyCutRunListResponse(items=[MonthlyCutRunResponse.from_domain(r) for r in runs])


@router.get("/api/v1/curator/monthly-cuts/{run_id}", response_model=MonthlyCutRunResponse)
async def get_monthly_cut_run(
    run_id: UUID,
    auth: Annotated[AuthContext, Depends(require_curator)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MonthlyCutRunResponse:
    repo = SqlAlchemyMonthlyCutRepository(session)
    try:
        run = await GetMonthlyCutRunUseCase(repo).execute(auth=auth, run_id=run_id)
    except MonthlyCutNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return MonthlyCutRunResponse.from_domain(run)


@router.post(
    "/api/v1/curator/monthly-cuts",
    response_model=MonthlyCutRunResponse,
    status_code=status.HTTP_201_CREATED,
)
async def trigger_monthly_cut(
    payload: TriggerMonthlyCutRequest,
    auth: Annotated[AuthContext, Depends(require_curator)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    ai_provider: Annotated[AIProviderPort, Depends(get_ai_provider)],
    scientific_sources: Annotated[ScientificSourcesPort, Depends(get_scientific_sources)],
) -> MonthlyCutRunResponse:
    mc_repo = SqlAlchemyMonthlyCutRepository(session)
    kb_repo = SqlAlchemyKnowledgeRepository(session)
    use_case = RunMonthlyCutUseCase(
        monthly_cut_repo=mc_repo,
        knowledge_repo=kb_repo,
        ai_provider=ai_provider,
        scientific_sources=scientific_sources,
    )
    try:
        run = await use_case.execute(
            auth=auth,
            run_type=MonthlyCutRunType.MANUAL,
            date_from=payload.date_from,
            date_to=payload.date_to,
            query_override=payload.query_override,
            max_candidates=payload.max_candidates,
            commit=session.commit,
        )
    except MonthlyCutValidationError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return MonthlyCutRunResponse.from_domain(run)


@router.post("/api/v1/curator/monthly-cuts/{run_id}/resume", response_model=MonthlyCutRunResponse)
async def resume_monthly_cut(
    run_id: UUID,
    auth: Annotated[AuthContext, Depends(require_curator)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    ai_provider: Annotated[AIProviderPort, Depends(get_ai_provider)],
    scientific_sources: Annotated[ScientificSourcesPort, Depends(get_scientific_sources)],
) -> MonthlyCutRunResponse:
    mc_repo = SqlAlchemyMonthlyCutRepository(session)
    kb_repo = SqlAlchemyKnowledgeRepository(session)
    use_case = ResumeMonthlyCutUseCase(
        monthly_cut_repo=mc_repo,
        knowledge_repo=kb_repo,
        ai_provider=ai_provider,
        scientific_sources=scientific_sources,
    )
    try:
        run = await use_case.execute(auth=auth, run_id=run_id, commit=session.commit)
    except MonthlyCutNotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except MonthlyCutStateError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return MonthlyCutRunResponse.from_domain(run)


@router.post(
    "/api/v1/curator/seed-batch",
    response_model=SeedBatchResponse,
    status_code=status.HTTP_201_CREATED,
)
async def load_seed_batch(
    auth: Annotated[AuthContext, Depends(require_curator)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> SeedBatchResponse:
    mc_repo = SqlAlchemyMonthlyCutRepository(session)
    kb_repo = SqlAlchemyKnowledgeRepository(session)
    result = await LoadSeedBatchUseCase(
        monthly_cut_repo=mc_repo,
        knowledge_repo=kb_repo,
    ).execute(auth=auth, commit=session.commit)
    return SeedBatchResponse(
        run_id=result.run_id,
        total_in_catalog=result.total_in_catalog,
        created_count=result.created_count,
        skipped_count=result.skipped_count,
    )


@router.get("/api/v1/curator/trending-topics", response_model=TrendingTopicListResponse)
async def list_curator_trending_topics(
    auth: Annotated[AuthContext, Depends(require_curator)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    topic_status: Annotated[TrendingTopicStatus | None, Query(alias="status")] = None,
) -> TrendingTopicListResponse:
    repo = SqlAlchemyMonthlyCutRepository(session)
    topics = await ListTrendingTopicsUseCase(repo).execute_for_curator(
        auth=auth, status=topic_status
    )
    return TrendingTopicListResponse(items=[TrendingTopicResponse.from_domain(t) for t in topics])


@router.post(
    "/api/v1/curator/trending-topics/{topic_id}/review",
    response_model=TrendingTopicResponse,
)
async def review_trending_topic(
    topic_id: UUID,
    payload: ReviewTrendingTopicRequest,
    auth: Annotated[AuthContext, Depends(require_curator)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TrendingTopicResponse:
    repo = SqlAlchemyMonthlyCutRepository(session)
    try:
        topic = await ReviewTrendingTopicUseCase(repo).execute(
            auth=auth,
            topic_id=topic_id,
            decision=payload.decision,
        )
        await session.commit()
    except TrendingTopicNotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except MonthlyCutValidationError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return TrendingTopicResponse.from_domain(topic)


@router.get("/api/v1/knowledge/trending-topics", response_model=TrendingTopicListResponse)
async def list_approved_trending_topics(
    _auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TrendingTopicListResponse:
    """Shared read of approved Temas de Actualidad — strictly separated from EvidenceCards."""
    repo = SqlAlchemyMonthlyCutRepository(session)
    topics = await ListTrendingTopicsUseCase(repo).execute_approved_for_athlete()
    return TrendingTopicListResponse(items=[TrendingTopicResponse.from_domain(t) for t in topics])
