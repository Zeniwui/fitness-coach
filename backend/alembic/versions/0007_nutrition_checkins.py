"""Create Nutrition tables: nutrition_phases and weekly_checkins.

Revision ID: 0007_nutrition_checkins
Revises: 0006_training_mesocycles
Create Date: 2026-11-21 19:10:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_nutrition_checkins"
down_revision: str | None = "0006_training_mesocycles"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "nutrition_phases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "athlete_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("athletes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("phase_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="active"),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("target_calories", sa.Integer(), nullable=False),
        sa.Column("protein_g", sa.Integer(), nullable=False),
        sa.Column("fat_g", sa.Integer(), nullable=False),
        sa.Column("carbs_g", sa.Integer(), nullable=False),
        sa.Column("target_weekly_weight_change_kg", sa.Float(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
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
    op.create_index(
        "ix_nutrition_phases_athlete_id",
        "nutrition_phases",
        ["athlete_id"],
        unique=False,
    )
    op.create_index(
        "ix_nutrition_phases_athlete_start",
        "nutrition_phases",
        ["athlete_id", "start_date"],
        unique=False,
    )
    op.create_index(
        "uq_nutrition_phases_athlete_active",
        "nutrition_phases",
        ["athlete_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )

    op.create_table(
        "weekly_checkins",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "athlete_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("athletes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "nutrition_phase_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("nutrition_phases.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("checkin_date", sa.Date(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("average_weight_kg", sa.Float(), nullable=False),
        sa.Column(
            "daily_weights",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "body_measurements",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("adherence_score", sa.Integer(), nullable=False),
        sa.Column("sleep_quality", sa.Integer(), nullable=False),
        sa.Column("energy_level", sa.Integer(), nullable=False),
        sa.Column("hunger_level", sa.Integer(), nullable=True),
        sa.Column("recovery_score", sa.Integer(), nullable=True),
        sa.Column("perceived_fatigue", sa.Integer(), nullable=False),
        sa.Column("performance_notes", sa.Text(), nullable=True),
        sa.Column("estimated_tdee_delta_kcal", sa.Integer(), nullable=True),
        sa.Column(
            "weight_trend",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "coach_recommendations",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("adjustment_status", sa.String(length=24), nullable=False, server_default="none"),
        sa.Column("adjustment_resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "athlete_id",
            "idempotency_key",
            name="uq_weekly_checkins_athlete_idempotency",
        ),
    )
    op.create_index(
        "ix_weekly_checkins_athlete_id",
        "weekly_checkins",
        ["athlete_id"],
        unique=False,
    )
    op.create_index(
        "ix_weekly_checkins_athlete_date",
        "weekly_checkins",
        ["athlete_id", "checkin_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_weekly_checkins_athlete_date", table_name="weekly_checkins")
    op.drop_index("ix_weekly_checkins_athlete_id", table_name="weekly_checkins")
    op.drop_table("weekly_checkins")

    op.drop_index("uq_nutrition_phases_athlete_active", table_name="nutrition_phases")
    op.drop_index("ix_nutrition_phases_athlete_start", table_name="nutrition_phases")
    op.drop_index("ix_nutrition_phases_athlete_id", table_name="nutrition_phases")
    op.drop_table("nutrition_phases")
