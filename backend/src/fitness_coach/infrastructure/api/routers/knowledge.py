"""Shared Knowledge Base read/search router (accessible to authenticated Athletes & Curators)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from fitness_coach.application.ports.ai_provider import AIProviderPort
from fitness_coach.application.use_cases.knowledge import (
    GetEvidenceCardDetailUseCase,
    SearchKnowledgeBaseUseCase,
)
from fitness_coach.domain.identity import AuthContext
from fitness_coach.domain.knowledge import (
    EvidenceCardNotFoundError,
    EvidenceLevel,
    ValidityStatus,
)
from fitness_coach.infrastructure.api.deps import (
    get_ai_provider,
    get_current_auth,
    get_db_session,
)
from fitness_coach.infrastructure.api.schemas.knowledge import (
    EvidenceCardDetailResponse,
    EvidenceSearchHitResponse,
    KnowledgeSearchResponse,
)
from fitness_coach.infrastructure.db.repositories.knowledge import SqlAlchemyKnowledgeRepository

router = APIRouter(prefix="/api/v1/knowledge", tags=["knowledge"])


@router.get("/search", response_model=KnowledgeSearchResponse)
async def search_knowledge_base(
    _auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    ai_provider: Annotated[AIProviderPort, Depends(get_ai_provider)],
    q: Annotated[str | None, Query(max_length=500)] = None,
    tags: Annotated[list[str] | None, Query()] = None,
    evidence_level: Annotated[EvidenceLevel | None, Query()] = None,
    validity_status: Annotated[ValidityStatus | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> KnowledgeSearchResponse:
    repo = SqlAlchemyKnowledgeRepository(session)
    use_case = SearchKnowledgeBaseUseCase(repo=repo, ai_provider=ai_provider)
    hits = await use_case.execute(
        query=q,
        tags=tags,
        evidence_level=evidence_level,
        validity_status=validity_status,
        limit=limit,
    )
    return KnowledgeSearchResponse(
        items=[EvidenceSearchHitResponse.from_domain(h) for h in hits],
        total=len(hits),
    )


@router.get("/cards/{card_id}", response_model=EvidenceCardDetailResponse)
async def get_evidence_card(
    card_id: UUID,
    _auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> EvidenceCardDetailResponse:
    repo = SqlAlchemyKnowledgeRepository(session)
    try:
        detail = await GetEvidenceCardDetailUseCase(repo).execute(card_id=card_id)
    except EvidenceCardNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return EvidenceCardDetailResponse.from_detail(detail)
