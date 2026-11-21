"""SQLAlchemy 2 async repository for Training (#7), enforcing strict athlete_id isolation."""

from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy import case, delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from fitness_coach.domain.training import (
    LoadUnit,
    Mesocycle,
    MesocycleStatus,
    PlannedExercise,
    PlannedSession,
    SessionOrigin,
    SessionSet,
    TrainingSession,
    normalize_muscle_group,
)
from fitness_coach.infrastructure.db.models.training import (
    MesocycleModel,
    PlannedSessionModel,
    SessionSetModel,
    TrainingSessionModel,
)


def _mesocycle_to_domain(row: MesocycleModel) -> Mesocycle:
    planned = tuple(
        PlannedSession(
            id=ps.id,
            day_order=ps.day_order,
            name=ps.name,
            exercises=tuple(PlannedExercise.from_dict(ex) for ex in (ps.exercises or [])),
        )
        for ps in sorted(row.planned_sessions, key=lambda p: p.day_order)
    )
    return Mesocycle(
        id=row.id,
        athlete_id=row.athlete_id,
        name=row.name,
        goal=row.goal,
        duration_weeks=row.duration_weeks,
        status=MesocycleStatus(row.status),
        progression_criteria=row.progression_criteria,
        deload_criteria=row.deload_criteria,
        notes=row.notes,
        planned_sessions=planned,
        created_at=row.created_at,
        updated_at=row.updated_at,
        activated_at=row.activated_at,
        completed_at=row.completed_at,
    )


