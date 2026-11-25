"""FastAPI router for Coach Chat (SSE), quarantined live-search promotion, and Profile proposals."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from fitness_coach.application.ports.ai_provider import AIProviderPort
from fitness_coach.application.ports.identity_storage import BinaryStoragePort
from fitness_coach.application.ports.scientific_sources import ScientificSourcesPort
from fitness_coach.application.use_cases.coach import (
    AcceptProfileProposalUseCase,
    CoachContextAssembler,
    CreateConversationUseCase,
    DeleteConversationUseCase,
    DismissProfileProposalUseCase,
    ListConversationsUseCase,
    ListMessagesUseCase,
    ListProfileProposalsUseCase,
    PromoteLiveSearchResultUseCase,
    RenameConversationUseCase,
    SendCoachMessageStreamUseCase,
)
from fitness_coach.application.use_cases.nutrition import NutritionCoachContextProvider
from fitness_coach.application.use_cases.training import TrainingCoachContextProvider
from fitness_coach.domain.coach import ProposalStatus, ensure_attachments_unlinked
from fitness_coach.domain.identity import AuthContext
from fitness_coach.domain.knowledge import (
    DuplicateActiveStudyError,
    DuplicateRejectedStudyError,
)
from fitness_coach.domain.profile import ProfileValidationError
from fitness_coach.infrastructure.api.deps import (
    get_ai_provider,
    get_binary_storage,
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
    UpdateConversationRequest,
)
from fitness_coach.infrastructure.db.repositories.coach import SqlAlchemyCoachRepository
from fitness_coach.infrastructure.db.repositories.knowledge import SqlAlchemyKnowledgeRepository
from fitness_coach.infrastructure.db.repositories.multimodal import SqlAlchemyMultimodalRepository
from fitness_coach.infrastructure.db.repositories.nutrition import SqlAlchemyNutritionRepository
from fitness_coach.infrastructure.db.repositories.profile import SqlAlchemyProfileRepository
from fitness_coach.infrastructure.db.repositories.training import SqlAlchemyTrainingRepository

router = APIRouter(tags=["coach"])
logger = logging.getLogger(__name__)


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


@router.patch(
    "/api/v1/coach/conversations/{conversation_id}",
    response_model=ConversationResponse,
)
async def rename_conversation(
    conversation_id: UUID,
    body: UpdateConversationRequest,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ConversationResponse:
    use_case = RenameConversationUseCase(SqlAlchemyCoachRepository(session))
    conv = await use_case.execute(
        auth=auth,
        conversation_id=conversation_id,
        title=body.title,
    )
    await session.commit()
    return ConversationResponse.from_domain(conv)


@router.delete(
    "/api/v1/coach/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_conversation(
    conversation_id: UUID,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    binary_storage: Annotated[BinaryStoragePort, Depends(get_binary_storage)],
) -> Response:
    use_case = DeleteConversationUseCase(
        SqlAlchemyCoachRepository(session),
        multimodal_repo=SqlAlchemyMultimodalRepository(session),
        binary_storage=binary_storage,
    )
    await use_case.execute(auth=auth, conversation_id=conversation_id)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
    messages = await use_case.execute(auth=auth, conversation_id=conversation_id)
    multimodal_repo = SqlAlchemyMultimodalRepository(session)
    att_by_msg = await multimodal_repo.list_attachments_for_messages(
        athlete_id=auth.athlete_id,
        message_ids=[m.id for m in messages],
    )
    return [
        ChatMessageResponse.from_domain(m, attachments=att_by_msg.get(m.id, []))
        for m in messages
    ]


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
    binary_storage: Annotated[BinaryStoragePort, Depends(get_binary_storage)],
) -> StreamingResponse:
    coach_repo = SqlAlchemyCoachRepository(session)
    multimodal_repo = SqlAlchemyMultimodalRepository(session)
    # Validate ownership & non-empty content BEFORE opening the SSE stream so 404/422 return cleanly
    if not body.content.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
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
    if body.attachment_ids:
        unique_att_ids = list(dict.fromkeys(body.attachment_ids))
        owned = await multimodal_repo.list_attachments_by_ids(
            athlete_id=auth.athlete_id,
            attachment_ids=unique_att_ids,
        )
        if len(owned) != len(unique_att_ids):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No se encontró el archivo adjunto solicitado.",
            )
        ensure_attachments_unlinked(owned)

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
        multimodal_repo=multimodal_repo,
        binary_storage=binary_storage,
    )

    async def event_generator() -> AsyncIterator[str]:
        try:
            async for event in use_case.execute(
                auth=auth,
                conversation_id=conversation_id,
                content=body.content,
                enable_live_search=body.enable_live_search,
                attachment_ids=body.attachment_ids,
            ):
                yield _format_sse(event.event, event.data)
            await session.commit()
        except Exception:  # pragma: no cover - defensive SSE error boundary
            await session.rollback()
            logger.exception(
                "Error inesperado en stream SSE del Coach (conversation_id=%s)",
                conversation_id,
            )
            yield _format_sse(
                "error",
                {
                    "detail": (
                        "Se produjo un error interno al generar la respuesta del Coach. "
                        "Inténtalo de nuevo en unos instantes."
                    )
                },
            )

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
        coach_repo=SqlAlchemyCoachRepository(session),
        knowledge_repo=SqlAlchemyKnowledgeRepository(session),
        ai_provider=ai_provider,
    )
    try:
        candidate = await use_case.execute(
            auth=auth,
            message_id=body.message_id,
            result_url=body.result_url,
        )
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
    except ProfileValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
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
    proposal = await use_case.execute(auth=auth, proposal_id=proposal_id)
    await session.commit()
    return ProfileProposalResponse.from_domain(proposal)
