"""SQLAlchemy 2 async repository for Living Profile and Injuries/Restrictions."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from fitness_coach.domain.profile import (
    BiologicalSex,
    ExperienceLevel,
    InjuryRestriction,
    InjurySeverity,
    InjuryStatus,
    LivingProfile,
    PrimaryGoal,
    TrainingApproach,
)
from fitness_coach.infrastructure.db.models.profile import (
    InjuryRestrictionModel,
    LivingProfileModel,
)


def _to_profile_domain(row: LivingProfileModel) -> LivingProfile:
    return LivingProfile(
        athlete_id=row.athlete_id,
        age=row.age,
        sex=BiologicalSex(row.sex) if row.sex else None,
        height_cm=row.height_cm,
        base_weight_kg=row.base_weight_kg,
        experience_level=ExperienceLevel(row.experience_level) if row.experience_level else None,
        primary_goal=PrimaryGoal(row.primary_goal) if row.primary_goal else None,
        training_days_per_week=row.training_days_per_week,
        session_duration_min=row.session_duration_min,
        equipment=tuple(row.equipment or []),
        allergies=tuple(row.allergies or []),
        food_preferences=tuple(row.food_preferences or []),
        training_approach=TrainingApproach(row.training_approach),
        notes=row.notes,
        updated_at=row.updated_at,
    )


def _to_injury_domain(row: InjuryRestrictionModel) -> InjuryRestriction:
    return InjuryRestriction(
        id=row.id,
        athlete_id=row.athlete_id,
        body_part=row.body_part,
        description=row.description,
        severity=InjurySeverity(row.severity),
        status=InjuryStatus(row.status),
        resolution_notes=row.resolution_notes,
        created_at=row.created_at,
        resolved_at=row.resolved_at,
    )


class SqlAlchemyProfileRepository:
    """PostgreSQL implementation of ProfileRepositoryPort strictly scoped by athlete_id."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_profile(self, athlete_id: UUID) -> LivingProfile | None:
        result = await self._session.execute(
            select(LivingProfileModel).where(LivingProfileModel.athlete_id == athlete_id)
        )
        row = result.scalar_one_or_none()
        return _to_profile_domain(row) if row is not None else None

    async def upsert_profile(self, profile: LivingProfile) -> LivingProfile:
        result = await self._session.execute(
            select(LivingProfileModel).where(LivingProfileModel.athlete_id == profile.athlete_id)
        )
        row = result.scalar_one_or_none()
        now = datetime.now(UTC)

        if row is None:
            row = LivingProfileModel(
                athlete_id=profile.athlete_id,
                age=profile.age,
                sex=profile.sex.value if profile.sex else None,
                height_cm=profile.height_cm,
                base_weight_kg=profile.base_weight_kg,
                experience_level=(
                    profile.experience_level.value if profile.experience_level else None
                ),
                primary_goal=profile.primary_goal.value if profile.primary_goal else None,
                training_days_per_week=profile.training_days_per_week,
                session_duration_min=profile.session_duration_min,
                equipment=list(profile.equipment),
                allergies=list(profile.allergies),
                food_preferences=list(profile.food_preferences),
                training_approach=profile.training_approach.value,
                notes=profile.notes,
                updated_at=now,
            )
            self._session.add(row)
        else:
            row.age = profile.age
            row.sex = profile.sex.value if profile.sex else None
            row.height_cm = profile.height_cm
            row.base_weight_kg = profile.base_weight_kg
            row.experience_level = (
                profile.experience_level.value if profile.experience_level else None
            )
            row.primary_goal = profile.primary_goal.value if profile.primary_goal else None
            row.training_days_per_week = profile.training_days_per_week
            row.session_duration_min = profile.session_duration_min
            row.equipment = list(profile.equipment)
            row.allergies = list(profile.allergies)
            row.food_preferences = list(profile.food_preferences)
            row.training_approach = profile.training_approach.value
            row.notes = profile.notes
            row.updated_at = now

        await self._session.flush()
        await self._session.refresh(row)
        return _to_profile_domain(row)

    async def list_injuries(
        self,
        athlete_id: UUID,
        *,
        status: InjuryStatus | None = None,
    ) -> list[InjuryRestriction]:
        stmt = select(InjuryRestrictionModel).where(
            InjuryRestrictionModel.athlete_id == athlete_id
        )
        if status is not None:
            stmt = stmt.where(InjuryRestrictionModel.status == status.value)
        stmt = stmt.order_by(
            InjuryRestrictionModel.status.asc(),
            InjuryRestrictionModel.created_at.desc(),
        )
        result = await self._session.execute(stmt)
        return [_to_injury_domain(row) for row in result.scalars().all()]

    async def get_injury(
        self,
        athlete_id: UUID,
        injury_id: UUID,
    ) -> InjuryRestriction | None:
        result = await self._session.execute(
            select(InjuryRestrictionModel).where(
                InjuryRestrictionModel.athlete_id == athlete_id,
                InjuryRestrictionModel.id == injury_id,
            )
        )
        row = result.scalar_one_or_none()
        return _to_injury_domain(row) if row is not None else None

    async def create_injury(
        self,
        *,
        athlete_id: UUID,
        body_part: str,
        description: str,
        severity: InjurySeverity,
    ) -> InjuryRestriction:
        row = InjuryRestrictionModel(
            athlete_id=athlete_id,
            body_part=body_part,
            description=description,
            severity=severity.value,
            status=InjuryStatus.ACTIVE.value,
        )
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        return _to_injury_domain(row)

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
    ) -> InjuryRestriction | None:
        result = await self._session.execute(
            select(InjuryRestrictionModel).where(
                InjuryRestrictionModel.athlete_id == athlete_id,
                InjuryRestrictionModel.id == injury_id,
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None

        row.body_part = body_part
        row.description = description
        row.severity = severity.value
        row.status = status.value
        row.resolved_at = resolved_at
        row.resolution_notes = resolution_notes
        await self._session.flush()
        await self._session.refresh(row)
        return _to_injury_domain(row)

    async def delete_injury(
        self,
        athlete_id: UUID,
        injury_id: UUID,
    ) -> bool:
        result = await self._session.execute(
            delete(InjuryRestrictionModel).where(
                InjuryRestrictionModel.athlete_id == athlete_id,
                InjuryRestrictionModel.id == injury_id,
            )
        )
        await self._session.flush()
        return (result.rowcount or 0) > 0
