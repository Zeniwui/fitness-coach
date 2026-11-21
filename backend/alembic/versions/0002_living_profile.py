"""Create living_profiles and injury_restrictions tables.

Revision ID: 0002_living_profile
Revises: 0001_identity_baseline
Create Date: 2026-11-21 18:20:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_living_profile"
down_revision: str | None = "0001_identity_baseline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "living_profiles",
        sa.Column(
            "athlete_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("athletes.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("sex", sa.String(length=32), nullable=True),
        sa.Column("height_cm", sa.Float(), nullable=True),
        sa.Column("base_weight_kg", sa.Float(), nullable=True),
        sa.Column("experience_level", sa.String(length=32), nullable=True),
        sa.Column("primary_goal", sa.String(length=64), nullable=True),
        sa.Column("training_days_per_week", sa.Integer(), nullable=True),
        sa.Column("session_duration_min", sa.Integer(), nullable=True),
        sa.Column(
            "equipment",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "allergies",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "food_preferences",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "training_approach",
            sa.String(length=32),
            nullable=False,
            server_default="natural",
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.create_table(
        "injury_restrictions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "athlete_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("athletes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("body_part", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "severity",
            sa.String(length=32),
            nullable=False,
            server_default="moderate",
        ),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default="active",
        ),
        sa.Column("resolution_notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_injury_restrictions_athlete_id",
        "injury_restrictions",
        ["athlete_id"],
        unique=False,
    )
    op.create_index(
        "ix_injury_restrictions_athlete_status",
        "injury_restrictions",
        ["athlete_id", "status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_injury_restrictions_athlete_status", table_name="injury_restrictions")
    op.drop_index("ix_injury_restrictions_athlete_id", table_name="injury_restrictions")
    op.drop_table("injury_restrictions")
    op.drop_table("living_profiles")
