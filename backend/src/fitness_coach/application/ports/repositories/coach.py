"""Repository protocol for Coach conversations, messages, and Living Profile proposals."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol
from uuid import UUID

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


class CoachRepositoryPort(Protocol):
    """Persistence contract for Coach Chat strictly scoped by athlete_id (ADR-0002)."""

    async def create_conversation(self, *, athlete_id: UUID, title: str) -> Conversation: ...

    async def list_conversations(self, *, athlete_id: UUID) -> list[Conversation]: ...

    async def get_conversation(
        self, *, athlete_id: UUID, conversation_id: UUID
    ) -> Conversation | None: ...

    async def touch_conversation(
        self, *, athlete_id: UUID, conversation_id: UUID, title: str | None = None
    ) -> None: ...

    async def update_conversation_title(
        self, *, athlete_id: UUID, conversation_id: UUID, title: str
    ) -> Conversation | None: ...

    async def delete_conversation(
        self, *, athlete_id: UUID, conversation_id: UUID
    ) -> bool: ...

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
    ) -> ChatMessage: ...

    async def list_messages(
        self, *, athlete_id: UUID, conversation_id: UUID, limit: int = 100
    ) -> list[ChatMessage]: ...

    async def create_proposal(
        self,
        *,
        athlete_id: UUID,
        message_id: UUID | None,
        proposed_changes: dict[str, Any],
        summary_es: str,
    ) -> ProfileUpdateProposal: ...

    async def list_proposals(
        self, *, athlete_id: UUID, status: ProposalStatus | None = None
    ) -> list[ProfileUpdateProposal]: ...

    async def get_proposal(
        self, *, athlete_id: UUID, proposal_id: UUID
    ) -> ProfileUpdateProposal | None: ...

    async def resolve_proposal(
        self,
        *,
        athlete_id: UUID,
        proposal_id: UUID,
        status: ProposalStatus,
        resolved_at: datetime,
    ) -> ProfileUpdateProposal | None: ...
