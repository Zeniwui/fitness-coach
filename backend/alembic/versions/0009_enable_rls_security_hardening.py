"""Enable PostgreSQL Row-Level Security on all public tables and revoke PostgREST role access.

Revision ID: 0009_enable_rls_security_hardening
Revises: 0008_multimodal_attachments
Create Date: 2026-11-25 12:18:00
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0009_enable_rls_security_hardening"
down_revision: str | None = "0008_multimodal_attachments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PUBLIC_TABLES: tuple[str, ...] = (
    "athletes",
    "invitations",
    "living_profiles",
    "injury_restrictions",
    "candidate_studies",
    "evidence_cards",
    "evidence_relations",
    "monthly_cut_runs",
    "trending_topics",
    "conversations",
    "messages",
    "profile_update_proposals",
    "mesocycles",
    "planned_sessions",
    "training_sessions",
    "session_sets",
    "nutrition_phases",
    "weekly_checkins",
    "attachments",
    "alembic_version",
)


def upgrade() -> None:
    op.execute("ALTER TABLE public.alembic_version ALTER COLUMN version_num TYPE VARCHAR(64);")

    for table in _PUBLIC_TABLES:
        op.execute(f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY;')

    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    for table in reversed(_PUBLIC_TABLES):
        op.execute(f'ALTER TABLE public."{table}" DISABLE ROW LEVEL SECURITY;')
