"""Pydantic v2 request/response DTOs for Multimodal Gym Flows (#9)."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from fitness_coach.domain.multimodal import (
    AmbiguityFlag,
    Attachment,
    AttachmentMediaType,
    DraftSetEntry,
    ImageAnalysisCategory,
    TrainingSessionDraft,
)
from fitness_coach.domain.training import LoadUnit, SessionOrigin


class AttachmentResponse(BaseModel):
    id: UUID
    message_id: UUID | None = None
    media_type: AttachmentMediaType
    mime_type: str
    original_filename: str | None = None
    size_bytes: int
    category: ImageAnalysisCategory | None = None
    created_at: datetime

    @classmethod
    def from_domain(cls, attachment: Attachment) -> AttachmentResponse:
        return cls(
            id=attachment.id,
            message_id=attachment.message_id,
            media_type=attachment.media_type,
            mime_type=attachment.mime_type,
            original_filename=attachment.original_filename,
            size_bytes=attachment.size_bytes,
            category=attachment.category,
            created_at=attachment.created_at,
        )


class TranscribeAudioResponse(BaseModel):
    transcript: str
    language: str = "es"


class ParseNaturalSessionRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    origin: SessionOrigin = SessionOrigin.CHAT_TEXT
    session_date: date | None = None


class DraftSetEntryResponse(BaseModel):
    exercise_name: str
    muscle_group: str
    set_order: int
    reps: int | None = None
    load: float | None = None
    unit: LoadUnit = LoadUnit.KG
    rir: float | None = None
    rpe: float | None = None
    notes: str | None = None
    missing_fields: list[str] = Field(default_factory=list)

    @classmethod
    def from_domain(cls, entry: DraftSetEntry) -> DraftSetEntryResponse:
        return cls(
            exercise_name=entry.exercise_name,
            muscle_group=entry.muscle_group,
            set_order=entry.set_order,
            reps=entry.reps,
            load=entry.load,
            unit=entry.unit,
            rir=entry.rir,
            rpe=entry.rpe,
            notes=entry.notes,
            missing_fields=list(entry.missing_fields),
        )


class AmbiguityFlagResponse(BaseModel):
    field: str
    set_index: int | None = None
    message_es: str

    @classmethod
    def from_domain(cls, flag: AmbiguityFlag) -> AmbiguityFlagResponse:
        return cls(
            field=flag.field,
            set_index=flag.set_index,
            message_es=flag.message_es,
        )


class TrainingSessionDraftResponse(BaseModel):
    session_date: date
    name: str
    origin: SessionOrigin
    raw_text: str
    fatigue_notes: str | None = None
    sets: list[DraftSetEntryResponse] = Field(default_factory=list)
    ambiguities: list[AmbiguityFlagResponse] = Field(default_factory=list)
    needs_confirmation: bool = True

    @classmethod
    def from_domain(cls, draft: TrainingSessionDraft) -> TrainingSessionDraftResponse:
        return cls(
            session_date=draft.session_date,
            name=draft.name,
            origin=draft.origin,
            raw_text=draft.raw_text,
            fatigue_notes=draft.fatigue_notes,
            sets=[DraftSetEntryResponse.from_domain(s) for s in draft.sets],
            ambiguities=[AmbiguityFlagResponse.from_domain(a) for a in draft.ambiguities],
            needs_confirmation=draft.needs_confirmation,
        )
