"""Curator-only API router for CandidateStudy inbox, PDF analysis, curation & reindex."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from fitness_coach.application.ports.ai_provider import AIProviderPort
from fitness_coach.application.ports.identity_storage import BinaryStoragePort
from fitness_coach.application.ports.scientific_sources import ScientificSourcesPort
from fitness_coach.application.use_cases.knowledge import (
    ApproveCandidateUseCase,
    GetCandidateUseCase,
    ListCandidatesUseCase,
    ProposeCandidateFromDoiUseCase,
    ProposeCandidateFromPdfUseCase,
    ReindexKnowledgeBaseUseCase,
    RejectCandidateUseCase,
    RelationInput,
    UpdateEvidenceCardUseCase,
    UploadCandidatePdfUseCase,
)
from fitness_coach.domain.identity import AuthContext
from fitness_coach.domain.knowledge import (
    CandidateNotFoundError,
    CandidateStatus,
    DuplicateActiveStudyError,
    DuplicateRejectedStudyError,
    EvidenceCardNotFoundError,
    InvalidCandidateStateError,
    InvalidPdfError,
    KnowledgeValidationError,
    ScientificSourceNotFoundError,
)
from fitness_coach.infrastructure.api.deps import (
    get_ai_provider,
    get_binary_storage,
    get_db_session,
    get_scientific_sources,
    require_curator,
)
from fitness_coach.infrastructure.api.schemas.knowledge import (
    ApproveCandidateRequest,
    CandidateStudyListResponse,
    CandidateStudyResponse,
    EvidenceCardDetailResponse,
    ProposeCandidateFromDoiRequest,
    ReindexRequest,
    ReindexResponse,
    RejectCandidateRequest,
    UpdateEvidenceCardRequest,
)
from fitness_coach.infrastructure.db.repositories.knowledge import SqlAlchemyKnowledgeRepository

router = APIRouter(prefix="/api/v1/curator", tags=["curation"])


def _rejected_conflict_detail(exc: DuplicateRejectedStudyError) -> dict[str, object]:
    prior = exc.prior_candidate
    return {
        "code": "previously_rejected",
        "message": str(exc),
        "prior_candidate_id": str(prior.id),
        "prior_title": prior.title,
        "prior_rejection_reason": prior.rejection_reason,
    }


@router.get("/candidates", response_model=CandidateStudyListResponse)
async def list_candidates(
    auth: Annotated[AuthContext, Depends(require_curator)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    candidate_status: Annotated[CandidateStatus | None, Query(alias="status")] = None,
) -> CandidateStudyListResponse:
    repo = SqlAlchemyKnowledgeRepository(session)
    items = await ListCandidatesUseCase(repo).execute(auth=auth, status=candidate_status)
    return CandidateStudyListResponse(items=[CandidateStudyResponse.from_domain(c) for c in items])


@router.get("/candidates/{candidate_id}", response_model=CandidateStudyResponse)
async def get_candidate(
    candidate_id: UUID,
    auth: Annotated[AuthContext, Depends(require_curator)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CandidateStudyResponse:
    repo = SqlAlchemyKnowledgeRepository(session)
    try:
        candidate = await GetCandidateUseCase(repo).execute(auth=auth, candidate_id=candidate_id)
    except CandidateNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return CandidateStudyResponse.from_domain(candidate)


@router.post(
    "/candidates/from-doi",
    response_model=CandidateStudyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def propose_candidate_from_doi(
    payload: ProposeCandidateFromDoiRequest,
    auth: Annotated[AuthContext, Depends(require_curator)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    scientific_sources: Annotated[ScientificSourcesPort, Depends(get_scientific_sources)],
    ai_provider: Annotated[AIProviderPort, Depends(get_ai_provider)],
) -> CandidateStudyResponse:
    repo = SqlAlchemyKnowledgeRepository(session)
    use_case = ProposeCandidateFromDoiUseCase(
        repo=repo,
        scientific_sources=scientific_sources,
        ai_provider=ai_provider,
    )
    try:
        candidate = await use_case.execute(
            auth=auth,
            doi_or_url=payload.doi_or_url,
            allow_reopen=payload.allow_reopen,
        )
        await session.commit()
    except KnowledgeValidationError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ScientificSourceNotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except DuplicateRejectedStudyError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_rejected_conflict_detail(exc),
        ) from exc
    except DuplicateActiveStudyError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return CandidateStudyResponse.from_domain(candidate)


@router.post(
    "/candidates/from-pdf",
    response_model=CandidateStudyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def propose_candidate_from_pdf(
    auth: Annotated[AuthContext, Depends(require_curator)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    binary_storage: Annotated[BinaryStoragePort, Depends(get_binary_storage)],
    ai_provider: Annotated[AIProviderPort, Depends(get_ai_provider)],
    file: Annotated[UploadFile, File(...)],
    title: Annotated[str | None, Form()] = None,
    doi: Annotated[str | None, Form()] = None,
    allow_reopen: Annotated[bool, Form()] = False,
) -> CandidateStudyResponse:
    pdf_bytes = await file.read()
    repo = SqlAlchemyKnowledgeRepository(session)
    use_case = ProposeCandidateFromPdfUseCase(
        repo=repo,
        binary_storage=binary_storage,
        ai_provider=ai_provider,
    )
    try:
        candidate = await use_case.execute(
            auth=auth,
            filename=file.filename or "study.pdf",
            pdf_bytes=pdf_bytes,
            title=title,
            doi=doi,
            allow_reopen=allow_reopen,
        )
        await session.commit()
    except InvalidPdfError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except DuplicateRejectedStudyError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_rejected_conflict_detail(exc),
        ) from exc
    except DuplicateActiveStudyError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return CandidateStudyResponse.from_domain(candidate)


@router.post("/candidates/{candidate_id}/upload-pdf", response_model=CandidateStudyResponse)
async def upload_candidate_pdf(
    candidate_id: UUID,
    auth: Annotated[AuthContext, Depends(require_curator)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    binary_storage: Annotated[BinaryStoragePort, Depends(get_binary_storage)],
    ai_provider: Annotated[AIProviderPort, Depends(get_ai_provider)],
    file: Annotated[UploadFile, File(...)],
) -> CandidateStudyResponse:
    pdf_bytes = await file.read()
    repo = SqlAlchemyKnowledgeRepository(session)
    use_case = UploadCandidatePdfUseCase(
        repo=repo,
        binary_storage=binary_storage,
        ai_provider=ai_provider,
    )
    try:
        candidate = await use_case.execute(
            auth=auth,
            candidate_id=candidate_id,
            filename=file.filename or "full_text.pdf",
            pdf_bytes=pdf_bytes,
        )
        await session.commit()
    except CandidateNotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except (InvalidPdfError, InvalidCandidateStateError) as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return CandidateStudyResponse.from_domain(candidate)


@router.post(
    "/candidates/{candidate_id}/approve",
    response_model=EvidenceCardDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def approve_candidate(
    candidate_id: UUID,
    payload: ApproveCandidateRequest,
    auth: Annotated[AuthContext, Depends(require_curator)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    ai_provider: Annotated[AIProviderPort, Depends(get_ai_provider)],
) -> EvidenceCardDetailResponse:
    repo = SqlAlchemyKnowledgeRepository(session)
    use_case = ApproveCandidateUseCase(repo=repo, ai_provider=ai_provider)
    try:
        detail = await use_case.execute(
            auth=auth,
            candidate_id=candidate_id,
            evidence_level=payload.evidence_level,
            curated_text_es=payload.curated_text_es,
            key_terms_en=payload.key_terms_en,
            tags=payload.tags,
            curator_notes=payload.curator_notes,
            relations=[
                RelationInput(
                    target_card_id=r.target_card_id,
                    relation_type=r.relation_type,
                    rationale=r.rationale,
                )
                for r in payload.relations
            ],
        )
        await session.commit()
    except (CandidateNotFoundError, EvidenceCardNotFoundError) as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except (InvalidCandidateStateError, KnowledgeValidationError) as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return EvidenceCardDetailResponse.from_detail(detail)


@router.post("/candidates/{candidate_id}/reject", response_model=CandidateStudyResponse)
async def reject_candidate(
    candidate_id: UUID,
    payload: RejectCandidateRequest,
    auth: Annotated[AuthContext, Depends(require_curator)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CandidateStudyResponse:
    repo = SqlAlchemyKnowledgeRepository(session)
    use_case = RejectCandidateUseCase(repo)
    try:
        candidate = await use_case.execute(
            auth=auth,
            candidate_id=candidate_id,
            rejection_reason=payload.rejection_reason,
        )
        await session.commit()
    except CandidateNotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except (InvalidCandidateStateError, KnowledgeValidationError) as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return CandidateStudyResponse.from_domain(candidate)


@router.patch("/cards/{card_id}", response_model=EvidenceCardDetailResponse)
async def update_evidence_card(
    card_id: UUID,
    payload: UpdateEvidenceCardRequest,
    auth: Annotated[AuthContext, Depends(require_curator)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    ai_provider: Annotated[AIProviderPort, Depends(get_ai_provider)],
) -> EvidenceCardDetailResponse:
    repo = SqlAlchemyKnowledgeRepository(session)
    use_case = UpdateEvidenceCardUseCase(repo=repo, ai_provider=ai_provider)
    try:
        detail = await use_case.execute(
            auth=auth,
            card_id=card_id,
            curator_notes=payload.curator_notes,
            tags=payload.tags,
            validity_status=payload.validity_status,
            curated_text_es=payload.curated_text_es,
            key_terms_en=payload.key_terms_en,
            add_relations=[
                RelationInput(
                    target_card_id=r.target_card_id,
                    relation_type=r.relation_type,
                    rationale=r.rationale,
                )
                for r in payload.add_relations
            ],
        )
        await session.commit()
    except EvidenceCardNotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return EvidenceCardDetailResponse.from_detail(detail)


@router.post("/reindex", response_model=ReindexResponse)
async def reindex_knowledge_base(
    payload: ReindexRequest,
    auth: Annotated[AuthContext, Depends(require_curator)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    ai_provider: Annotated[AIProviderPort, Depends(get_ai_provider)],
) -> ReindexResponse:
    repo = SqlAlchemyKnowledgeRepository(session)
    use_case = ReindexKnowledgeBaseUseCase(repo=repo, ai_provider=ai_provider)
    summary = await use_case.execute(auth=auth, force=payload.force)
    await session.commit()
    return ReindexResponse(
        reindexed_count=summary.reindexed_count,
        skipped_count=summary.skipped_count,
        embedding_model=summary.embedding_model,
    )
