"""FastAPI router for Coach Chat (SSE), quarantined live-search promotion, and Profile proposals."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from fitness_coach.application.ports.ai_provider import AIProviderPort
from fitness_coach.application.ports.scientific_sources import ScientificSourcesPort
from fitness_coach.application.use_cases.coach import (
    AcceptProfileProposalUseCase,
    CoachContextAssembler,
    CreateConversationUseCase,
    DismissProfileProposalUseCase,
    ListConversationsUseCase,
    ListMessagesUseCase,
    ListProfileProposalsUseCase,
    PromoteLiveSearchResultUseCase,
    SendCoachMessageStreamUseCase,
)
from fitness_coach.application.use_cases.nutrition import NutritionCoachContextProvider
from fitness_coach.application.use_cases.training import TrainingCoachContextProvider
from fitness_coach.domain.coach import (
    CoachValidationError,
    ConversationNotFoundError,
    InvalidProposalStateError,
    ProposalNotFoundError,
    ProposalStatus,
)
from fitness_coach.domain.identity import AuthContext
from fitness_coach.domain.knowledge import (
    DuplicateActiveStudyError,
    DuplicateRejectedStudyError,
)
from fitness_coach.domain.profile import ProfileValidationError
from fitness_coach.infrastructure.api.deps import (
    get_ai_provider,
    get_current_auth,
    get_db_session,
    get_scientific_sources,
)
from fitness_coach.infrastructure.api.schemas.coach import (
    ChatMessageResponse,
    ConversationResponse,
    CreateConversationRequest,
    ProfileProposalResponse,
    PromoteLiveSearchRequest,
    PromoteLiveSearchResponse,
    SendMessageRequest,
)
from fitness_coach.infrastructure.db.repositories.coach import SqlAlchemyCoachRepository
from fitness_coach.infrastructure.db.repositories.knowledge import SqlAlchemyKnowledgeRepository
from fitness_coach.infrastructure.db.repositories.nutrition import SqlAlchemyNutritionRepository
from fitness_coach.infrastructure.db.repositories.profile import SqlAlchemyProfileRepository
from fitness_coach.infrastructure.db.repositories.training import SqlAlchemyTrainingRepository

router = APIRouter(tags=["coach"])


def _format_sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.get(
    "/api/v1/coach/conversations",
    response_model=list[ConversationResponse],
)
async def list_conversations(
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[ConversationResponse]:
    use_case = ListConversationsUseCase(SqlAlchemyCoachRepository(session))
    conversations = await use_case.execute(auth=auth)
    return [ConversationResponse.from_domain(c) for c in conversations]


@router.post(
    "/api/v1/coach/conversations",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_conversation(
    body: CreateConversationRequest,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ConversationResponse:
    use_case = CreateConversationUseCase(SqlAlchemyCoachRepository(session))
    conv = await use_case.execute(auth=auth, title=body.title)
    await session.commit()
    return ConversationResponse.from_domain(conv)


@router.get(
    "/api/v1/coach/conversations/{conversation_id}/messages",
    response_model=list[ChatMessageResponse],
)
async def list_messages(
    conversation_id: UUID,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[ChatMessageResponse]:
    use_case = ListMessagesUseCase(SqlAlchemyCoachRepository(session))
    try:
        messages = await use_case.execute(auth=auth, conversation_id=conversation_id)
    except ConversationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return [ChatMessageResponse.from_domain(m) for m in messages]


@router.post(
    "/api/v1/coach/conversations/{conversation_id}/messages",
    response_class=StreamingResponse,
    responses={
        200: {
            "content": {"text/event-stream": {}},
            "description": "SSE stream emitting token, citations, live_search_quarantine, "
            "profile_proposal, done, and error events.",
        }
    },
)
async def send_message_stream(
    conversation_id: UUID,
    body: SendMessageRequest,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    ai_provider: Annotated[AIProviderPort, Depends(get_ai_provider)],
    scientific_sources: Annotated[ScientificSourcesPort | None, Depends(get_scientific_sources)],
) -> StreamingResponse:
    coach_repo = SqlAlchemyCoachRepository(session)
    # Validate ownership & non-empty content BEFORE opening the SSE stream so 404/422 return cleanly
    if not body.content.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El mensaje no puede estar vacío.",
        )
    conv = await coach_repo.get_conversation(
        athlete_id=auth.athlete_id, conversation_id=conversation_id
    )
    if conv is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontró la conversación solicitada.",
        )

    assembler = CoachContextAssembler(
        profile_repo=SqlAlchemyProfileRepository(session),
        knowledge_repo=SqlAlchemyKnowledgeRepository(session),
        ai_provider=ai_provider,
        scientific_sources=scientific_sources,
        training_context_provider=TrainingCoachContextProvider(
            SqlAlchemyTrainingRepository(session)
        ),
        nutrition_context_provider=NutritionCoachContextProvider(
            SqlAlchemyNutritionRepository(session)
        ),
    )
    use_case = SendCoachMessageStreamUseCase(
        coach_repo=coach_repo,
        context_assembler=assembler,
        ai_provider=ai_provider,
    )

    async def event_generator() -> AsyncIterator[str]:
        try:
            async for event in use_case.execute(
                auth=auth,
                conversation_id=conversation_id,
                content=body.content,
                enable_live_search=body.enable_live_search,
            ):
                yield _format_sse(event.event, event.data)
            await session.commit()
        except Exception as exc:  # pragma: no cover - defensive SSE error boundary
            await session.rollback()
            yield _format_sse("error", {"detail": str(exc)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/api/v1/coach/live-search/promote",
    response_model=PromoteLiveSearchResponse,
    status_code=status.HTTP_201_CREATED,
)
async def promote_live_search_result(
    body: PromoteLiveSearchRequest,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    ai_provider: Annotated[AIProviderPort, Depends(get_ai_provider)],
) -> PromoteLiveSearchResponse:
    use_case = PromoteLiveSearchResultUseCase(
        knowledge_repo=SqlAlchemyKnowledgeRepository(session),
        ai_provider=ai_provider,
    )
    try:
        candidate = await use_case.execute(
            auth=auth,
            title=body.title,
            url=body.url,
            snippet=body.snippet,
            doi=body.doi,
            pmid=body.pmid,
            published_year=body.published_year,
        )
    except CoachValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except (DuplicateActiveStudyError, DuplicateRejectedStudyError) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    await session.commit()
    return PromoteLiveSearchResponse(
        candidate_id=candidate.id,
        title=candidate.title,
        origin=candidate.origin.value,
        status=candidate.status.value,
        access_level=candidate.access_level.value,
    )


@router.get(
    "/api/v1/profile/proposals",
    response_model=list[ProfileProposalResponse],
)
async def list_profile_proposals(
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    proposal_status: Annotated[ProposalStatus | None, Query(alias="status")] = None,
) -> list[ProfileProposalResponse]:
    use_case = ListProfileProposalsUseCase(SqlAlchemyCoachRepository(session))
    proposals = await use_case.execute(auth=auth, status=proposal_status)
    return [ProfileProposalResponse.from_domain(p) for p in proposals]


@router.post(
    "/api/v1/profile/proposals/{proposal_id}/accept",
    response_model=ProfileProposalResponse,
)
async def accept_profile_proposal(
    proposal_id: UUID,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ProfileProposalResponse:
    use_case = AcceptProfileProposalUseCase(
        coach_repo=SqlAlchemyCoachRepository(session),
        profile_repo=SqlAlchemyProfileRepository(session),
    )
    try:
        proposal, _ = await use_case.execute(auth=auth, proposal_id=proposal_id)
    except ProposalNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except InvalidProposalStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ProfileValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    await session.commit()
    return ProfileProposalResponse.from_domain(proposal)


@router.post(
    "/api/v1/profile/proposals/{proposal_id}/dismiss",
    response_model=ProfileProposalResponse,
)
async def dismiss_profile_proposal(
    proposal_id: UUID,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ProfileProposalResponse:
    use_case = DismissProfileProposalUseCase(SqlAlchemyCoachRepository(session))
    try:
        proposal = await use_case.execute(auth=auth, proposal_id=proposal_id)
    except ProposalNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except InvalidProposalStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    await session.commit()
    return ProfileProposalResponse.from_domain(proposal)
