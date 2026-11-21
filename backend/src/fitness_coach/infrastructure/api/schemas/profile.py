"""Pydantic v2 request/response DTOs for Living Profile and Injuries/Restrictions."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from fitness_coach.application.use_cases.profile import LivingProfileSnapshot
from fitness_coach.domain.profile import (
    BiologicalSex,
    ExperienceLevel,
    InjuryRestriction,
    InjurySeverity,
    InjuryStatus,
    PrimaryGoal,
    TrainingApproach,
)


class InjuryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    body_part: str
    description: str
    severity: InjurySeverity
    status: InjuryStatus
    resolution_notes: str | None
    created_at: datetime
    resolved_at: datetime | None

    @classmethod
    def from_domain(cls, injury: InjuryRestriction) -> InjuryResponse:
        return cls(
            id=injury.id,
            body_part=injury.body_part,
            description=injury.description,
            severity=injury.severity,
            status=injury.status,
            resolution_notes=injury.resolution_notes,
            created_at=injury.created_at,
            resolved_at=injury.resolved_at,
        )


class InjuryListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[InjuryResponse]


class CreateInjuryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body_part: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=1000)
    severity: InjurySeverity = InjurySeverity.MODERATE

    @field_validator("body_part")
    @classmethod
    def validate_body_part(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Debes indicar la zona corporal afectada.")
        return cleaned

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Debes describir la lesión o restricción.")
        return cleaned


class UpdateInjuryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body_part: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    severity: InjurySeverity | None = None
    status: InjuryStatus | None = None
    resolved_at: datetime | None = None
    resolution_notes: str | None = Field(default=None, max_length=1000)

    @field_validator("body_part")
    @classmethod
    def validate_body_part(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Debes indicar la zona corporal afectada.")
        return cleaned

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Debes describir la lesión o restricción.")
        return cleaned


class UpsertLivingProfileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    age: int | None = None
    sex: BiologicalSex | None = None
    height_cm: float | None = None
    base_weight_kg: float | None = None
    experience_level: ExperienceLevel | None = None
    primary_goal: PrimaryGoal | None = None
    training_days_per_week: int | None = None
    session_duration_min: int | None = None
    equipment: list[str] = Field(default_factory=list, max_length=50)
    allergies: list[str] = Field(default_factory=list, max_length=50)
    food_preferences: list[str] = Field(default_factory=list, max_length=50)
    training_approach: TrainingApproach = TrainingApproach.NATURAL
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("age")
    @classmethod
    def validate_age(cls, value: int | None) -> int | None:
        if value is not None and not (14 <= value <= 100):
            raise ValueError("La edad debe estar entre 14 y 100 años.")
        return value

    @field_validator("height_cm")
    @classmethod
    def validate_height_cm(cls, value: float | None) -> float | None:
        if value is not None and not (100.0 <= value <= 250.0):
            raise ValueError("La altura debe estar entre 100 y 250 cm.")
        return value

    @field_validator("base_weight_kg")
    @classmethod
    def validate_base_weight_kg(cls, value: float | None) -> float | None:
        if value is not None and not (30.0 <= value <= 250.0):
            raise ValueError("El peso base debe estar entre 30 y 250 kg.")
        return value

    @field_validator("training_days_per_week")
    @classmethod
    def validate_training_days(cls, value: int | None) -> int | None:
        if value is not None and not (1 <= value <= 7):
            raise ValueError("Los días de entrenamiento por semana deben estar entre 1 y 7.")
        return value

    @field_validator("session_duration_min")
    @classmethod
    def validate_session_duration(cls, value: int | None) -> int | None:
        if value is not None and not (15 <= value <= 240):
            raise ValueError("La duración de cada sesión debe estar entre 15 y 240 minutos.")
        return value


class LivingProfileResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    athlete_id: UUID
    has_saved_profile: bool
    age: int | None
    sex: BiologicalSex | None
    height_cm: float | None
    base_weight_kg: float | None
    experience_level: ExperienceLevel | None
    primary_goal: PrimaryGoal | None
    training_days_per_week: int | None
    session_duration_min: int | None
    equipment: list[str]
    allergies: list[str]
    food_preferences: list[str]
    training_approach: TrainingApproach
    notes: str | None
    updated_at: datetime | None
    injuries: list[InjuryResponse]
    active_injuries_count: int

    @classmethod
    def from_snapshot(cls, snapshot: LivingProfileSnapshot) -> LivingProfileResponse:
        profile = snapshot.profile
        return cls(
            athlete_id=profile.athlete_id,
            has_saved_profile=profile.has_saved_profile,
            age=profile.age,
            sex=profile.sex,
            height_cm=profile.height_cm,
            base_weight_kg=profile.base_weight_kg,
            experience_level=profile.experience_level,
            primary_goal=profile.primary_goal,
            training_days_per_week=profile.training_days_per_week,
            session_duration_min=profile.session_duration_min,
            equipment=list(profile.equipment),
            allergies=list(profile.allergies),
            food_preferences=list(profile.food_preferences),
            training_approach=profile.training_approach,
            notes=profile.notes,
            updated_at=profile.updated_at,
            injuries=[InjuryResponse.from_domain(injury) for injury in snapshot.injuries],
            active_injuries_count=snapshot.active_injuries_count,
        )
