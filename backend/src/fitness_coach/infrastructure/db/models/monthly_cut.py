"""ORM models for Monthly Cut & Trending Topics slice (#5)."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from fitness_coach.infrastructure.db.base import Base


class MonthlyCutRunModel(Base):
    """Execution record for a Corte Mensual with durable checkpointing."""

    __tablename__ = "monthly_cut_runs"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    run_type: Mapped[str] = mapped_column(String(24), nullable=False)
    date_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    date_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    query_override: Mapped[str | None] = mapped_column(Text, nullable=True)
    max_candidates: Mapped[int] = mapped_column(Integer, nullable=False, default=12)
    sources: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True, default="queued")
    collected_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    filtered_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    analyzed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    checkpoint_cursor: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    pause_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TrendingTopicModel(Base):
    """Tema de Actualidad contrasted against KnowledgeBase; isolated from EvidenceCard index."""

    __tablename__ = "trending_topics"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    monthly_cut_run_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("monthly_cut_runs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    critical_evaluation: Mapped[str] = mapped_column(Text, nullable=False)
    cited_card_ids: Mapped[list[UUID]] = mapped_column(
        ARRAY(PG_UUID(as_uuid=True)), nullable=False, default=list
    )
    status: Mapped[str] = mapped_column(String(24), nullable=False, index=True, default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
