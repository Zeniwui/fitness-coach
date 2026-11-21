"""Living Profile and Injury/Restriction use cases."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from fitness_coach.application.ports.repositories.profile import ProfileRepositoryPort
from fitness_coach.domain.identity import AuthContext
from fitness_coach.domain.profile import (
    BiologicalSex,
    ExperienceLevel,
    InjuryNotFoundError,
    InjuryRestriction,
    InjurySeverity,
    InjuryStatus,
    LivingProfile,
    PrimaryGoal,
    ProfileValidationError,
    TrainingApproach,
    normalize_tag_list,
)


@dataclass(frozen=True, slots=True)
class LivingProfileSnapshot:
    """Combined view of an Athlete's Living Profile and Injuries/Restrictions."""

    profile: LivingProfile
    injuries: tuple[InjuryRestriction, ...]

    @property
    def active_injuries_count(self) -> int:
        return sum(1 for injury in self.injuries if injury.is_active)


class GetLivingProfileUseCase:
    """Fetches the authenticated Athlete's Living Profile and all injuries."""

    def __init__(self, repo: ProfileRepositoryPort) -> None:
        self._repo = repo

    async def execute(self, *, auth: AuthContext) -> LivingProfileSnapshot:
        profile = await self._repo.get_profile(auth.athlete_id)
        if profile is None:
            profile = LivingProfile.empty(auth.athlete_id)
        injuries = await self._repo.list_injuries(auth.athlete_id)
        return LivingProfileSnapshot(profile=profile, injuries=tuple(injuries))


class UpsertLivingProfileUseCase:
    """Creates or updates the authenticated Athlete's Living Profile."""

    def __init__(self, repo: ProfileRepositoryPort) -> None:
        self._repo = repo

    async def execute(
        self,
        *,
        auth: AuthContext,
        age: int | None,
        sex: BiologicalSex | None,
        height_cm: float | None,
        base_weight_kg: float | None,
        experience_level: ExperienceLevel | None,
        primary_goal: PrimaryGoal | None,
        training_days_per_week: int | None,
        session_duration_min: int | None,
        equipment: list[str],
        allergies: list[str],
        food_preferences: list[str],
        training_approach: TrainingApproach,
        notes: str | None,
    ) -> LivingProfileSnapshot:
        cleaned_notes = notes.strip() if notes is not None else None
        if cleaned_notes == "":
            cleaned_notes = None

        profile = LivingProfile(
            athlete_id=auth.athlete_id,
            age=age,
            sex=sex,
            height_cm=height_cm,
            base_weight_kg=base_weight_kg,
            experience_level=experience_level,
            primary_goal=primary_goal,
            training_days_per_week=training_days_per_week,
            session_duration_min=session_duration_min,
            equipment=normalize_tag_list(equipment),
            allergies=normalize_tag_list(allergies),
            food_preferences=normalize_tag_list(food_preferences),
            training_approach=training_approach,
            notes=cleaned_notes,
        )
        profile.validate()

        saved = await self._repo.upsert_profile(profile)
        injuries = await self._repo.list_injuries(auth.athlete_id)
        return LivingProfileSnapshot(profile=saved, injuries=tuple(injuries))


class ListInjuriesUseCase:
    """Lists injuries/restrictions belonging strictly to the authenticated Athlete."""

    def __init__(self, repo: ProfileRepositoryPort) -> None:
        self._repo = repo

    async def execute(
        self,
        *,
        auth: AuthContext,
        status: InjuryStatus | None = None,
    ) -> list[InjuryRestriction]:
        return await self._repo.list_injuries(auth.athlete_id, status=status)


class CreateInjuryUseCase:
    """Registers a new active injury/restriction for the authenticated Athlete."""

    def __init__(self, repo: ProfileRepositoryPort) -> None:
        self._repo = repo

    async def execute(
        self,
        *,
        auth: AuthContext,
        body_part: str,
        description: str,
        severity: InjurySeverity,
    ) -> InjuryRestriction:
        cleaned_part = body_part.strip()
        cleaned_desc = description.strip()
        if not cleaned_part:
            raise ProfileValidationError("Debes indicar la zona corporal afectada.")
        if not cleaned_desc:
            raise ProfileValidationError("Debes describir la lesión o restricción.")
        return await self._repo.create_injury(
            athlete_id=auth.athlete_id,
            body_part=cleaned_part,
            description=cleaned_desc,
            severity=severity,
        )


class UpdateInjuryUseCase:
    """Edits an injury/restriction or toggles its active/resolved status."""

    def __init__(self, repo: ProfileRepositoryPort) -> None:
        self._repo = repo

    async def execute(
        self,
        *,
        auth: AuthContext,
        injury_id: UUID,
        body_part: str | None = None,
        description: str | None = None,
        severity: InjurySeverity | None = None,
        status: InjuryStatus | None = None,
        resolved_at: datetime | None = None,
        resolution_notes: str | None = None,
        resolution_notes_provided: bool = False,
    ) -> InjuryRestriction:
        existing = await self._repo.get_injury(auth.athlete_id, injury_id)
        if existing is None:
            raise InjuryNotFoundError("La lesión o restricción indicada no existe.")

        next_body_part = existing.body_part if body_part is None else body_part.strip()
        next_description = existing.description if description is None else description.strip()
        if not next_body_part:
            raise ProfileValidationError("Debes indicar la zona corporal afectada.")
        if not next_description:
            raise ProfileValidationError("Debes describir la lesión o restricción.")

        next_severity = existing.severity if severity is None else severity
        next_status = existing.status if status is None else status

        if next_status == InjuryStatus.RESOLVED:
            if resolved_at is not None:
                next_resolved_at: datetime | None = resolved_at
            elif existing.resolved_at is not None:
                next_resolved_at = existing.resolved_at
            else:
                next_resolved_at = datetime.now(UTC)
            if resolution_notes_provided:
                cleaned_res = resolution_notes.strip() if resolution_notes is not None else None
                next_resolution_notes = cleaned_res or None
            else:
                next_resolution_notes = existing.resolution_notes
        else:
            next_resolved_at = None
            next_resolution_notes = None

        updated = await self._repo.update_injury(
            athlete_id=auth.athlete_id,
            injury_id=injury_id,
            body_part=next_body_part,
            description=next_description,
            severity=next_severity,
            status=next_status,
            resolved_at=next_resolved_at,
            resolution_notes=next_resolution_notes,
        )
        if updated is None:
            raise InjuryNotFoundError("La lesión o restricción indicada no existe.")
        return updated


class DeleteInjuryUseCase:
    """Deletes an injury/restriction owned by the authenticated Athlete."""

    def __init__(self, repo: ProfileRepositoryPort) -> None:
        self._repo = repo

    async def execute(self, *, auth: AuthContext, injury_id: UUID) -> None:
        deleted = await self._repo.delete_injury(auth.athlete_id, injury_id)
        if not deleted:
            raise InjuryNotFoundError("La lesión o restricción indicada no existe.")
