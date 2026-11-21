"""SQLAlchemy 2 async repository for Coach Chat strictly isolated by athlete_id."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fitness_coach.domain.coach import (
    BoundaryKind,
    ChatMessage,
    Citation,
    Conversation,
    MessageRole,
    ProfileUpdateProposal,
    ProposalStatus,
    QuarantinedLiveResult,
)
from fitness_coach.infrastructure.db.models.coach import (
    ConversationModel,
    MessageModel,
    ProfileUpdateProposalModel,
)


def _to_conversation(row: ConversationModel) -> Conversation:
    return Conversation(
        id=row.id,
        athlete_id=row.athlete_id,
        title=row.title,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _to_message(row: MessageModel) -> ChatMessage:
    return ChatMessage(
        id=row.id,
        conversation_id=row.conversation_id,
        athlete_id=row.athlete_id,
        role=MessageRole(row.role),
        content=row.content,
        citations=tuple(Citation.from_dict(item) for item in (row.citations or [])),
        live_search_results=tuple(
            QuarantinedLiveResult.from_dict(item) for item in (row.live_search_results or [])
        ),
        used_general_knowledge=bool(row.used_general_knowledge),
        boundary_triggered=BoundaryKind(row.boundary_triggered or "none"),
        created_at=row.created_at,
    )


def _to_proposal(row: ProfileUpdateProposalModel) -> ProfileUpdateProposal:
    return ProfileUpdateProposal(
        id=row.id,
        athlete_id=row.athlete_id,
        message_id=row.message_id,
        proposed_changes=dict(row.proposed_changes or {}),
        summary_es=row.summary_es,
        status=ProposalStatus(row.status),
        created_at=row.created_at,
        resolved_at=row.resolved_at,
    )


class SqlAlchemyCoachRepository:
    """Async PostgreSQL repository enforcing athlete_id on every query (ADR-0002)."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_conversation(self, *, athlete_id: UUID, title: str) -> Conversation:
        row = ConversationModel(athlete_id=athlete_id, title=title)
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        return _to_conversation(row)

    async def list_conversations(self, *, athlete_id: UUID) -> list[Conversation]:
        stmt = (
            select(ConversationModel)
            .where(ConversationModel.athlete_id == athlete_id)
            .order_by(ConversationModel.updated_at.desc(), ConversationModel.created_at.desc())
        )
        rows = (await self._session.execute(stmt)).scalars().all()
        return [_to_conversation(row) for row in rows]

    async def get_conversation(
        self, *, athlete_id: UUID, conversation_id: UUID
    ) -> Conversation | None:
        stmt = select(ConversationModel).where(
            ConversationModel.id == conversation_id,
            ConversationModel.athlete_id == athlete_id,
        )
        row = (await self._session.execute(stmt)).scalar_one_or_none()
        return _to_conversation(row) if row is not None else None

    async def touch_conversation(
        self, *, athlete_id: UUID, conversation_id: UUID, title: str | None = None
    ) -> None:
        stmt = select(ConversationModel).where(
            ConversationModel.id == conversation_id,
            ConversationModel.athlete_id == athlete_id,
        )
        row = (await self._session.execute(stmt)).scalar_one_or_none()
        if row is None:
            return
        if title is not None:
            row.title = title
        row.updated_at = datetime.now(UTC)
        await self._session.flush()

    async def create_message(
        self,
        *,
        conversation_id: UUID,
        athlete_id: UUID,
        role: MessageRole,
        content: str,
        citations: tuple[Citation, ...] = (),
        live_search_results: tuple[QuarantinedLiveResult, ...] = (),
        used_general_knowledge: bool = False,
        boundary_triggered: BoundaryKind = BoundaryKind.NONE,
    ) -> ChatMessage:
        row = MessageModel(
            conversation_id=conversation_id,
            athlete_id=athlete_id,
            role=role.value,
            content=content,
            citations=[c.to_dict() for c in citations],
            live_search_results=[r.to_dict() for r in live_search_results],
            used_general_knowledge=used_general_knowledge,
            boundary_triggered=boundary_triggered.value,
            created_at=datetime.now(UTC),
        )
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        return _to_message(row)

    async def list_messages(
        self, *, athlete_id: UUID, conversation_id: UUID, limit: int = 100
    ) -> list[ChatMessage]:
        stmt = (
            select(MessageModel)
            .where(
                MessageModel.conversation_id == conversation_id,
                MessageModel.athlete_id == athlete_id,
            )
            .order_by(MessageModel.created_at.asc(), MessageModel.id.asc())
            .limit(limit)
        )
        rows = (await self._session.execute(stmt)).scalars().all()
        return [_to_message(row) for row in rows]

    async def create_proposal(
        self,
        *,
        athlete_id: UUID,
        message_id: UUID | None,
        proposed_changes: dict[str, Any],
        summary_es: str,
    ) -> ProfileUpdateProposal:
        row = ProfileUpdateProposalModel(
            athlete_id=athlete_id,
            message_id=message_id,
            proposed_changes=dict(proposed_changes),
            summary_es=summary_es,
            status=ProposalStatus.PROPOSED.value,
        )
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        return _to_proposal(row)

    async def list_proposals(
        self, *, athlete_id: UUID, status: ProposalStatus | None = None
    ) -> list[ProfileUpdateProposal]:
        stmt = select(ProfileUpdateProposalModel).where(
            ProfileUpdateProposalModel.athlete_id == athlete_id
        )
        if status is not None:
            stmt = stmt.where(ProfileUpdateProposalModel.status == status.value)
        stmt = stmt.order_by(ProfileUpdateProposalModel.created_at.desc())
        rows = (await self._session.execute(stmt)).scalars().all()
        return [_to_proposal(row) for row in rows]

    async def get_proposal(
        self, *, athlete_id: UUID, proposal_id: UUID
    ) -> ProfileUpdateProposal | None:
        stmt = select(ProfileUpdateProposalModel).where(
            ProfileUpdateProposalModel.id == proposal_id,
            ProfileUpdateProposalModel.athlete_id == athlete_id,
        )
        row = (await self._session.execute(stmt)).scalar_one_or_none()
        return _to_proposal(row) if row is not None else None

    async def resolve_proposal(
        self,
        *,
        athlete_id: UUID,
        proposal_id: UUID,
        status: ProposalStatus,
        resolved_at: datetime,
    ) -> ProfileUpdateProposal | None:
        stmt = select(ProfileUpdateProposalModel).where(
            ProfileUpdateProposalModel.id == proposal_id,
            ProfileUpdateProposalModel.athlete_id == athlete_id,
        )
        row = (await self._session.execute(stmt)).scalar_one_or_none()
        if row is None:
            return None
        row.status = status.value
        row.resolved_at = resolved_at
        await self._session.flush()
        await self._session.refresh(row)
        return _to_proposal(row)
