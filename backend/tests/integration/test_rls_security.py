"""Integration tests verifying PostgreSQL Row-Level Security across public tables."""

from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

EXPECTED_RLS_TABLES = (
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


@pytest.mark.asyncio
async def test_all_public_tables_have_row_level_security_enabled(
    db_session: AsyncSession,
) -> None:
    result = await db_session.execute(
        text(
            "SELECT tablename, rowsecurity "
            "FROM pg_tables "
            "WHERE schemaname = 'public'"
        )
    )
    rls_by_table = {row.tablename: row.rowsecurity for row in result}

    missing = [table for table in EXPECTED_RLS_TABLES if table not in rls_by_table]
    assert not missing, f"Missing expected public tables: {missing}"

    disabled = [table for table in EXPECTED_RLS_TABLES if not rls_by_table[table]]
    assert not disabled, f"Tables without rowsecurity enabled: {disabled}"
