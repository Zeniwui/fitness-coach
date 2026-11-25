"""Repository protocol for Athlete-isolated multimodal attachments."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol
from uuid import UUID

from fitness_coach.domain.multimodal import (
    Attachment,
    AttachmentMediaType,
    ImageAnalysisCategory,
)


class MultimodalRepositoryPort(Protocol):
    """Persistence contract for multimodal attachments strictly scoped by athlete_id."""

    async def create_attachment(
        self,
        *,
        attachment_id: UUID,
        athlete_id: UUID,
        media_type: AttachmentMediaType,
        mime_type: str,
        original_filename: str | None,
        storage_path: str,
        size_bytes: int,
        category: ImageAnalysisCategory | None = None,
        message_id: UUID | None = None,
    ) -> Attachment: ...

    async def get_attachment(
        self, *, athlete_id: UUID, attachment_id: UUID
    ) -> Attachment | None: ...

    async def list_attachments_by_ids(
        self, *, athlete_id: UUID, attachment_ids: Sequence[UUID]
    ) -> list[Attachment]: ...

    async def list_attachments_for_messages(
        self, *, athlete_id: UUID, message_ids: Sequence[UUID]
    ) -> dict[UUID, list[Attachment]]: ...

    async def list_attachments_for_conversation(
        self, *, athlete_id: UUID, conversation_id: UUID
    ) -> list[Attachment]: ...

    async def delete_attachments_by_ids(
        self, *, athlete_id: UUID, attachment_ids: Sequence[UUID]
    ) -> int: ...

    async def link_attachments_to_message(
        self,
        *,
        athlete_id: UUID,
        attachment_ids: Sequence[UUID],
        message_id: UUID,
    ) -> int: ...
