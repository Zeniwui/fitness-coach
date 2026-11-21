"""ORM models for Knowledge Base & Curator Inbox slice."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from fitness_coach.infrastructure.db.base import Base


class CandidateStudyModel(Base):
    """Estudio Candidato awaiting or resolved by Curator review."""

    __tablename__ = "candidate_studies"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    doi: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    pmid: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    pmcid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    authors: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    journal: Mapped[str | None] = mapped_column(String(255), nullable=True)
    published_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    origin: Mapped[str] = mapped_column(String(32), nullable=False)
    access_level: Mapped[str] = mapped_column(String(32), nullable=False)
    critical_sheet: Mapped[dict] = mapped_column(JSONB, nullable=False)
    previous_critical_sheet: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, index=True, default="pending")
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    curator_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    pdf_storage_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    monthly_cut_run_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class EvidenceCardModel(Base):
    """Ficha de Evidencia approved by Curator and indexed for hybrid search."""

    __tablename__ = "evidence_cards"
    __table_args__ = (
        Index("ix_evidence_cards_search_tsv", "search_tsv", postgresql_using="gin"),
        Index("ix_evidence_cards_tags", "tags", postgresql_using="gin"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    candidate_study_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("candidate_studies.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )
    doi: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    pmid: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_level: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    coverage: Mapped[str] = mapped_column(String(24), nullable=False)
    curated_text_es: Mapped[str] = mapped_column(Text, nullable=False)
    key_terms_en: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list)
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list)
    curator_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    validity_status: Mapped[str] = mapped_column(
        String(24), nullable=False, index=True, default="active"
    )
    embedding: Mapped[list[float]] = mapped_column(Vector(), nullable=False)
    embedding_model: Mapped[str] = mapped_column(String(128), nullable=False)
    search_tsv: Mapped[str] = mapped_column(TSVECTOR, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class EvidenceRelationModel(Base):
    """Directed evolution edge between EvidenceCards (confirms, nuances, supersedes)."""

    __tablename__ = "evidence_relations"
    __table_args__ = (
        UniqueConstraint(
            "source_card_id",
            "target_card_id",
            "relation_type",
            name="uq_evidence_relations_source_target_type",
        ),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    source_card_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("evidence_cards.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    target_card_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("evidence_cards.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    relation_type: Mapped[str] = mapped_column(String(24), nullable=False)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
