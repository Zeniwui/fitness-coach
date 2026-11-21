"""Create monthly_cut_runs and trending_topics tables.

Revision ID: 0004_monthly_cut
Revises: 0003_knowledge_base
Create Date: 2026-11-21 19:00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_monthly_cut"
down_revision: str | None = "0003_knowledge_base"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "monthly_cut_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("run_type", sa.String(length=24), nullable=False),
        sa.Column("date_from", sa.Date(), nullable=True),
        sa.Column("date_to", sa.Date(), nullable=True),
        sa.Column("query_override", sa.Text(), nullable=True),
        sa.Column("max_candidates", sa.Integer(), nullable=False, server_default="12"),
        sa.Column(
            "sources",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="queued"),
        sa.Column("collected_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("filtered_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("analyzed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "checkpoint_cursor",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("pause_reason", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_monthly_cut_runs_status", "monthly_cut_runs", ["status"], unique=False)

    op.create_table(
        "trending_topics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "monthly_cut_run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("monthly_cut_runs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("critical_evaluation", sa.Text(), nullable=False),
        sa.Column(
            "cited_card_ids",
            postgresql.ARRAY(postgresql.UUID(as_uuid=True)),
            nullable=False,
            server_default=sa.text("'{}'::uuid[]"),
        ),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="pending"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_trending_topics_monthly_cut_run_id",
        "trending_topics",
        ["monthly_cut_run_id"],
        unique=False,
    )
    op.create_index("ix_trending_topics_status", "trending_topics", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_trending_topics_status", table_name="trending_topics")
    op.drop_index("ix_trending_topics_monthly_cut_run_id", table_name="trending_topics")
    op.drop_table("trending_topics")

    op.drop_index("ix_monthly_cut_runs_status", table_name="monthly_cut_runs")
    op.drop_table("monthly_cut_runs")
