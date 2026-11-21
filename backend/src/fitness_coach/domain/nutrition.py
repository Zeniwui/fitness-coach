"""Pure domain models, invariants, and calculations for Nutrition (#8).

Zero FastAPI, SQLAlchemy, or AI SDK imports.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID


class NutritionPhaseType(StrEnum):
    BULK = "bulk"
    CUT = "cut"
    MAINTENANCE = "maintenance"
    MINI_CUT = "mini_cut"


class NutritionPhaseStatus(StrEnum):
    ACTIVE = "active"
    COMPLETED = "completed"


class AdjustmentProposalStatus(StrEnum):
    NONE = "none"
    PROPOSED = "proposed"
    ACCEPTED = "accepted"
    DISMISSED = "dismissed"


class NutritionValidationError(ValueError):
    """Raised when NutritionPhase or WeeklyCheckIn input violates domain invariants."""


class NutritionPhaseNotFoundError(LookupError):
    """Raised when a NutritionPhase does not exist or is not owned by the Athlete."""


class InvalidNutritionPhaseStateError(ValueError):
    """Raised when attempting an invalid state transition on a NutritionPhase."""


class CheckInNotFoundError(LookupError):
    """Raised when a WeeklyCheckIn does not exist or is not owned by the Athlete."""


class InvalidAdjustmentStateError(ValueError):
    """Raised when an adjustment proposal has already been resolved or does not exist."""


PHASE_TYPE_LABELS_ES: dict[NutritionPhaseType, str] = {
    NutritionPhaseType.BULK: "Volumen",
    NutritionPhaseType.CUT: "Definición",
    NutritionPhaseType.MAINTENANCE: "Mantenimiento",
    NutritionPhaseType.MINI_CUT: "Mini-cut",
}

TREND_STATUS_LABELS_ES: dict[str, str] = {
    "insufficient_data": "Sin historial previo suficiente",
    "on_track": "En objetivo",
    "losing_too_slow": "Pérdida más lenta de lo previsto",
    "losing_too_fast": "Pérdida más rápida de lo previsto",
    "gaining_too_fast": "Ganancia más rápida de lo previsto",
    "gaining_too_slow": "Ganancia más lenta de lo previsto",
}


def validate_phase_targets(
    *,
    target_calories: int,
    protein_g: int,
    fat_g: int,
    carbs_g: int,
    target_weekly_weight_change_kg: float,
) -> None:
    if target_calories < 1000 or target_calories > 8000:
        raise NutritionValidationError(
            "Las calorías objetivo deben estar entre 1000 y 8000 kcal."
        )
    if protein_g < 30 or protein_g > 500:
        raise NutritionValidationError("La proteína objetivo debe estar entre 30 y 500 g.")
    if fat_g < 20 or fat_g > 300:
        raise NutritionValidationError("Las grasas objetivo deben estar entre 20 y 300 g.")
    if carbs_g < 0 or carbs_g > 1200:
        raise NutritionValidationError(
            "Los carbohidratos objetivo deben estar entre 0 y 1200 g."
        )
    if target_weekly_weight_change_kg < -2.0 or target_weekly_weight_change_kg > 2.0:
        raise NutritionValidationError(
            "El ritmo objetivo de cambio de peso semanal debe estar entre -2.0 y +2.0 kg."
        )


def resolve_average_weight(
    *,
    average_weight_kg: float | None,
    daily_weights: Sequence[float] | None,
) -> tuple[float, tuple[float, ...]]:
    cleaned_daily: list[float] = []
    if daily_weights:
        for w in daily_weights:
            if w < 30.0 or w > 250.0:
                raise NutritionValidationError(
                    "Cada lectura diaria de peso debe estar entre 30 y 250 kg."
                )
            cleaned_daily.append(round(float(w), 2))
        avg = round(sum(cleaned_daily) / len(cleaned_daily), 2)
        return avg, tuple(cleaned_daily)

    if average_weight_kg is None:
        raise NutritionValidationError(
            "Debes introducir el peso medio semanal o al menos una lectura diaria."
        )
    if average_weight_kg < 30.0 or average_weight_kg > 250.0:
        raise NutritionValidationError("El peso corporal debe estar entre 30 y 250 kg.")
    return round(float(average_weight_kg), 2), ()


def validate_checkin_inputs(
    *,
    idempotency_key: str,
    adherence_score: int,
    sleep_quality: int,
    energy_level: int,
    perceived_fatigue: int,
    hunger_level: int | None,
    recovery_score: int | None,
    body_measurements: dict[str, float] | None,
) -> dict[str, float]:
    if not idempotency_key.strip():
        raise NutritionValidationError("Se requiere una clave de idempotencia válida.")

    for label, value in (
        ("La adherencia nutricional", adherence_score),
        ("La calidad de sueño", sleep_quality),
        ("El nivel de energía", energy_level),
        ("La fatiga percibida", perceived_fatigue),
    ):
        if value < 1 or value > 10:
            raise NutritionValidationError(f"{label} debe estar entre 1 y 10.")

    if hunger_level is not None and (hunger_level < 1 or hunger_level > 10):
        raise NutritionValidationError("El nivel de hambre debe estar entre 1 y 10.")
    if recovery_score is not None and (recovery_score < 1 or recovery_score > 10):
        raise NutritionValidationError("La percepción de recuperación debe estar entre 1 y 10.")

    cleaned_measurements: dict[str, float] = {}
    if body_measurements:
        for key, val in body_measurements.items():
            k = key.strip().lower()
            if not k:
                continue
            if val <= 0 or val > 300:
                raise NutritionValidationError(
                    f"La medida corporal '{key}' debe ser un valor positivo menor a 300 cm."
                )
            cleaned_measurements[k] = round(float(val), 2)
    return cleaned_measurements


@dataclass(frozen=True, slots=True)
class NutritionPhase:
    """Athlete's Nutrition Phase (Fase Nutricional). At most ONE active per Athlete."""

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
    notes: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class WeightTrendAnalysis:
    """Automated comparison between recent Check-in weights and active phase rate target."""

    current_weight_kg: float
    previous_weight_kg: float | None
    actual_weekly_change_kg: float | None
    target_weekly_change_kg: float | None
    weekly_deviation_kg: float | None
    estimated_tdee_delta_kcal: int | None
    trend_status: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "current_weight_kg": self.current_weight_kg,
            "previous_weight_kg": self.previous_weight_kg,
            "actual_weekly_change_kg": self.actual_weekly_change_kg,
            "target_weekly_change_kg": self.target_weekly_change_kg,
            "weekly_deviation_kg": self.weekly_deviation_kg,
            "estimated_tdee_delta_kcal": self.estimated_tdee_delta_kcal,
            "trend_status": self.trend_status,
        }

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> WeightTrendAnalysis:
        return cls(
            current_weight_kg=float(raw.get("current_weight_kg", 0.0)),
            previous_weight_kg=(
                float(raw["previous_weight_kg"])
                if raw.get("previous_weight_kg") is not None
                else None
            ),
            actual_weekly_change_kg=(
                float(raw["actual_weekly_change_kg"])
                if raw.get("actual_weekly_change_kg") is not None
                else None
            ),
            target_weekly_change_kg=(
                float(raw["target_weekly_change_kg"])
                if raw.get("target_weekly_change_kg") is not None
                else None
            ),
            weekly_deviation_kg=(
                float(raw["weekly_deviation_kg"])
                if raw.get("weekly_deviation_kg") is not None
                else None
            ),
            estimated_tdee_delta_kcal=(
                int(raw["estimated_tdee_delta_kcal"])
                if raw.get("estimated_tdee_delta_kcal") is not None
                else None
            ),
            trend_status=str(raw.get("trend_status", "insufficient_data")),
        )


