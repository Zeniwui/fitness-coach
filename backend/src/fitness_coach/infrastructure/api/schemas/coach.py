"""Pydantic v2 API schemas for Coach Chat, SSE events, live-search promotion, and proposals."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from fitness_coach.domain.coach import (
    CONVERSATION_TITLE_MAX_LENGTH,
    BoundaryKind,
    ChatMessage,
    Citation,
    Conversation,
    MessageRole,
    ProfileUpdateProposal,
    ProposalStatus,
    QuarantinedLiveResult,
)
from fitness_coach.domain.multimodal import Attachment
from fitness_coach.infrastructure.api.schemas.multimodal import AttachmentResponse


class CreateConversationRequest(BaseModel):
    title: str | None = Field(default=None, max_length=CONVERSATION_TITLE_MAX_LENGTH)


class UpdateConversationRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=CONVERSATION_TITLE_MAX_LENGTH)


class ConversationResponse(BaseModel):
    id: UUID
    title: str
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_domain(cls, conv: Conversation) -> ConversationResponse:
        return cls(
            id=conv.id,
            title=conv.title,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
        )


class CitationResponse(BaseModel):
    card_id: UUID
    title: str
    evidence_level: str
    validity_status: str
    doi: str | None = None
    pmid: str | None = None
    source_url: str | None = None
    superseded_by_card_id: UUID | None = None
    superseded_by_title: str | None = None

    @classmethod
    def from_domain(cls, citation: Citation) -> CitationResponse:
        return cls(
            card_id=citation.card_id,
            title=citation.title,
            evidence_level=citation.evidence_level,
            validity_status=citation.validity_status,
            doi=citation.doi,
            pmid=citation.pmid,
            source_url=citation.source_url,
            superseded_by_card_id=citation.superseded_by_card_id,
            superseded_by_title=citation.superseded_by_title,
        )


class QuarantinedLiveResultResponse(BaseModel):
    title: str
    url: str
    snippet: str
    doi: str | None = None
    pmid: str | None = None
    published_year: int | None = None
    quarantine_label: str

    @classmethod
    def from_domain(cls, item: QuarantinedLiveResult) -> QuarantinedLiveResultResponse:
        return cls(
            title=item.title,
            url=item.url,
            snippet=item.snippet,
            doi=item.doi,
            pmid=item.pmid,
            published_year=item.published_year,
            quarantine_label=item.quarantine_label,
        )


class ChatMessageResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    role: MessageRole
    content: str
    citations: list[CitationResponse] = Field(default_factory=list)
    live_search_results: list[QuarantinedLiveResultResponse] = Field(default_factory=list)
    attachments: list[AttachmentResponse] = Field(default_factory=list)
    used_general_knowledge: bool = False
    boundary_triggered: BoundaryKind = BoundaryKind.NONE
    created_at: datetime | None = None

    @classmethod
    def from_domain(
        cls,
        msg: ChatMessage,
        *,
        attachments: list[Attachment] | None = None,
    ) -> ChatMessageResponse:
        return cls(
            id=msg.id,
            conversation_id=msg.conversation_id,
            role=msg.role,
            content=msg.content,
            citations=[CitationResponse.from_domain(c) for c in msg.citations],
            live_search_results=[
                QuarantinedLiveResultResponse.from_domain(r) for r in msg.live_search_results
            ],
            attachments=[AttachmentResponse.from_domain(a) for a in (attachments or [])],
            used_general_knowledge=msg.used_general_knowledge,
            boundary_triggered=msg.boundary_triggered,
            created_at=msg.created_at,
        )


class SendMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=6000)
    enable_live_search: bool = False
    attachment_ids: list[UUID] = Field(default_factory=list, max_length=4)


class PromoteLiveSearchRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    url: str = Field(..., min_length=1, max_length=1000)
    snippet: str = Field(default="", max_length=4000)
    doi: str | None = None
    pmid: str | None = None
    published_year: int | None = None


class PromoteLiveSearchResponse(BaseModel):
    candidate_id: UUID
    title: str
    origin: str
    status: str
    access_level: str


class ProfileProposalResponse(BaseModel):
    id: UUID
    message_id: UUID | None = None
    proposed_changes: dict[str, Any] = Field(default_factory=dict)
    summary_es: str
    status: ProposalStatus
    created_at: datetime
    resolved_at: datetime | None = None

    @classmethod
    def from_domain(cls, proposal: ProfileUpdateProposal) -> ProfileProposalResponse:
        return cls(
            id=proposal.id,
            message_id=proposal.message_id,
            proposed_changes=proposal.proposed_changes,
            summary_es=proposal.summary_es,
            status=proposal.status,
            created_at=proposal.created_at,
            resolved_at=proposal.resolved_at,
        )
