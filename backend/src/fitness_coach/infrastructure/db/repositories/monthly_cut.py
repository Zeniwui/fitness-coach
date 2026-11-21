"""SQLAlchemy 2 async repository for Monthly Cut & Trending Topics slice (#5)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fitness_coach.domain.knowledge import normalize_doi, normalize_pmid
from fitness_coach.domain.monthly_cut import (
    MonthlyCutNotFoundError,
    MonthlyCutRun,
    MonthlyCutRunType,
    MonthlyCutStatus,
    TrendingTopic,
    TrendingTopicNotFoundError,
    TrendingTopicStatus,
)
from fitness_coach.infrastructure.db.models.knowledge import (
    CandidateStudyModel,
    EvidenceCardModel,
)
from fitness_coach.infrastructure.db.models.monthly_cut import (
    MonthlyCutRunModel,
    TrendingTopicModel,
)

_UNSET: Any = object()


def _to_run_domain(row: MonthlyCutRunModel) -> MonthlyCutRun:
    return MonthlyCutRun(
        id=row.id,
        run_type=MonthlyCutRunType(row.run_type),
        date_from=row.date_from,
        date_to=row.date_to,
        query_override=row.query_override,
        max_candidates=row.max_candidates,
        sources=tuple(row.sources or []),
        status=MonthlyCutStatus(row.status),
        collected_count=row.collected_count,
        filtered_count=row.filtered_count,
        analyzed_count=row.analyzed_count,
        checkpoint_cursor=dict(row.checkpoint_cursor or {}),
        pause_reason=row.pause_reason,
        error_message=row.error_message,
        started_at=row.started_at,
        finished_at=row.finished_at,
    )


def _to_topic_domain(row: TrendingTopicModel) -> TrendingTopic:
    return TrendingTopic(
        id=row.id,
        monthly_cut_run_id=row.monthly_cut_run_id,
        title=row.title,
        summary=row.summary,
        critical_evaluation=row.critical_evaluation,
        cited_card_ids=tuple(row.cited_card_ids or []),
        status=TrendingTopicStatus(row.status),
        created_at=row.created_at,
    )


class SqlAlchemyMonthlyCutRepository:
    """Real PostgreSQL repository for monthly_cut_runs and trending_topics."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_run(
        self,
        *,
        run_type: MonthlyCutRunType,
        date_from: date | None,
        date_to: date | None,
        query_override: str | None,
        max_candidates: int,
    ) -> MonthlyCutRun:
        row = MonthlyCutRunModel(
            run_type=run_type.value,
            date_from=date_from,
            date_to=date_to,
            query_override=query_override,
            max_candidates=max_candidates,
            sources=[],
            status=MonthlyCutStatus.QUEUED.value,
            collected_count=0,
            filtered_count=0,
            analyzed_count=0,
            checkpoint_cursor={},
        )
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        return _to_run_domain(row)

    async def get_run(self, run_id: UUID) -> MonthlyCutRun | None:
        row = await self._session.get(MonthlyCutRunModel, run_id)
        return _to_run_domain(row) if row is not None else None

    async def list_runs(self, *, limit: int = 50) -> list[MonthlyCutRun]:
        stmt = (
            select(MonthlyCutRunModel).order_by(MonthlyCutRunModel.started_at.desc()).limit(limit)
        )
        rows = (await self._session.execute(stmt)).scalars().all()
        return [_to_run_domain(r) for r in rows]

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
        pause_reason: str | None = _UNSET,
        error_message: str | None = _UNSET,
        finished_at: datetime | None = _UNSET,
    ) -> MonthlyCutRun:
        row = await self._session.get(MonthlyCutRunModel, run_id)
        if row is None:
            raise MonthlyCutNotFoundError("Ejecución de Corte Mensual no encontrada.")
        if status is not None:
            row.status = status.value
        if sources is not None:
            row.sources = list(sources)
        if collected_count is not None:
            row.collected_count = collected_count
        if filtered_count is not None:
            row.filtered_count = filtered_count
        if analyzed_count is not None:
            row.analyzed_count = analyzed_count
        if checkpoint_cursor is not None:
            row.checkpoint_cursor = dict(checkpoint_cursor)
        if pause_reason is not _UNSET:
            row.pause_reason = pause_reason
        if error_message is not _UNSET:
            row.error_message = error_message
        if finished_at is not _UNSET:
            row.finished_at = finished_at
        await self._session.flush()
        await self._session.refresh(row)
        return _to_run_domain(row)

    async def get_existing_identifiers(self) -> tuple[set[str], set[str]]:
        """Collect normalized DOIs and PMIDs from CandidateStudies & EvidenceCards."""
        dois: set[str] = set()
        pmids: set[str] = set()

        cand_rows = (
            await self._session.execute(select(CandidateStudyModel.doi, CandidateStudyModel.pmid))
        ).all()
        for doi, pmid in cand_rows:
            if norm_doi := normalize_doi(doi):
                dois.add(norm_doi)
            if norm_pmid := normalize_pmid(pmid):
                pmids.add(norm_pmid)

        card_rows = (
            await self._session.execute(select(EvidenceCardModel.doi, EvidenceCardModel.pmid))
        ).all()
        for doi, pmid in card_rows:
            if norm_doi := normalize_doi(doi):
                dois.add(norm_doi)
            if norm_pmid := normalize_pmid(pmid):
                pmids.add(norm_pmid)

        return dois, pmids

    async def create_trending_topic(
        self,
        *,
        monthly_cut_run_id: UUID | None,
        title: str,
        summary: str,
        critical_evaluation: str,
        cited_card_ids: list[UUID],
    ) -> TrendingTopic:
        row = TrendingTopicModel(
            monthly_cut_run_id=monthly_cut_run_id,
            title=title,
            summary=summary,
            critical_evaluation=critical_evaluation,
            cited_card_ids=list(cited_card_ids),
            status=TrendingTopicStatus.PENDING.value,
        )
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        return _to_topic_domain(row)

    async def get_trending_topic(self, topic_id: UUID) -> TrendingTopic | None:
        row = await self._session.get(TrendingTopicModel, topic_id)
        return _to_topic_domain(row) if row is not None else None

    async def list_trending_topics(
        self,
        *,
        status: TrendingTopicStatus | None = None,
        run_id: UUID | None = None,
    ) -> list[TrendingTopic]:
        stmt = select(TrendingTopicModel).order_by(TrendingTopicModel.created_at.desc())
        if status is not None:
            stmt = stmt.where(TrendingTopicModel.status == status.value)
        if run_id is not None:
            stmt = stmt.where(TrendingTopicModel.monthly_cut_run_id == run_id)
        rows = (await self._session.execute(stmt)).scalars().all()
        return [_to_topic_domain(r) for r in rows]

    async def update_trending_topic_status(
        self,
        *,
        topic_id: UUID,
        status: TrendingTopicStatus,
    ) -> TrendingTopic:
        row = await self._session.get(TrendingTopicModel, topic_id)
        if row is None:
            raise TrendingTopicNotFoundError("Tema de Actualidad no encontrado.")
        row.status = status.value
        await self._session.flush()
        await self._session.refresh(row)
        return _to_topic_domain(row)
