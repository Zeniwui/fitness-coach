"""SQLAlchemy 2 async repository for multimodal attachments strictly isolated by athlete_id."""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from fitness_coach.domain.multimodal import (
    Attachment,
    AttachmentMediaType,
    ImageAnalysisCategory,
)
from fitness_coach.infrastructure.db.models.multimodal import AttachmentModel


def _to_attachment(row: AttachmentModel) -> Attachment:
    return Attachment(
        id=row.id,
        athlete_id=row.athlete_id,
        message_id=row.message_id,
        media_type=AttachmentMediaType(row.media_type),
        mime_type=row.mime_type,
        original_filename=row.original_filename,
        storage_path=row.storage_path,
        size_bytes=row.size_bytes,
        category=ImageAnalysisCategory(row.category) if row.category else None,
        created_at=row.created_at,
    )


class SqlAlchemyMultimodalRepository:
    """Async PostgreSQL repository enforcing athlete_id on every query (ADR-0002)."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

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
    ) -> Attachment:
        row = AttachmentModel(
            id=attachment_id,
            athlete_id=athlete_id,
            message_id=message_id,
            media_type=media_type.value,
            mime_type=mime_type,
            original_filename=original_filename,
            storage_path=storage_path,
            size_bytes=size_bytes,
            category=category.value if category is not None else None,
        )
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        return _to_attachment(row)

    async def get_attachment(
        self, *, athlete_id: UUID, attachment_id: UUID
    ) -> Attachment | None:
        stmt = select(AttachmentModel).where(
            AttachmentModel.id == attachment_id,
            AttachmentModel.athlete_id == athlete_id,
        )
        row = (await self._session.execute(stmt)).scalar_one_or_none()
        return _to_attachment(row) if row is not None else None

    async def list_attachments_by_ids(
        self, *, athlete_id: UUID, attachment_ids: Sequence[UUID]
    ) -> list[Attachment]:
        if not attachment_ids:
            return []
        stmt = (
            select(AttachmentModel)
            .where(
                AttachmentModel.athlete_id == athlete_id,
                AttachmentModel.id.in_(list(attachment_ids)),
            )
            .order_by(AttachmentModel.created_at.asc())
        )
        rows = (await self._session.execute(stmt)).scalars().all()
        return [_to_attachment(row) for row in rows]

    async def list_attachments_for_messages(
        self, *, athlete_id: UUID, message_ids: Sequence[UUID]
    ) -> dict[UUID, list[Attachment]]:
        if not message_ids:
            return {}
        stmt = (
            select(AttachmentModel)
            .where(
                AttachmentModel.athlete_id == athlete_id,
                AttachmentModel.message_id.in_(list(message_ids)),
            )
            .order_by(AttachmentModel.created_at.asc())
        )
        rows = (await self._session.execute(stmt)).scalars().all()
        grouped: dict[UUID, list[Attachment]] = {}
        for row in rows:
            if row.message_id is not None:
                grouped.setdefault(row.message_id, []).append(_to_attachment(row))
        return grouped

    async def link_attachments_to_message(
        self,
        *,
        athlete_id: UUID,
        attachment_ids: Sequence[UUID],
        message_id: UUID,
    ) -> None:
        if not attachment_ids:
            return
        stmt = (
            update(AttachmentModel)
            .where(
                AttachmentModel.athlete_id == athlete_id,
                AttachmentModel.id.in_(list(attachment_ids)),
            )
            .values(message_id=message_id)
        )
        await self._session.execute(stmt)
        await self._session.flush()
