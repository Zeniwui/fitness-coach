"""Pydantic v2 API schemas for Monthly Cut, Seed Batch & Trending Topics (#5)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from fitness_coach.domain.monthly_cut import (
    DEFAULT_MAX_CANDIDATES,
    MonthlyCutRun,
    MonthlyCutRunType,
    MonthlyCutStatus,
    TrendingTopic,
    TrendingTopicStatus,
)


class TriggerMonthlyCutRequest(BaseModel):
    date_from: date | None = None
    date_to: date | None = None
    query_override: str | None = Field(default=None, max_length=500)
    max_candidates: int = Field(default=DEFAULT_MAX_CANDIDATES, ge=1, le=50)


class MonthlyCutRunResponse(BaseModel):
    id: UUID
    run_type: MonthlyCutRunType
    date_from: date | None
    date_to: date | None
    query_override: str | None
    max_candidates: int
    sources: list[str]
    status: MonthlyCutStatus
    collected_count: int
    filtered_count: int
    analyzed_count: int
    checkpoint_next_index: int
    checkpoint_queue_size: int
    pause_reason: str | None
    error_message: str | None
    started_at: datetime
    finished_at: datetime | None

    @classmethod
    def from_domain(cls, run: MonthlyCutRun) -> MonthlyCutRunResponse:
        cursor: dict[str, Any] = run.checkpoint_cursor or {}
        queue = cursor.get("queue") or []
        return cls(
            id=run.id,
            run_type=run.run_type,
            date_from=run.date_from,
            date_to=run.date_to,
            query_override=run.query_override,
            max_candidates=run.max_candidates,
            sources=list(run.sources),
            status=run.status,
            collected_count=run.collected_count,
            filtered_count=run.filtered_count,
            analyzed_count=run.analyzed_count,
            checkpoint_next_index=int(cursor.get("next_index", 0)),
            checkpoint_queue_size=len(queue) if isinstance(queue, list) else 0,
            pause_reason=run.pause_reason,
            error_message=run.error_message,
            started_at=run.started_at,
            finished_at=run.finished_at,
        )


class MonthlyCutRunListResponse(BaseModel):
    items: list[MonthlyCutRunResponse]


class SeedBatchResponse(BaseModel):
    run_id: UUID
    total_in_catalog: int
    created_count: int
    skipped_count: int


class TrendingTopicResponse(BaseModel):
    id: UUID
    monthly_cut_run_id: UUID | None
    title: str
    summary: str
    critical_evaluation: str
    cited_card_ids: list[UUID]
    status: TrendingTopicStatus
    created_at: datetime

    @classmethod
    def from_domain(cls, topic: TrendingTopic) -> TrendingTopicResponse:
        return cls(
            id=topic.id,
            monthly_cut_run_id=topic.monthly_cut_run_id,
            title=topic.title,
            summary=topic.summary,
            critical_evaluation=topic.critical_evaluation,
            cited_card_ids=list(topic.cited_card_ids),
            status=topic.status,
            created_at=topic.created_at,
        )


class TrendingTopicListResponse(BaseModel):
    items: list[TrendingTopicResponse]


class ReviewTrendingTopicRequest(BaseModel):
    decision: TrendingTopicStatus
