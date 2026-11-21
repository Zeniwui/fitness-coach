"""Repository port for Living Profile and Injury/Restriction persistence."""

from __future__ import annotations

from datetime import datetime
from typing import Protocol
from uuid import UUID

from fitness_coach.domain.profile import (
    InjuryRestriction,
    InjurySeverity,
    InjuryStatus,
    LivingProfile,
)


class ProfileRepositoryPort(Protocol):
    """Persistence contract strictly scoped by athlete_id (ADR-0002)."""

    async def get_profile(self, athlete_id: UUID) -> LivingProfile | None: ...

    async def upsert_profile(self, profile: LivingProfile) -> LivingProfile: ...

    async def list_injuries(
        self,
        athlete_id: UUID,
        *,
        status: InjuryStatus | None = None,
    ) -> list[InjuryRestriction]: ...

    async def get_injury(
        self,
        athlete_id: UUID,
        injury_id: UUID,
    ) -> InjuryRestriction | None: ...

    async def create_injury(
        self,
        *,
        athlete_id: UUID,
        body_part: str,
        description: str,
        severity: InjurySeverity,
    ) -> InjuryRestriction: ...

    async def update_injury(
        self,
        *,
        athlete_id: UUID,
        injury_id: UUID,
        body_part: str,
        description: str,
        severity: InjurySeverity,
        status: InjuryStatus,
        resolved_at: datetime | None,
        resolution_notes: str | None,
    ) -> InjuryRestriction | None: ...

    async def delete_injury(
        self,
        athlete_id: UUID,
        injury_id: UUID,
    ) -> bool: ...
