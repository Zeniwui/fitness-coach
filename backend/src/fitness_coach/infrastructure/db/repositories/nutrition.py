"""SQLAlchemy 2 async repository for Nutrition Phases and Weekly Check-ins (#8)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from fitness_coach.domain.nutrition import (
    AdjustmentProposalStatus,
    NutritionPhase,
    NutritionPhaseStatus,
    NutritionPhaseType,
    WeeklyCheckIn,
    WeightTrendAnalysis,
)
from fitness_coach.infrastructure.db.models.nutrition import (
    NutritionPhaseModel,
    WeeklyCheckInModel,
)


def _to_phase_domain(row: NutritionPhaseModel) -> NutritionPhase:
    return NutritionPhase(
        id=row.id,
        athlete_id=row.athlete_id,
        phase_type=NutritionPhaseType(row.phase_type),
        status=NutritionPhaseStatus(row.status),
        start_date=row.start_date,
        end_date=row.end_date,
        target_calories=row.target_calories,
        protein_g=row.protein_g,
        fat_g=row.fat_g,
        carbs_g=row.carbs_g,
        target_weekly_weight_change_kg=row.target_weekly_weight_change_kg,
        notes=row.notes,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _to_checkin_domain(row: WeeklyCheckInModel) -> WeeklyCheckIn:
    return WeeklyCheckIn(
        id=row.id,
        athlete_id=row.athlete_id,
        nutrition_phase_id=row.nutrition_phase_id,
        checkin_date=row.checkin_date,
        idempotency_key=row.idempotency_key,
        average_weight_kg=row.average_weight_kg,
        daily_weights=tuple(float(w) for w in (row.daily_weights or [])),
        body_measurements={str(k): float(v) for k, v in (row.body_measurements or {}).items()},
        adherence_score=row.adherence_score,
        sleep_quality=row.sleep_quality,
        energy_level=row.energy_level,
        hunger_level=row.hunger_level,
        recovery_score=row.recovery_score,
        perceived_fatigue=row.perceived_fatigue,
        performance_notes=row.performance_notes,
        estimated_tdee_delta_kcal=row.estimated_tdee_delta_kcal,
        weight_trend=(
            WeightTrendAnalysis.from_dict(row.weight_trend) if row.weight_trend else None
        ),
        coach_recommendations=dict(row.coach_recommendations or {}),
        adjustment_status=AdjustmentProposalStatus(row.adjustment_status),
        adjustment_resolved_at=row.adjustment_resolved_at,
        created_at=row.created_at,
    )


class SqlAlchemyNutritionRepository:
    """PostgreSQL implementation of NutritionRepositoryPort strictly scoped by athlete_id."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_phases(self, athlete_id: UUID) -> list[NutritionPhase]:
        status_order = case(
            (NutritionPhaseModel.status == NutritionPhaseStatus.ACTIVE.value, 0),
            else_=1,
        )
        stmt = (
            select(NutritionPhaseModel)
            .where(NutritionPhaseModel.athlete_id == athlete_id)
            .order_by(
                status_order.asc(),
                NutritionPhaseModel.start_date.desc(),
                NutritionPhaseModel.created_at.desc(),
            )
        )
        result = await self._session.execute(stmt)
        return [_to_phase_domain(row) for row in result.scalars().all()]

    async def get_active_phase(self, athlete_id: UUID) -> NutritionPhase | None:
        stmt = select(NutritionPhaseModel).where(
            NutritionPhaseModel.athlete_id == athlete_id,
            NutritionPhaseModel.status == NutritionPhaseStatus.ACTIVE.value,
        )
        result = await self._session.execute(stmt)
        row = result.scalar_one_or_none()
        return _to_phase_domain(row) if row is not None else None

    async def get_phase(self, athlete_id: UUID, phase_id: UUID) -> NutritionPhase | None:
        stmt = select(NutritionPhaseModel).where(
            NutritionPhaseModel.athlete_id == athlete_id,
            NutritionPhaseModel.id == phase_id,
        )
        result = await self._session.execute(stmt)
        row = result.scalar_one_or_none()
        return _to_phase_domain(row) if row is not None else None

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
    ) -> NutritionPhase:
        now = datetime.now(UTC)
        existing_result = await self._session.execute(
            select(NutritionPhaseModel).where(
                NutritionPhaseModel.athlete_id == athlete_id,
                NutritionPhaseModel.status == NutritionPhaseStatus.ACTIVE.value,
            )
        )
        existing_active = existing_result.scalar_one_or_none()
        if existing_active is not None:
            existing_active.status = NutritionPhaseStatus.COMPLETED.value
            existing_active.end_date = max(existing_active.start_date, start_date)
            existing_active.updated_at = now
            await self._session.flush()

        row = NutritionPhaseModel(
            athlete_id=athlete_id,
            phase_type=phase_type.value,
            status=NutritionPhaseStatus.ACTIVE.value,
            start_date=start_date,
            end_date=None,
            target_calories=target_calories,
            protein_g=protein_g,
            fat_g=fat_g,
            carbs_g=carbs_g,
            target_weekly_weight_change_kg=target_weekly_weight_change_kg,
            notes=notes,
            created_at=now,
            updated_at=now,
        )
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        return _to_phase_domain(row)

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
    ) -> NutritionPhase | None:
        result = await self._session.execute(
            select(NutritionPhaseModel).where(
                NutritionPhaseModel.athlete_id == athlete_id,
                NutritionPhaseModel.id == phase_id,
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None

        row.phase_type = phase_type.value
        row.target_calories = target_calories
        row.protein_g = protein_g
        row.fat_g = fat_g
        row.carbs_g = carbs_g
        row.target_weekly_weight_change_kg = target_weekly_weight_change_kg
        row.notes = notes
        row.updated_at = datetime.now(UTC)
        await self._session.flush()
        await self._session.refresh(row)
        return _to_phase_domain(row)

    async def complete_phase(
        self,
        *,
        athlete_id: UUID,
        phase_id: UUID,
        end_date: date,
    ) -> NutritionPhase | None:
        result = await self._session.execute(
            select(NutritionPhaseModel).where(
                NutritionPhaseModel.athlete_id == athlete_id,
                NutritionPhaseModel.id == phase_id,
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None

        row.status = NutritionPhaseStatus.COMPLETED.value
        row.end_date = end_date
        row.updated_at = datetime.now(UTC)
        await self._session.flush()
        await self._session.refresh(row)
        return _to_phase_domain(row)

    async def list_checkins(
        self, athlete_id: UUID, *, limit: int = 50
    ) -> list[WeeklyCheckIn]:
        stmt = (
            select(WeeklyCheckInModel)
            .where(WeeklyCheckInModel.athlete_id == athlete_id)
            .order_by(
                WeeklyCheckInModel.checkin_date.desc(),
                WeeklyCheckInModel.created_at.desc(),
            )
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        return [_to_checkin_domain(row) for row in result.scalars().all()]

    async def get_checkin(
        self, athlete_id: UUID, checkin_id: UUID
    ) -> WeeklyCheckIn | None:
        stmt = select(WeeklyCheckInModel).where(
            WeeklyCheckInModel.athlete_id == athlete_id,
            WeeklyCheckInModel.id == checkin_id,
        )
        result = await self._session.execute(stmt)
        row = result.scalar_one_or_none()
        return _to_checkin_domain(row) if row is not None else None

    async def get_checkin_by_idempotency_key(
        self, athlete_id: UUID, idempotency_key: str
    ) -> WeeklyCheckIn | None:
        stmt = select(WeeklyCheckInModel).where(
            WeeklyCheckInModel.athlete_id == athlete_id,
            WeeklyCheckInModel.idempotency_key == idempotency_key,
        )
        result = await self._session.execute(stmt)
        row = result.scalar_one_or_none()
        return _to_checkin_domain(row) if row is not None else None

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
    ) -> WeeklyCheckIn:
        row = WeeklyCheckInModel(
            athlete_id=athlete_id,
            nutrition_phase_id=nutrition_phase_id,
            checkin_date=checkin_date,
            idempotency_key=idempotency_key,
            average_weight_kg=average_weight_kg,
            daily_weights=list(daily_weights),
            body_measurements=dict(body_measurements),
            adherence_score=adherence_score,
            sleep_quality=sleep_quality,
            energy_level=energy_level,
            hunger_level=hunger_level,
            recovery_score=recovery_score,
            perceived_fatigue=perceived_fatigue,
            performance_notes=performance_notes,
            estimated_tdee_delta_kcal=estimated_tdee_delta_kcal,
            weight_trend=weight_trend.to_dict(),
            coach_recommendations=dict(coach_recommendations),
            adjustment_status=adjustment_status.value,
            adjustment_resolved_at=None,
            created_at=datetime.now(UTC),
        )
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        return _to_checkin_domain(row)

    async def resolve_checkin_adjustment(
        self,
        *,
        athlete_id: UUID,
        checkin_id: UUID,
        status: AdjustmentProposalStatus,
        resolved_at: datetime,
    ) -> WeeklyCheckIn | None:
        result = await self._session.execute(
            select(WeeklyCheckInModel).where(
                WeeklyCheckInModel.athlete_id == athlete_id,
                WeeklyCheckInModel.id == checkin_id,
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None

        row.adjustment_status = status.value
        row.adjustment_resolved_at = resolved_at
        await self._session.flush()
        await self._session.refresh(row)
        return _to_checkin_domain(row)
