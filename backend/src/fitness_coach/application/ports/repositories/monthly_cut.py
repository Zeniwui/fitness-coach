"""Repository protocol for Monthly Cut & Trending Topics slice (#5)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Protocol
from uuid import UUID

from fitness_coach.domain.monthly_cut import (
    MonthlyCutRun,
    MonthlyCutRunType,
    MonthlyCutStatus,
    TrendingTopic,
    TrendingTopicStatus,
)


class MonthlyCutRepositoryPort(Protocol):
    """Persistence contract for MonthlyCutRun and TrendingTopic."""

    async def create_run(
        self,
        *,
        run_type: MonthlyCutRunType,
        date_from: date | None,
        date_to: date | None,
        query_override: str | None,
        max_candidates: int,
    ) -> MonthlyCutRun: ...

    async def get_run(self, run_id: UUID) -> MonthlyCutRun | None: ...

    async def list_runs(self, *, limit: int = 50) -> list[MonthlyCutRun]: ...

    async def update_run(
        self,
        *,
        run_id: UUID,
        status: MonthlyCutStatus | None = None,
        sources: list[str] | None = None,
        collected_count: int | None = None,
        filtered_count: int | None = None,
        analyzed_count: int | None = None,
        checkpoint_cursor: dict[str, Any] | None = None,
        pause_reason: str | None = ...,  # type: ignore[assignment]
        error_message: str | None = ...,  # type: ignore[assignment]
        finished_at: datetime | None = ...,  # type: ignore[assignment]
    ) -> MonthlyCutRun: ...

    async def get_existing_identifiers(self) -> tuple[set[str], set[str]]: ...

    async def create_trending_topic(
        self,
        *,
        monthly_cut_run_id: UUID | None,
        title: str,
        summary: str,
        critical_evaluation: str,
        cited_card_ids: list[UUID],
    ) -> TrendingTopic: ...

    async def get_trending_topic(self, topic_id: UUID) -> TrendingTopic | None: ...

    async def list_trending_topics(
        self,
        *,
        status: TrendingTopicStatus | None = None,
        run_id: UUID | None = None,
    ) -> list[TrendingTopic]: ...

    async def update_trending_topic_status(
        self,
        *,
        topic_id: UUID,
        status: TrendingTopicStatus,
    ) -> TrendingTopic: ...