def _session_to_domain(row: TrainingSessionModel) -> TrainingSession:
    sets = tuple(
        SessionSet(
            id=s.id,
            exercise_name=s.exercise_name,
            muscle_group=s.muscle_group,
            set_order=s.set_order,
            reps=s.reps,
            load=s.load,
            unit=LoadUnit(s.unit),
            rir=s.rir,
            rpe=s.rpe,
            secondary_muscle_groups=tuple(s.secondary_muscle_groups or []),
            notes=s.notes,
        )
        for s in sorted(row.sets, key=lambda item: item.set_order)
    )
    return TrainingSession(
        id=row.id,
        athlete_id=row.athlete_id,
        mesocycle_id=row.mesocycle_id,
        planned_session_id=row.planned_session_id,
        session_date=row.session_date,
        name=row.name,
        origin=SessionOrigin(row.origin),
        fatigue_notes=row.fatigue_notes,
        sets=sets,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


class SqlAlchemyTrainingRepository:
    """Concrete SQLAlchemy 2 repository for Mesocycles and Training Sessions."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_mesocycles(self, *, athlete_id: UUID) -> list[Mesocycle]:
        status_rank = case(
            (MesocycleModel.status == MesocycleStatus.ACTIVE.value, 0),
            (MesocycleModel.status == MesocycleStatus.DELOAD.value, 1),
            (MesocycleModel.status == MesocycleStatus.DRAFT.value, 2),
            (MesocycleModel.status == MesocycleStatus.COMPLETED.value, 3),
            else_=4,
        )
        stmt = (
            select(MesocycleModel)
            .where(MesocycleModel.athlete_id == athlete_id)
            .options(selectinload(MesocycleModel.planned_sessions))
            .order_by(status_rank, MesocycleModel.updated_at.desc())
        )
        rows = (await self._session.execute(stmt)).scalars().all()
        return [_mesocycle_to_domain(row) for row in rows]

    async def get_mesocycle(self, *, athlete_id: UUID, mesocycle_id: UUID) -> Mesocycle | None:
        stmt = (
            select(MesocycleModel)
            .where(
                MesocycleModel.id == mesocycle_id,
                MesocycleModel.athlete_id == athlete_id,
            )
            .options(selectinload(MesocycleModel.planned_sessions))
        )
        row = (await self._session.execute(stmt)).scalar_one_or_none()
        return _mesocycle_to_domain(row) if row is not None else None

    async def get_current_mesocycle(self, *, athlete_id: UUID) -> Mesocycle | None:
        stmt = (
            select(MesocycleModel)
            .where(
                MesocycleModel.athlete_id == athlete_id,
                MesocycleModel.status.in_(
                    [MesocycleStatus.ACTIVE.value, MesocycleStatus.DELOAD.value]
                ),
            )
            .options(selectinload(MesocycleModel.planned_sessions))
        )
        row = (await self._session.execute(stmt)).scalar_one_or_none()
        return _mesocycle_to_domain(row) if row is not None else None

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
    ) -> Mesocycle:
        now = datetime.now(UTC)
        row = MesocycleModel(
            athlete_id=athlete_id,
            name=name.strip(),
            goal=goal.strip(),
            duration_weeks=duration_weeks,
            status=status.value,
            progression_criteria=progression_criteria.strip() if progression_criteria else None,
            deload_criteria=deload_criteria.strip() if deload_criteria else None,
            notes=notes.strip() if notes else None,
            created_at=now,
            updated_at=now,
            planned_sessions=[
                PlannedSessionModel(
                    day_order=ps.day_order,
                    name=ps.name.strip(),
                    exercises=[ex.to_dict() for ex in ps.exercises],
                )
                for ps in sorted(planned_sessions, key=lambda p: p.day_order)
            ],
        )
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row, attribute_names=["planned_sessions"])
        return _mesocycle_to_domain(row)

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
    ) -> Mesocycle | None:
        stmt = (
            select(MesocycleModel)
            .where(
                MesocycleModel.id == mesocycle_id,
                MesocycleModel.athlete_id == athlete_id,
            )
            .options(selectinload(MesocycleModel.planned_sessions))
        )
        row = (await self._session.execute(stmt)).scalar_one_or_none()
        if row is None:
            return None

        row.name = name.strip()
        row.goal = goal.strip()
        row.duration_weeks = duration_weeks
        row.progression_criteria = progression_criteria.strip() if progression_criteria else None
        row.deload_criteria = deload_criteria.strip() if deload_criteria else None
        row.notes = notes.strip() if notes else None
        row.updated_at = datetime.now(UTC)

        row.planned_sessions.clear()
        await self._session.flush()
        for ps in sorted(planned_sessions, key=lambda p: p.day_order):
            row.planned_sessions.append(
                PlannedSessionModel(
                    mesocycle_id=row.id,
                    day_order=ps.day_order,
                    name=ps.name.strip(),
                    exercises=[ex.to_dict() for ex in ps.exercises],
                )
            )
        await self._session.flush()
        await self._session.refresh(row, attribute_names=["planned_sessions"])
        return _mesocycle_to_domain(row)

    async def set_mesocycle_status(
        self,
        *,
        athlete_id: UUID,
        mesocycle_id: UUID,
        status: MesocycleStatus,
        activated_at: datetime | None = None,
        completed_at: datetime | None = None,
    ) -> Mesocycle | None:
        stmt = (
            select(MesocycleModel)
            .where(
                MesocycleModel.id == mesocycle_id,
                MesocycleModel.athlete_id == athlete_id,
            )
            .options(selectinload(MesocycleModel.planned_sessions))
        )
        row = (await self._session.execute(stmt)).scalar_one_or_none()
        if row is None:
            return None

        row.status = status.value
        row.updated_at = datetime.now(UTC)
        if activated_at is not None:
            row.activated_at = activated_at
        if completed_at is not None:
            row.completed_at = completed_at

        await self._session.flush()
        return _mesocycle_to_domain(row)

    async def list_training_sessions(
        self,
        *,
        athlete_id: UUID,
        mesocycle_id: UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        limit: int = 100,
    ) -> list[TrainingSession]:
        stmt = (
            select(TrainingSessionModel)
            .where(TrainingSessionModel.athlete_id == athlete_id)
            .options(selectinload(TrainingSessionModel.sets))
        )
        if mesocycle_id is not None:
            stmt = stmt.where(TrainingSessionModel.mesocycle_id == mesocycle_id)
        if date_from is not None:
            stmt = stmt.where(TrainingSessionModel.session_date >= date_from)
        if date_to is not None:
            stmt = stmt.where(TrainingSessionModel.session_date <= date_to)
        stmt = stmt.order_by(
            TrainingSessionModel.session_date.desc(),
            TrainingSessionModel.created_at.desc(),
        ).limit(limit)
        rows = (await self._session.execute(stmt)).scalars().all()
        return [_session_to_domain(row) for row in rows]

    async def get_training_session(
        self, *, athlete_id: UUID, session_id: UUID
    ) -> TrainingSession | None:
        stmt = (
            select(TrainingSessionModel)
            .where(
                TrainingSessionModel.id == session_id,
                TrainingSessionModel.athlete_id == athlete_id,
            )
            .options(selectinload(TrainingSessionModel.sets))
        )
        row = (await self._session.execute(stmt)).scalar_one_or_none()
        return _session_to_domain(row) if row is not None else None

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
    ) -> TrainingSession:
        now = datetime.now(UTC)
        row = TrainingSessionModel(
            athlete_id=athlete_id,
            mesocycle_id=mesocycle_id,
            planned_session_id=planned_session_id,
            session_date=session_date,
            name=name.strip(),
            origin=origin.value,
            fatigue_notes=fatigue_notes.strip() if fatigue_notes else None,
            created_at=now,
            updated_at=now,
            sets=[
                SessionSetModel(
                    exercise_name=s.exercise_name.strip(),
                    muscle_group=normalize_muscle_group(s.muscle_group),
                    secondary_muscle_groups=[
                        normalize_muscle_group(m) for m in s.secondary_muscle_groups if m.strip()
                    ],
                    set_order=s.set_order,
                    reps=s.reps,
                    load=s.load,
                    unit=s.unit.value,
                    rir=s.rir,
                    rpe=s.rpe,
                    notes=s.notes.strip() if s.notes else None,
                )
                for s in sorted(sets, key=lambda item: item.set_order)
            ],
        )
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row, attribute_names=["sets"])
        return _session_to_domain(row)

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
    ) -> TrainingSession | None:
        stmt = (
            select(TrainingSessionModel)
            .where(
                TrainingSessionModel.id == session_id,
                TrainingSessionModel.athlete_id == athlete_id,
            )
            .options(selectinload(TrainingSessionModel.sets))
        )
        row = (await self._session.execute(stmt)).scalar_one_or_none()
        if row is None:
            return None

        row.mesocycle_id = mesocycle_id
        row.planned_session_id = planned_session_id
        row.session_date = session_date
        row.name = name.strip()
        row.fatigue_notes = fatigue_notes.strip() if fatigue_notes else None
        row.updated_at = datetime.now(UTC)

        row.sets.clear()
        await self._session.flush()
        for s in sorted(sets, key=lambda item: item.set_order):
            row.sets.append(
                SessionSetModel(
                    training_session_id=row.id,
                    exercise_name=s.exercise_name.strip(),
                    muscle_group=normalize_muscle_group(s.muscle_group),
                    secondary_muscle_groups=[
                        normalize_muscle_group(m) for m in s.secondary_muscle_groups if m.strip()
                    ],
                    set_order=s.set_order,
                    reps=s.reps,
                    load=s.load,
                    unit=s.unit.value,
                    rir=s.rir,
                    rpe=s.rpe,
                    notes=s.notes.strip() if s.notes else None,
                )
            )
        await self._session.flush()
        await self._session.refresh(row, attribute_names=["sets"])
        return _session_to_domain(row)

    async def delete_training_session(self, *, athlete_id: UUID, session_id: UUID) -> bool:
        stmt = (
            delete(TrainingSessionModel)
            .where(
                TrainingSessionModel.id == session_id,
                TrainingSessionModel.athlete_id == athlete_id,
            )
            .returning(TrainingSessionModel.id)
        )
        deleted_id = (await self._session.execute(stmt)).scalar_one_or_none()
        return deleted_id is not None
