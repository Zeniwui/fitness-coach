"""Living Profile and Injury/Restriction domain model (pure Python, zero framework imports)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID


class BiologicalSex(StrEnum):
    """Biological sex used as reference context for training/nutrition physiology."""

    MALE = "male"
    FEMALE = "female"
    OTHER = "other"
    PREFER_NOT_TO_SAY = "prefer_not_to_say"


class ExperienceLevel(StrEnum):
    """Athlete's resistance training experience level."""

    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class PrimaryGoal(StrEnum):
    """Athlete's primary physique / performance objective."""

    HYPERTROPHY = "hypertrophy"
    STRENGTH = "strength"
    FAT_LOSS = "fat_loss"
    BODY_RECOMPOSITION = "body_recomposition"
    MAINTENANCE = "maintenance"


class TrainingApproach(StrEnum):
    """Training approach preference; defaults to natural (Coach never prescribes PEDs)."""

    NATURAL = "natural"
    ENHANCED_CONTEXT_ONLY = "enhanced_context_only"


class InjurySeverity(StrEnum):
    """Severity level of an active or historical injury/restriction."""

    MILD = "mild"
    MODERATE = "moderate"
    SEVERE = "severe"


class InjuryStatus(StrEnum):
    """Lifecycle status of an injury/restriction."""

    ACTIVE = "active"
    RESOLVED = "resolved"


class ProfileError(Exception):
    """Base domain error for Living Profile and Injury/Restriction invariants."""


class ProfileValidationError(ProfileError):
    """Raised when Living Profile or Injury data violates domain constraints."""


class InjuryNotFoundError(ProfileError):
    """Raised when an injury does not exist or does not belong to the Athlete."""


def normalize_tag_list(items: list[str] | tuple[str, ...]) -> tuple[str, ...]:
    """Trim whitespace, drop blanks, and deduplicate preserving insertion order."""
    seen: set[str] = set()
    normalized: list[str] = []
    for raw in items:
        cleaned = raw.strip()
        if not cleaned:
            continue
        key = cleaned.lower()
        if key not in seen:
            seen.add(key)
            normalized.append(cleaned)
    return tuple(normalized)


@dataclass(frozen=True, slots=True)
class LivingProfile:
    """Structured, transparent, editable context of an Athlete consulted by the Coach."""

    athlete_id: UUID
    age: int | None = None
    sex: BiologicalSex | None = None
    height_cm: float | None = None
    base_weight_kg: float | None = None
    experience_level: ExperienceLevel | None = None
    primary_goal: PrimaryGoal | None = None
    training_days_per_week: int | None = None
    session_duration_min: int | None = None
    equipment: tuple[str, ...] = ()
    allergies: tuple[str, ...] = ()
    food_preferences: tuple[str, ...] = ()
    training_approach: TrainingApproach = TrainingApproach.NATURAL
    notes: str | None = None
    updated_at: datetime | None = None

    @classmethod
    def empty(cls, athlete_id: UUID) -> LivingProfile:
        return cls(
            athlete_id=athlete_id,
            training_approach=TrainingApproach.NATURAL,
        )

    @property
    def has_saved_profile(self) -> bool:
        return self.updated_at is not None

    def validate(self) -> None:
        if self.age is not None and not (14 <= self.age <= 100):
            raise ProfileValidationError("La edad debe estar entre 14 y 100 años.")
        if self.height_cm is not None and not (100.0 <= self.height_cm <= 250.0):
            raise ProfileValidationError("La altura debe estar entre 100 y 250 cm.")
        if self.base_weight_kg is not None and not (30.0 <= self.base_weight_kg <= 250.0):
            raise ProfileValidationError("El peso base debe estar entre 30 y 250 kg.")
        if self.training_days_per_week is not None and not (1 <= self.training_days_per_week <= 7):
            raise ProfileValidationError(
                "Los días de entrenamiento por semana deben estar entre 1 y 7."
            )
        if self.session_duration_min is not None and not (15 <= self.session_duration_min <= 240):
            raise ProfileValidationError(
                "La duración de cada sesión debe estar entre 15 y 240 minutos."
            )


@dataclass(frozen=True, slots=True)
class InjuryRestriction:
    """Physical injury or movement restriction belonging to an Athlete."""

    id: UUID
    athlete_id: UUID
    body_part: str
    description: str
    severity: InjurySeverity
    status: InjuryStatus
    resolution_notes: str | None
    created_at: datetime
    resolved_at: datetime | None

    @property
    def is_active(self) -> bool:
        return self.status == InjuryStatus.ACTIVE