@dataclass(frozen=True, slots=True)
class WeeklyCheckIn:
    """Guided weekly Check-in strictly owned by an Athlete."""

    id: UUID
    athlete_id: UUID
    nutrition_phase_id: UUID | None
    checkin_date: date
    idempotency_key: str
    average_weight_kg: float
    daily_weights: tuple[float, ...] = ()
    body_measurements: dict[str, float] = field(default_factory=dict)
    adherence_score: int = 8
    sleep_quality: int = 7
    energy_level: int = 7
    hunger_level: int | None = None
    recovery_score: int | None = None
    perceived_fatigue: int = 5
    performance_notes: str | None = None
    estimated_tdee_delta_kcal: int | None = None
    weight_trend: WeightTrendAnalysis | None = None
    coach_recommendations: dict[str, Any] = field(default_factory=dict)
    adjustment_status: AdjustmentProposalStatus = AdjustmentProposalStatus.NONE
    adjustment_resolved_at: datetime | None = None
    created_at: datetime | None = None


def compute_weight_trend(
    *,
    current_weight_kg: float,
    current_date: date,
    previous_checkins: Sequence[WeeklyCheckIn],
    active_phase: NutritionPhase | None,
) -> WeightTrendAnalysis:
    """Compare current weight against the most recent prior Check-in and active phase target."""
    target_rate = (
        active_phase.target_weekly_weight_change_kg if active_phase is not None else None
    )

    prior = next(
        (c for c in previous_checkins if c.checkin_date < current_date),
        previous_checkins[0] if previous_checkins else None,
    )
    if prior is None:
        return WeightTrendAnalysis(
            current_weight_kg=current_weight_kg,
            previous_weight_kg=None,
            actual_weekly_change_kg=None,
            target_weekly_change_kg=target_rate,
            weekly_deviation_kg=None,
            estimated_tdee_delta_kcal=None,
            trend_status="insufficient_data",
        )

    days_elapsed = max((current_date - prior.checkin_date).days, 1)
    actual_weekly = round(((current_weight_kg - prior.average_weight_kg) / days_elapsed) * 7.0, 3)

    if target_rate is None:
        return WeightTrendAnalysis(
            current_weight_kg=current_weight_kg,
            previous_weight_kg=prior.average_weight_kg,
            actual_weekly_change_kg=actual_weekly,
            target_weekly_change_kg=None,
            weekly_deviation_kg=None,
            estimated_tdee_delta_kcal=None,
            trend_status="insufficient_data",
        )

    deviation = round(actual_weekly - target_rate, 3)
    # 1 kg body tissue ≈ 7700 kcal => 1100 kcal/day per 1 kg/week deviation.
    # Negative delta means actual expenditure is lower than assumed (weight higher than target).
    tdee_delta = int(round(-deviation * 1100))

    tolerance = 0.12
    if abs(deviation) <= tolerance:
        status = "on_track"
    elif target_rate < 0:
        status = "losing_too_slow" if deviation > tolerance else "losing_too_fast"
    elif target_rate > 0:
        status = "gaining_too_fast" if deviation > tolerance else "gaining_too_slow"
    else:
        status = "gaining_too_fast" if deviation > tolerance else "losing_too_fast"

    return WeightTrendAnalysis(
        current_weight_kg=current_weight_kg,
        previous_weight_kg=prior.average_weight_kg,
        actual_weekly_change_kg=actual_weekly,
        target_weekly_change_kg=target_rate,
        weekly_deviation_kg=deviation,
        estimated_tdee_delta_kcal=tdee_delta,
        trend_status=status,
    )


