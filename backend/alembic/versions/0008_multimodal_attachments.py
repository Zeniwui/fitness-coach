"""Create multimodal attachments table isolated by athlete_id.

Revision ID: 0008_multimodal_attachments
Revises: 0007_nutrition_checkins
Create Date: 2026-11-21 19:30:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008_multimodal_attachments"
down_revision: str | None = "0007_nutrition_checkins"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "athlete_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("athletes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "message_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("messages.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("media_type", sa.String(length=16), nullable=False),
        sa.Column("mime_type", sa.String(length=64), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=True),
        sa.Column("storage_path", sa.String(length=512), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_attachments_athlete_id", "attachments", ["athlete_id"], unique=False)
    op.create_index(
        "ix_attachments_athlete_created",
        "attachments",
        ["athlete_id", "created_at"],
        unique=False,
    )
    op.create_index("ix_attachments_message_id", "attachments", ["message_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_attachments_message_id", table_name="attachments")
    op.drop_index("ix_attachments_athlete_created", table_name="attachments")
    op.drop_index("ix_attachments_athlete_id", table_name="attachments")
    op.drop_table("attachments")
