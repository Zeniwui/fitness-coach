"""Create knowledge base tables: candidate_studies, evidence_cards, evidence_relations.

Revision ID: 0003_knowledge_base
Revises: 0002_living_profile
Create Date: 2026-11-21 18:20:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision: str = "0003_knowledge_base"
down_revision: str | None = "0002_living_profile"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "candidate_studies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("doi", sa.String(length=255), nullable=True),
        sa.Column("pmid", sa.String(length=64), nullable=True),
        sa.Column("pmcid", sa.String(length=64), nullable=True),
        sa.Column("content_hash", sa.String(length=64), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("authors", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("journal", sa.String(length=255), nullable=True),
        sa.Column("published_year", sa.Integer(), nullable=True),
        sa.Column("origin", sa.String(length=32), nullable=False),
        sa.Column("access_level", sa.String(length=32), nullable=False),
        sa.Column("critical_sheet", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "previous_critical_sheet", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="pending"),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("curator_notes", sa.Text(), nullable=True),
        sa.Column("pdf_storage_path", sa.Text(), nullable=True),
        sa.Column("monthly_cut_run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_candidate_studies_doi", "candidate_studies", ["doi"], unique=False)
    op.create_index("ix_candidate_studies_pmid", "candidate_studies", ["pmid"], unique=False)
    op.create_index(
        "ix_candidate_studies_content_hash", "candidate_studies", ["content_hash"], unique=False
    )
    op.create_index("ix_candidate_studies_status", "candidate_studies", ["status"], unique=False)

    op.create_table(
        "evidence_cards",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "candidate_study_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("candidate_studies.id", ondelete="RESTRICT"),
            nullable=False,
            unique=True,
        ),
        sa.Column("doi", sa.String(length=255), nullable=True),
        sa.Column("pmid", sa.String(length=64), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("evidence_level", sa.String(length=32), nullable=False),
        sa.Column("coverage", sa.String(length=24), nullable=False),
        sa.Column("curated_text_es", sa.Text(), nullable=False),
        sa.Column(
            "key_terms_en",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
        sa.Column(
            "tags",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
        sa.Column("curator_notes", sa.Text(), nullable=True),
        sa.Column("validity_status", sa.String(length=24), nullable=False, server_default="active"),
        sa.Column("embedding", Vector(), nullable=False),
        sa.Column("embedding_model", sa.String(length=128), nullable=False),
        sa.Column("search_tsv", postgresql.TSVECTOR(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_evidence_cards_doi", "evidence_cards", ["doi"], unique=False)
    op.create_index("ix_evidence_cards_pmid", "evidence_cards", ["pmid"], unique=False)
    op.create_index(
        "ix_evidence_cards_evidence_level", "evidence_cards", ["evidence_level"], unique=False
    )
    op.create_index(
        "ix_evidence_cards_validity_status", "evidence_cards", ["validity_status"], unique=False
    )
    op.create_index(
        "ix_evidence_cards_search_tsv",
        "evidence_cards",
        ["search_tsv"],
        unique=False,
        postgresql_using="gin",
    )
    op.create_index(
        "ix_evidence_cards_tags",
        "evidence_cards",
        ["tags"],
        unique=False,
        postgresql_using="gin",
    )

    op.create_table(
        "evidence_relations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "source_card_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("evidence_cards.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "target_card_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("evidence_cards.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("relation_type", sa.String(length=24), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "source_card_id",
            "target_card_id",
            "relation_type",
            name="uq_evidence_relations_source_target_type",
        ),
    )
    op.create_index(
        "ix_evidence_relations_source_card_id",
        "evidence_relations",
        ["source_card_id"],
        unique=False,
    )
    op.create_index(
        "ix_evidence_relations_target_card_id",
        "evidence_relations",
        ["target_card_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_evidence_relations_target_card_id", table_name="evidence_relations")
    op.drop_index("ix_evidence_relations_source_card_id", table_name="evidence_relations")
    op.drop_table("evidence_relations")

    op.drop_index("ix_evidence_cards_tags", table_name="evidence_cards")
    op.drop_index("ix_evidence_cards_search_tsv", table_name="evidence_cards")
    op.drop_index("ix_evidence_cards_validity_status", table_name="evidence_cards")
    op.drop_index("ix_evidence_cards_evidence_level", table_name="evidence_cards")
    op.drop_index("ix_evidence_cards_pmid", table_name="evidence_cards")
    op.drop_index("ix_evidence_cards_doi", table_name="evidence_cards")
    op.drop_table("evidence_cards")

    op.drop_index("ix_candidate_studies_status", table_name="candidate_studies")
    op.drop_index("ix_candidate_studies_content_hash", table_name="candidate_studies")
    op.drop_index("ix_candidate_studies_pmid", table_name="candidate_studies")
    op.drop_index("ix_candidate_studies_doi", table_name="candidate_studies")
    op.drop_table("candidate_studies")
