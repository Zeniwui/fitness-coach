"""Repository port for Nutrition Phases and Weekly Check-ins (#8)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Protocol
from uuid import UUID

from fitness_coach.domain.nutrition import (
    AdjustmentProposalStatus,
    NutritionPhase,
    NutritionPhaseType,
    WeeklyCheckIn,
    WeightTrendAnalysis,
)


class NutritionRepositoryPort(Protocol):
    """Persistence contract strictly scoped by athlete_id (ADR-0002)."""

    async def list_phases(self, athlete_id: UUID) -> list[NutritionPhase]: ...

    async def get_active_phase(self, athlete_id: UUID) -> NutritionPhase | None: ...

    async def get_phase(self, athlete_id: UUID, phase_id: UUID) -> NutritionPhase | None: ...

    async def create_active_phase(
        self,
        *,
        athlete_id: UUID,
        phase_type: NutritionPhaseType,
        start_date: date,
        target_calories: int,
        protein_g: int,
        fat_g: int,
        carbs_g: int,
        target_weekly_weight_change_kg: float,
        notes: str | None,
    ) -> NutritionPhase: ...

    async def update_phase(
        self,
        *,
        athlete_id: UUID,
        phase_id: UUID,
        phase_type: NutritionPhaseType,
        target_calories: int,
        protein_g: int,
        fat_g: int,
        carbs_g: int,
        target_weekly_weight_change_kg: float,
        notes: str | None,
    ) -> NutritionPhase | None: ...

    async def complete_phase(
        self,
        *,
        athlete_id: UUID,
        phase_id: UUID,
        end_date: date,
    ) -> NutritionPhase | None: ...

    async def list_checkins(
        self, athlete_id: UUID, *, limit: int = 50
    ) -> list[WeeklyCheckIn]: ...

    async def get_checkin(
        self, athlete_id: UUID, checkin_id: UUID
    ) -> WeeklyCheckIn | None: ...

    async def get_checkin_by_idempotency_key(
        self, athlete_id: UUID, idempotency_key: str
    ) -> WeeklyCheckIn | None: ...

    async def create_checkin(
        self,
        *,
        athlete_id: UUID,
        nutrition_phase_id: UUID | None,
        checkin_date: date,
        idempotency_key: str,
        average_weight_kg: float,
        daily_weights: tuple[float, ...],
        body_measurements: dict[str, float],
        adherence_score: int,
        sleep_quality: int,
        energy_level: int,
        hunger_level: int | None,
        recovery_score: int | None,
        perceived_fatigue: int,
        performance_notes: str | None,
        estimated_tdee_delta_kcal: int | None,
        weight_trend: WeightTrendAnalysis,
        coach_recommendations: dict[str, Any],
        adjustment_status: AdjustmentProposalStatus,
    ) -> WeeklyCheckIn: ...

    async def resolve_checkin_adjustment(
        self,
        *,
        athlete_id: UUID,
        checkin_id: UUID,
        status: AdjustmentProposalStatus,
        resolved_at: datetime,
    ) -> WeeklyCheckIn | None: ...
