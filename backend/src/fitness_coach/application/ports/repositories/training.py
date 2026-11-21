"""Repository port protocol for Training (#7): Mesocycles and Training Sessions."""

from __future__ import annotations

from datetime import date, datetime
from typing import Protocol
from uuid import UUID

from fitness_coach.domain.training import (
    Mesocycle,
    MesocycleStatus,
    PlannedSession,
    SessionOrigin,
    SessionSet,
    TrainingSession,
)


class TrainingRepositoryPort(Protocol):
    """Persistence contract for Mesocycles and Training Sessions (isolated by athlete_id)."""

    async def list_mesocycles(self, *, athlete_id: UUID) -> list[Mesocycle]: ...

    async def get_mesocycle(self, *, athlete_id: UUID, mesocycle_id: UUID) -> Mesocycle | None: ...

    async def get_current_mesocycle(self, *, athlete_id: UUID) -> Mesocycle | None: ...

    async def create_mesocycle(
        self,
        *,
        athlete_id: UUID,
        name: str,
        goal: str,
        duration_weeks: int,
        status: MesocycleStatus,
        progression_criteria: str | None,
        deload_criteria: str | None,
        notes: str | None,
        planned_sessions: tuple[PlannedSession, ...],
    ) -> Mesocycle: ...

    async def update_mesocycle(
        self,
        *,
        athlete_id: UUID,
        mesocycle_id: UUID,
        name: str,
        goal: str,
        duration_weeks: int,
        progression_criteria: str | None,
        deload_criteria: str | None,
        notes: str | None,
        planned_sessions: tuple[PlannedSession, ...],
    ) -> Mesocycle | None: ...

    async def set_mesocycle_status(
        self,
        *,
        athlete_id: UUID,
        mesocycle_id: UUID,
        status: MesocycleStatus,
        activated_at: datetime | None = None,
        completed_at: datetime | None = None,
    ) -> Mesocycle | None: ...

    async def list_training_sessions(
        self,
        *,
        athlete_id: UUID,
        mesocycle_id: UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        limit: int = 100,
    ) -> list[TrainingSession]: ...

    async def get_training_session(
        self, *, athlete_id: UUID, session_id: UUID
    ) -> TrainingSession | None: ...

    async def create_training_session(
        self,
        *,
        athlete_id: UUID,
        mesocycle_id: UUID | None,
        planned_session_id: UUID | None,
        session_date: date,
        name: str,
        origin: SessionOrigin,
        fatigue_notes: str | None,
        sets: tuple[SessionSet, ...],
    ) -> TrainingSession: ...

    async def update_training_session(
        self,
        *,
        athlete_id: UUID,
        session_id: UUID,
        mesocycle_id: UUID | None,
        planned_session_id: UUID | None,
        session_date: date,
        name: str,
        fatigue_notes: str | None,
        sets: tuple[SessionSet, ...],
    ) -> TrainingSession | None: ...

    async def delete_training_session(self, *, athlete_id: UUID, session_id: UUID) -> bool: ...
