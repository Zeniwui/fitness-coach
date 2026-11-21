"""FastAPI router for Multimodal Gym Flows (#9): attachments, voice transcription, NL sessions."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from fitness_coach.application.ports.ai_provider import AIProviderPort
from fitness_coach.application.ports.identity_storage import BinaryStoragePort
from fitness_coach.application.use_cases.multimodal import (
    GetAttachmentContentUseCase,
    ParseNaturalTrainingSessionUseCase,
    TranscribeAudioUseCase,
    UploadAttachmentUseCase,
)
from fitness_coach.domain.identity import AuthContext
from fitness_coach.domain.multimodal import (
    AttachmentNotFoundError,
    ImageAnalysisCategory,
    MultimodalValidationError,
)
from fitness_coach.infrastructure.api.deps import (
    get_ai_provider,
    get_binary_storage,
    get_current_auth,
    get_db_session,
)
from fitness_coach.infrastructure.api.schemas.multimodal import (
    AttachmentResponse,
    ParseNaturalSessionRequest,
    TrainingSessionDraftResponse,
    TranscribeAudioResponse,
)
from fitness_coach.infrastructure.db.repositories.multimodal import SqlAlchemyMultimodalRepository

router = APIRouter(tags=["multimodal"])


@router.post(
    "/api/v1/multimodal/attachments",
    response_model=AttachmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    binary_storage: Annotated[BinaryStoragePort, Depends(get_binary_storage)],
    file: Annotated[UploadFile, File(...)],
    category: Annotated[ImageAnalysisCategory | None, Form()] = None,
) -> AttachmentResponse:
    raw_bytes = await file.read()
    mime_type = file.content_type or "application/octet-stream"
    use_case = UploadAttachmentUseCase(
        repo=SqlAlchemyMultimodalRepository(session),
        binary_storage=binary_storage,
    )
    try:
        attachment = await use_case.execute(
            auth=auth,
            data=raw_bytes,
            mime_type=mime_type,
            original_filename=file.filename,
            category=category,
        )
    except MultimodalValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc

    await session.commit()
    return AttachmentResponse.from_domain(attachment)


@router.post(
    "/api/v1/multimodal/transcribe",
    response_model=TranscribeAudioResponse,
)
async def transcribe_audio(
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    ai_provider: Annotated[AIProviderPort, Depends(get_ai_provider)],
    file: Annotated[UploadFile, File(...)],
) -> TranscribeAudioResponse:
    raw_bytes = await file.read()
    mime_type = file.content_type or "application/octet-stream"
    use_case = TranscribeAudioUseCase(ai_provider=ai_provider)
    try:
        transcript = await use_case.execute(
            auth=auth,
            audio_bytes=raw_bytes,
            mime_type=mime_type,
        )
    except MultimodalValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    return TranscribeAudioResponse(transcript=transcript, language="es")


@router.post(
    "/api/v1/training/sessions/parse-natural",
    response_model=TrainingSessionDraftResponse,
)
async def parse_natural_training_session(
    body: ParseNaturalSessionRequest,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    ai_provider: Annotated[AIProviderPort, Depends(get_ai_provider)],
) -> TrainingSessionDraftResponse:
    use_case = ParseNaturalTrainingSessionUseCase(ai_provider=ai_provider)
    try:
        draft = await use_case.execute(
            auth=auth,
            text=body.text,
            origin=body.origin,
            session_date=body.session_date,
        )
    except MultimodalValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    return TrainingSessionDraftResponse.from_domain(draft)


@router.get(
    "/api/v1/multimodal/attachments/{attachment_id}",
    responses={200: {"content": {"application/octet-stream": {}}}},
)
async def get_attachment_content(
    attachment_id: UUID,
    auth: Annotated[AuthContext, Depends(get_current_auth)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    binary_storage: Annotated[BinaryStoragePort, Depends(get_binary_storage)],
) -> Response:
    use_case = GetAttachmentContentUseCase(
        repo=SqlAlchemyMultimodalRepository(session),
        binary_storage=binary_storage,
    )
    try:
        attachment, payload = await use_case.execute(auth=auth, attachment_id=attachment_id)
    except AttachmentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return Response(content=payload, media_type=attachment.mime_type)
