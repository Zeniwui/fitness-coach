"""Pydantic v2 request/response schemas for Nutrition endpoints (#8)."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from fitness_coach.domain.nutrition import (
    AdjustmentProposalStatus,
    NutritionPhase,
    NutritionPhaseStatus,
    NutritionPhaseType,
    WeeklyCheckIn,
    WeightTrendAnalysis,
)


class CreateNutritionPhaseRequest(BaseModel):
    phase_type: NutritionPhaseType
    start_date: date | None = None
    target_calories: int = Field(ge=1000, le=8000)
    protein_g: int = Field(ge=30, le=500)
    fat_g: int = Field(ge=20, le=300)
    carbs_g: int = Field(ge=0, le=1200)
    target_weekly_weight_change_kg: float = Field(ge=-2.0, le=2.0)
    notes: str | None = Field(default=None, max_length=1000)


class UpdateNutritionPhaseRequest(BaseModel):
    phase_type: NutritionPhaseType | None = None
    target_calories: int | None = Field(default=None, ge=1000, le=8000)
    protein_g: int | None = Field(default=None, ge=30, le=500)
    fat_g: int | None = Field(default=None, ge=20, le=300)
    carbs_g: int | None = Field(default=None, ge=0, le=1200)
    target_weekly_weight_change_kg: float | None = Field(default=None, ge=-2.0, le=2.0)
    notes: str | None = Field(default=None, max_length=1000)


class CompleteNutritionPhaseRequest(BaseModel):
    end_date: date | None = None


class NutritionPhaseResponse(BaseModel):
    id: UUID
    athlete_id: UUID
    phase_type: NutritionPhaseType
    status: NutritionPhaseStatus
    start_date: date
    end_date: date | None
    target_calories: int
    protein_g: int
    fat_g: int
    carbs_g: int
    target_weekly_weight_change_kg: float
    notes: str | None
    created_at: datetime | None
    updated_at: datetime | None

    @classmethod
    def from_domain(cls, phase: NutritionPhase) -> NutritionPhaseResponse:
        return cls(
            id=phase.id,
            athlete_id=phase.athlete_id,
            phase_type=phase.phase_type,
            status=phase.status,
            start_date=phase.start_date,
            end_date=phase.end_date,
            target_calories=phase.target_calories,
            protein_g=phase.protein_g,
            fat_g=phase.fat_g,
            carbs_g=phase.carbs_g,
            target_weekly_weight_change_kg=phase.target_weekly_weight_change_kg,
            notes=phase.notes,
            created_at=phase.created_at,
            updated_at=phase.updated_at,
        )


class CreateWeeklyCheckInRequest(BaseModel):
    checkin_date: date | None = None
    idempotency_key: str = Field(min_length=1, max_length=128)
    average_weight_kg: float | None = Field(default=None, ge=30.0, le=250.0)
    daily_weights: list[float] | None = Field(default=None, max_length=14)
    body_measurements: dict[str, float] | None = None
    adherence_score: int = Field(ge=1, le=10)
    sleep_quality: int = Field(ge=1, le=10)
    energy_level: int = Field(ge=1, le=10)
    hunger_level: int | None = Field(default=None, ge=1, le=10)
    recovery_score: int | None = Field(default=None, ge=1, le=10)
    perceived_fatigue: int = Field(ge=1, le=10)
    performance_notes: str | None = Field(default=None, max_length=2000)


class WeightTrendResponse(BaseModel):
    current_weight_kg: float
    previous_weight_kg: float | None
    actual_weekly_change_kg: float | None
    target_weekly_change_kg: float | None
    weekly_deviation_kg: float | None
    estimated_tdee_delta_kcal: int | None
    trend_status: str

    @classmethod
    def from_domain(cls, trend: WeightTrendAnalysis) -> WeightTrendResponse:
        return cls(
            current_weight_kg=trend.current_weight_kg,
            previous_weight_kg=trend.previous_weight_kg,
            actual_weekly_change_kg=trend.actual_weekly_change_kg,
            target_weekly_change_kg=trend.target_weekly_change_kg,
            weekly_deviation_kg=trend.weekly_deviation_kg,
            estimated_tdee_delta_kcal=trend.estimated_tdee_delta_kcal,
            trend_status=trend.trend_status,
        )


class CoachAdjustmentRecommendationResponse(BaseModel):
    summary_es: str
    rationale_es: str
    calorie_delta_kcal: int
    proposed_target_calories: int | None = None
    proposed_protein_g: int | None = None
    proposed_fat_g: int | None = None
    proposed_carbs_g: int | None = None
    training_adjustment_es: str | None = None
    cited_card_ids: list[str] = Field(default_factory=list)
    respects_profile_notes: str | None = None


class WeeklyCheckInResponse(BaseModel):
    id: UUID
    athlete_id: UUID
    nutrition_phase_id: UUID | None
    checkin_date: date
    idempotency_key: str
    average_weight_kg: float
    daily_weights: list[float]
    body_measurements: dict[str, float]
    adherence_score: int
    sleep_quality: int
    energy_level: int
    hunger_level: int | None
    recovery_score: int | None
    perceived_fatigue: int
    performance_notes: str | None
    estimated_tdee_delta_kcal: int | None
    weight_trend: WeightTrendResponse | None
    coach_recommendations: CoachAdjustmentRecommendationResponse
    adjustment_status: AdjustmentProposalStatus
    adjustment_resolved_at: datetime | None
    created_at: datetime | None

    @classmethod
    def from_domain(cls, checkin: WeeklyCheckIn) -> WeeklyCheckInResponse:
        rec = checkin.coach_recommendations or {}
        return cls(
            id=checkin.id,
            athlete_id=checkin.athlete_id,
            nutrition_phase_id=checkin.nutrition_phase_id,
            checkin_date=checkin.checkin_date,
            idempotency_key=checkin.idempotency_key,
            average_weight_kg=checkin.average_weight_kg,
            daily_weights=list(checkin.daily_weights),
            body_measurements=dict(checkin.body_measurements),
            adherence_score=checkin.adherence_score,
            sleep_quality=checkin.sleep_quality,
            energy_level=checkin.energy_level,
            hunger_level=checkin.hunger_level,
            recovery_score=checkin.recovery_score,
            perceived_fatigue=checkin.perceived_fatigue,
            performance_notes=checkin.performance_notes,
            estimated_tdee_delta_kcal=checkin.estimated_tdee_delta_kcal,
            weight_trend=(
                WeightTrendResponse.from_domain(checkin.weight_trend)
                if checkin.weight_trend is not None
                else None
            ),
            coach_recommendations=CoachAdjustmentRecommendationResponse(
                summary_es=str(rec.get("summary_es") or rec.get("rationale_es") or ""),
                rationale_es=str(rec.get("rationale_es") or ""),
                calorie_delta_kcal=int(rec.get("calorie_delta_kcal") or 0),
                proposed_target_calories=rec.get("proposed_target_calories"),
                proposed_protein_g=rec.get("proposed_protein_g"),
                proposed_fat_g=rec.get("proposed_fat_g"),
                proposed_carbs_g=rec.get("proposed_carbs_g"),
                training_adjustment_es=rec.get("training_adjustment_es"),
                cited_card_ids=[str(cid) for cid in (rec.get("cited_card_ids") or [])],
                respects_profile_notes=rec.get("respects_profile_notes"),
            ),
            adjustment_status=checkin.adjustment_status,
            adjustment_resolved_at=checkin.adjustment_resolved_at,
            created_at=checkin.created_at,
        )


class ApplyCheckInAdjustmentResponse(BaseModel):
    checkin: WeeklyCheckInResponse
    phase: NutritionPhaseResponse
