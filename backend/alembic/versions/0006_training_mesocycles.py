"""Create training tables: mesocycles, planned_sessions, training_sessions, session_sets.

Revision ID: 0006_training_mesocycles
Revises: 0005_coach_chat
Create Date: 2026-11-21 19:10:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006_training_mesocycles"
down_revision: str | None = "0005_coach_chat"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "mesocycles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "athlete_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("athletes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("goal", sa.String(length=160), nullable=False),
        sa.Column("duration_weeks", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="draft"),
        sa.Column("progression_criteria", sa.Text(), nullable=True),
        sa.Column("deload_criteria", sa.Text(), nullable=True),
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
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_mesocycles_athlete_id", "mesocycles", ["athlete_id"], unique=False)
    op.create_index(
        "uq_mesocycles_single_active_per_athlete",
        "mesocycles",
        ["athlete_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('active', 'deload')"),
    )

    op.create_table(
        "planned_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "mesocycle_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("mesocycles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("day_order", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column(
            "exercises",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.create_index(
        "ix_planned_sessions_mesocycle_id",
        "planned_sessions",
        ["mesocycle_id"],
        unique=False,
    )

    op.create_table(
        "training_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "athlete_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("athletes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "mesocycle_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("mesocycles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "planned_session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("planned_sessions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("origin", sa.String(length=24), nullable=False, server_default="manual_form"),
        sa.Column("fatigue_notes", sa.Text(), nullable=True),
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
        "ix_training_sessions_athlete_date",
        "training_sessions",
        ["athlete_id", "session_date"],
        unique=False,
    )

    op.create_table(
        "session_sets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "training_session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("training_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("exercise_name", sa.String(length=160), nullable=False),
        sa.Column("muscle_group", sa.String(length=64), nullable=False),
        sa.Column(
            "secondary_muscle_groups",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("set_order", sa.Integer(), nullable=False),
        sa.Column("reps", sa.Integer(), nullable=False),
        sa.Column("load", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(length=8), nullable=False, server_default="kg"),
        sa.Column("rir", sa.Float(), nullable=True),
        sa.Column("rpe", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_session_sets_training_session_id",
        "session_sets",
        ["training_session_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_session_sets_training_session_id", table_name="session_sets")
    op.drop_table("session_sets")

    op.drop_index("ix_training_sessions_athlete_date", table_name="training_sessions")
    op.drop_table("training_sessions")

    op.drop_index("ix_planned_sessions_mesocycle_id", table_name="planned_sessions")
    op.drop_table("planned_sessions")

    op.drop_index("uq_mesocycles_single_active_per_athlete", table_name="mesocycles")
    op.drop_index("ix_mesocycles_athlete_id", table_name="mesocycles")
    op.drop_table("mesocycles")