def build_deterministic_adjustment(
    *,
    active_phase: NutritionPhase | None,
    trend: WeightTrendAnalysis,
    adherence_score: int,
    sleep_quality: int,
    energy_level: int,
    perceived_fatigue: int,
    hunger_level: int | None,
    recovery_score: int | None,
) -> tuple[dict[str, Any], AdjustmentProposalStatus]:
    """Compute concrete, safe calorie/macro and training adjustment proposals."""
    training_adjustment_es: str | None = None
    if perceived_fatigue >= 8 or (
        perceived_fatigue >= 7
        and (sleep_quality <= 5 or (recovery_score is not None and recovery_score <= 4))
    ):
        training_adjustment_es = (
            "Fatiga acumulada elevada con recuperación comprometida: reduce el volumen semanal "
            "un 20-30 % durante esta semana o programa una semana de descarga priorizando sueño."
        )
    elif energy_level <= 4 and sleep_quality <= 5:
        training_adjustment_es = (
            "Energía y sueño bajos: mantén la intensidad de carga pero recorta 1-2 series "
            "en ejercicios accesorios para preservar la calidad técnica."
        )

    if active_phase is None:
        return (
            {
                "calorie_delta_kcal": 0,
                "proposed_target_calories": None,
                "proposed_protein_g": None,
                "proposed_fat_g": None,
                "proposed_carbs_g": None,
                "training_adjustment_es": training_adjustment_es,
                "rationale_es": (
                    "No hay una Fase Nutricional activa. Activa una fase para que el Coach "
                    "pueda calcular ajustes calóricos y de macronutrientes."
                ),
            },
            AdjustmentProposalStatus.NONE,
        )

    if trend.trend_status == "insufficient_data" or trend.estimated_tdee_delta_kcal is None:
        return (
            {
                "calorie_delta_kcal": 0,
                "proposed_target_calories": active_phase.target_calories,
                "proposed_protein_g": active_phase.protein_g,
                "proposed_fat_g": active_phase.fat_g,
                "proposed_carbs_g": active_phase.carbs_g,
                "training_adjustment_es": training_adjustment_es,
                "rationale_es": (
                    "Primer punto de referencia registrado. Mantén los objetivos actuales "
                    "esta semana para evaluar la tendencia real en el próximo Check-in."
                ),
            },
            AdjustmentProposalStatus.NONE,
        )

    if adherence_score < 6:
        return (
            {
                "calorie_delta_kcal": 0,
                "proposed_target_calories": active_phase.target_calories,
                "proposed_protein_g": active_phase.protein_g,
                "proposed_fat_g": active_phase.fat_g,
                "proposed_carbs_g": active_phase.carbs_g,
                "training_adjustment_es": training_adjustment_es,
                "rationale_es": (
                    f"La adherencia nutricional ({adherence_score}/10) fue baja esta semana. "
                    "Mantén los objetivos actuales y prioriza consistencia antes de ajustar "
                    "calorías."
                ),
            },
            AdjustmentProposalStatus.NONE,
        )

    if trend.trend_status == "on_track":
        return (
            {
                "calorie_delta_kcal": 0,
                "proposed_target_calories": active_phase.target_calories,
                "proposed_protein_g": active_phase.protein_g,
                "proposed_fat_g": active_phase.fat_g,
                "proposed_carbs_g": active_phase.carbs_g,
                "training_adjustment_es": training_adjustment_es,
                "rationale_es": (
                    f"Ritmo real ({trend.actual_weekly_change_kg:+.2f} kg/sem) alineado con "
                    f"el objetivo ({trend.target_weekly_change_kg:+.2f} kg/sem). "
                    "Mantén calorías y macronutrientes actuales."
                ),
            },
            AdjustmentProposalStatus.NONE,
        )

    # Compute conservative calorie adjustment rounded to 25 kcal steps, clamped to [100, 350]
    raw_delta = trend.estimated_tdee_delta_kcal
    # Apply ~60% damping to avoid over-correcting single-week water fluctuations
    damped = int(round((raw_delta * 0.6) / 25.0) * 25)
    if raw_delta < 0:
        calorie_delta = max(-350, min(-100, damped))
    else:
        calorie_delta = min(350, max(100, damped))

    proposed_calories = max(1200, min(8000, active_phase.target_calories + calorie_delta))
    actual_delta = proposed_calories - active_phase.target_calories
    if actual_delta == 0:
        return (
            {
                "calorie_delta_kcal": 0,
                "proposed_target_calories": active_phase.target_calories,
                "proposed_protein_g": active_phase.protein_g,
                "proposed_fat_g": active_phase.fat_g,
                "proposed_carbs_g": active_phase.carbs_g,
                "training_adjustment_es": training_adjustment_es,
                "rationale_es": (
                    "Se ha alcanzado el suelo/techo calórico seguro; mantén objetivos actuales."
                ),
            },
            AdjustmentProposalStatus.NONE,
        )

    # Preserve protein (critical in cut/mini_cut), adjust carbs first, then fat if needed
    proposed_protein = active_phase.protein_g
    proposed_fat = active_phase.fat_g
    carb_delta = int(round(actual_delta / 4.0))
    proposed_carbs = active_phase.carbs_g + carb_delta

    if proposed_carbs < 50:
        shortfall_kcal = (50 - proposed_carbs) * 4
        proposed_carbs = 50
        fat_reduction = int(round(shortfall_kcal / 9.0))
        proposed_fat = max(40, active_phase.fat_g - fat_reduction)

    hunger_note = ""
    if hunger_level is not None and hunger_level >= 8 and actual_delta < 0:
        hunger_note = (
            " Dado el hambre elevada, prioriza alimentos saciantes, fibra y reparto uniforme "
            "de proteína en 4 tomas."
        )

    trend_label = TREND_STATUS_LABELS_ES.get(trend.trend_status, trend.trend_status)
    rationale = (
        f"{trend_label}: cambio real {trend.actual_weekly_change_kg:+.2f} kg/sem frente a "
        f"{trend.target_weekly_change_kg:+.2f} kg/sem objetivo "
        f"(desviación estimada de gasto energético: {trend.estimated_tdee_delta_kcal:+d} "
        "kcal/día). "
        f"Propuesta: ajustar {actual_delta:+d} kcal/día manteniendo la proteína en "
        f"{proposed_protein} g.{hunger_note}"
    )

    return (
        {
            "calorie_delta_kcal": actual_delta,
            "proposed_target_calories": proposed_calories,
            "proposed_protein_g": proposed_protein,
            "proposed_fat_g": proposed_fat,
            "proposed_carbs_g": proposed_carbs,
            "training_adjustment_es": training_adjustment_es,
            "rationale_es": rationale,
        },
        AdjustmentProposalStatus.PROPOSED,
    )
