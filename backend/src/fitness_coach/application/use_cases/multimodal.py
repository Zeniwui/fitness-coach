"""Application use cases for Multimodal Gym Flows (#9)."""

from __future__ import annotations

from datetime import date
from uuid import UUID, uuid4

from fitness_coach.application.ports.ai_provider import AIProviderPort, ModelTier
from fitness_coach.application.ports.identity_storage import BinaryStoragePort
from fitness_coach.application.ports.repositories.multimodal import MultimodalRepositoryPort
from fitness_coach.domain.identity import AuthContext
from fitness_coach.domain.multimodal import (
    Attachment,
    AttachmentNotFoundError,
    ImageAnalysisCategory,
    MultimodalValidationError,
    TrainingSessionDraft,
    build_session_draft_from_structured,
    parse_natural_training_session_fallback,
    validate_attachment_upload,
    validate_audio_upload,
)
from fitness_coach.domain.training import SessionOrigin


class UploadAttachmentUseCase:
    """Validates and persists an Athlete-scoped image/audio attachment under <athlete_id>/."""

    def __init__(
        self,
        *,
        repo: MultimodalRepositoryPort,
        binary_storage: BinaryStoragePort,
    ) -> None:
        self._repo = repo
        self._storage = binary_storage

    async def execute(
        self,
        *,
        auth: AuthContext,
        data: bytes,
        mime_type: str,
        original_filename: str | None = None,
        category: ImageAnalysisCategory | None = None,
    ) -> Attachment:
        media_type, norm_mime, ext = validate_attachment_upload(
            data=data,
            mime_type=mime_type,
            category=category,
        )
        attachment_id = uuid4()
        relative_path = f"attachments/{attachment_id}.{ext}"
        storage_path = await self._storage.put_athlete_object(
            athlete_id=auth.athlete_id,
            relative_path=relative_path,
            data=data,
            content_type=norm_mime,
        )
        cleaned_filename = original_filename.strip()[:255] if original_filename else None
        return await self._repo.create_attachment(
            attachment_id=attachment_id,
            athlete_id=auth.athlete_id,
            media_type=media_type,
            mime_type=norm_mime,
            original_filename=cleaned_filename,
            storage_path=storage_path,
            size_bytes=len(data),
            category=category,
        )


class GetAttachmentContentUseCase:
    """Retrieves an Athlete's own attachment bytes; hides cross-Athlete existence (404)."""

    def __init__(
        self,
        *,
        repo: MultimodalRepositoryPort,
        binary_storage: BinaryStoragePort,
    ) -> None:
        self._repo = repo
        self._storage = binary_storage

    async def execute(
        self,
        *,
        auth: AuthContext,
        attachment_id: UUID,
    ) -> tuple[Attachment, bytes]:
        attachment = await self._repo.get_attachment(
            athlete_id=auth.athlete_id,
            attachment_id=attachment_id,
        )
        if attachment is None:
            raise AttachmentNotFoundError("No se encontró el archivo adjunto solicitado.")
        try:
            payload = await self._storage.get_athlete_object(
                athlete_id=auth.athlete_id,
                storage_path=attachment.storage_path,
            )
        except FileNotFoundError as exc:
            raise AttachmentNotFoundError(
                "No se encontró el contenido del archivo adjunto."
            ) from exc
        return attachment, payload


class TranscribeAudioUseCase:
    """Transcribes Athlete voice audio to Spanish text via AIProviderPort."""

    def __init__(self, *, ai_provider: AIProviderPort) -> None:
        self._ai_provider = ai_provider

    async def execute(
        self,
        *,
        auth: AuthContext,
        audio_bytes: bytes,
        mime_type: str,
    ) -> str:
        _ = auth
        norm_mime = validate_audio_upload(data=audio_bytes, mime_type=mime_type)
        transcript = await self._ai_provider.transcribe_audio(audio_bytes, norm_mime)
        return transcript.strip()


_SESSION_DRAFT_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "fatigue_notes": {"type": ["string", "null"]},
        "sets": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "exercise_name": {"type": "string"},
                    "muscle_group": {"type": "string"},
                    "reps": {"type": ["integer", "null"]},
                    "load": {"type": ["number", "null"]},
                    "unit": {"type": "string", "enum": ["kg", "lb"]},
                    "rir": {"type": ["number", "null"]},
                    "rpe": {"type": ["number", "null"]},
                    "notes": {"type": ["string", "null"]},
                },
            },
        },
    },
    "required": ["sets"],
}


class ParseNaturalTrainingSessionUseCase:
    """Converts Spanish natural text/voice into an editable TrainingSessionDraft.

    NEVER persists to training_sessions; the Athlete must edit/confirm explicitly.
    """

    def __init__(self, *, ai_provider: AIProviderPort) -> None:
        self._ai_provider = ai_provider

    async def execute(
        self,
        *,
        auth: AuthContext,
        text: str,
        origin: SessionOrigin = SessionOrigin.CHAT_TEXT,
        session_date: date | None = None,
    ) -> TrainingSessionDraft:
        _ = auth
        cleaned = text.strip()
        if not cleaned:
            raise MultimodalValidationError(
                "Describe tu Sesión de Entrenamiento para generar el borrador."
            )
        target_date = session_date or date.today()

        response = await self._ai_provider.generate(
            tier=ModelTier.FAST,
            system_prompt=(
                "Eres un extractor estructurado de Sesiones de Entrenamiento en español. "
                "Convierte la descripción en JSON con 'name', 'fatigue_notes' y 'sets' "
                "(una entrada por serie). Si falta la carga, las repeticiones o el RIR/RPE, "
                "devuelve null — NUNCA inventes datos."
            ),
            user_prompt=cleaned,
            json_schema=_SESSION_DRAFT_SCHEMA,
        )

        if response.structured_data:
            built = build_session_draft_from_structured(
                structured=response.structured_data,
                raw_text=cleaned,
                origin=origin,
                session_date=target_date,
            )
            if built is not None:
                return built

        return parse_natural_training_session_fallback(
            raw_text=cleaned,
            origin=origin,
            session_date=target_date,
        )
