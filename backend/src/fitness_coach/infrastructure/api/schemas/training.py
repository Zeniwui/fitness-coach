"""Pydantic v2 request/response DTOs for Training (#7)."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from fitness_coach.domain.training import (
    DeloadAssessment,
    ExerciseTrend,
    LoadUnit,
    Mesocycle,
    MesocycleStatus,
    MuscleGroupVolume,
    PlannedExercise,
    PlannedSession,
    PreviousExerciseMark,
    PriorMesocycleAction,
    SessionOrigin,
    SessionSet,
    TodaySessionExerciseView,
    TodaySessionView,
    TrainingSession,
    WeeklyVolumeSummary,
)


class PlannedExerciseSchema(BaseModel):
    exercise_name: str = Field(..., min_length=1, max_length=160)
    primary_muscle_group: str = Field(..., min_length=1, max_length=64)
    secondary_muscle_groups: list[str] = Field(default_factory=list)
    target_sets: int = Field(default=3, ge=1, le=20)
    rep_range_min: int = Field(default=8, ge=1, le=100)
    rep_range_max: int = Field(default=12, ge=1, le=100)
    target_rir: float | None = Field(default=2.0, ge=0.0, le=10.0)
    target_rpe: float | None = Field(default=None, ge=1.0, le=10.0)
    notes: str | None = Field(default=None, max_length=500)

    def to_domain(self) -> PlannedExercise:
        return PlannedExercise(
            exercise_name=self.exercise_name,
            primary_muscle_group=self.primary_muscle_group,
            secondary_muscle_groups=tuple(self.secondary_muscle_groups),
            target_sets=self.target_sets,
            rep_range_min=self.rep_range_min,
            rep_range_max=self.rep_range_max,
            target_rir=self.target_rir,
            target_rpe=self.target_rpe,
            notes=self.notes,
        )

    @classmethod
    def from_domain(cls, ex: PlannedExercise) -> PlannedExerciseSchema:
        return cls(
            exercise_name=ex.exercise_name,
            primary_muscle_group=ex.primary_muscle_group,
            secondary_muscle_groups=list(ex.secondary_muscle_groups),
            target_sets=ex.target_sets,
            rep_range_min=ex.rep_range_min,
            rep_range_max=ex.rep_range_max,
            target_rir=ex.target_rir,
            target_rpe=ex.target_rpe,
            notes=ex.notes,
        )


class PlannedSessionInput(BaseModel):
    day_order: int = Field(..., ge=1, le=14)
    name: str = Field(..., min_length=1, max_length=160)
    exercises: list[PlannedExerciseSchema] = Field(..., min_length=1)

    def to_domain(self) -> PlannedSession:
        return PlannedSession(
            id=None,
            day_order=self.day_order,
            name=self.name,
            exercises=tuple(ex.to_domain() for ex in self.exercises),
        )


class PlannedSessionResponse(BaseModel):
    id: UUID
    day_order: int
    name: str
    exercises: list[PlannedExerciseSchema]

    @classmethod
    def from_domain(cls, ps: PlannedSession) -> PlannedSessionResponse:
        assert ps.id is not None
        return cls(
            id=ps.id,
            day_order=ps.day_order,
            name=ps.name,
            exercises=[PlannedExerciseSchema.from_domain(ex) for ex in ps.exercises],
        )


class CreateMesocycleRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    goal: str = Field(..., min_length=1, max_length=160)
    duration_weeks: int = Field(default=5, ge=2, le=16)
    progression_criteria: str | None = Field(default=None, max_length=1000)
    deload_criteria: str | None = Field(default=None, max_length=1000)
    notes: str | None = Field(default=None, max_length=2000)
    planned_sessions: list[PlannedSessionInput] = Field(..., min_length=1)


class UpdateMesocycleRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    goal: str | None = Field(default=None, min_length=1, max_length=160)
    duration_weeks: int | None = Field(default=None, ge=2, le=16)
    progression_criteria: str | None = Field(default=None, max_length=1000)
    deload_criteria: str | None = Field(default=None, max_length=1000)
    notes: str | None = Field(default=None, max_length=2000)
    planned_sessions: list[PlannedSessionInput] | None = Field(default=None, min_length=1)


class DraftMesocycleWithCoachRequest(BaseModel):
    focus_notes: str | None = Field(default=None, max_length=1000)
    duration_weeks: int | None = Field(default=None, ge=2, le=16)


class ActivateMesocycleRequest(BaseModel):
    confirm_transition_status: PriorMesocycleAction | None = None


class TransitionMesocycleStatusRequest(BaseModel):
    status: MesocycleStatus


class MesocycleResponse(BaseModel):
    id: UUID
    name: str
    goal: str
    duration_weeks: int
    status: str
    progression_criteria: str | None
    deload_criteria: str | None
    notes: str | None
    planned_sessions: list[PlannedSessionResponse]
    created_at: datetime
    updated_at: datetime
    activated_at: datetime | None
    completed_at: datetime | None

    @classmethod
    def from_domain(cls, m: Mesocycle) -> MesocycleResponse:
        return cls(
            id=m.id,
            name=m.name,
            goal=m.goal,
            duration_weeks=m.duration_weeks,
            status=m.status.value,
            progression_criteria=m.progression_criteria,
            deload_criteria=m.deload_criteria,
            notes=m.notes,
            planned_sessions=[PlannedSessionResponse.from_domain(ps) for ps in m.planned_sessions],
            created_at=m.created_at,
            updated_at=m.updated_at,
            activated_at=m.activated_at,
            completed_at=m.completed_at,
        )


class CoachMesocycleDraftResponse(BaseModel):
    mesocycle: MesocycleResponse
    cited_card_ids: list[UUID]
    coach_rationale_es: str


class ActivateMesocycleResponse(BaseModel):
    mesocycle: MesocycleResponse
    previous_mesocycle: MesocycleResponse | None


class SessionSetInput(BaseModel):
    exercise_name: str = Field(..., min_length=1, max_length=160)
    muscle_group: str = Field(..., min_length=1, max_length=64)
    secondary_muscle_groups: list[str] = Field(default_factory=list)
    set_order: int = Field(..., ge=1)
    reps: int = Field(..., ge=1, le=200)
    load: float = Field(..., ge=0.0, le=2000.0)
    unit: LoadUnit = LoadUnit.KG
    rir: float | None = Field(default=None, ge=0.0, le=10.0)
    rpe: float | None = Field(default=None, ge=1.0, le=10.0)
    notes: str | None = Field(default=None, max_length=500)

    def to_domain(self) -> SessionSet:
        return SessionSet(
            id=None,
            exercise_name=self.exercise_name,
            muscle_group=self.muscle_group,
            set_order=self.set_order,
            reps=self.reps,
            load=self.load,
            unit=self.unit,
            rir=self.rir,
            rpe=self.rpe,
            secondary_muscle_groups=tuple(self.secondary_muscle_groups),
            notes=self.notes,
        )


class SessionSetResponse(BaseModel):
    id: UUID
    exercise_name: str
    muscle_group: str
    secondary_muscle_groups: list[str]
    set_order: int
    reps: int
    load: float
    unit: str
    rir: float | None
    rpe: float | None
    notes: str | None

    @classmethod
    def from_domain(cls, s: SessionSet) -> SessionSetResponse:
        assert s.id is not None
        return cls(
            id=s.id,
            exercise_name=s.exercise_name,
            muscle_group=s.muscle_group,
            secondary_muscle_groups=list(s.secondary_muscle_groups),
            set_order=s.set_order,
            reps=s.reps,
            load=s.load,
            unit=s.unit.value,
            rir=s.rir,
            rpe=s.rpe,
            notes=s.notes,
        )


class CreateTrainingSessionRequest(BaseModel):
    session_date: date
    name: str = Field(..., min_length=1, max_length=160)
    mesocycle_id: UUID | None = None
    planned_session_id: UUID | None = None
    origin: SessionOrigin = SessionOrigin.MANUAL_FORM
    fatigue_notes: str | None = Field(default=None, max_length=1000)
    sets: list[SessionSetInput] = Field(..., min_length=1)


class UpdateTrainingSessionRequest(BaseModel):
    session_date: date
    name: str = Field(..., min_length=1, max_length=160)
    mesocycle_id: UUID | None = None
    planned_session_id: UUID | None = None
    fatigue_notes: str | None = Field(default=None, max_length=1000)
    sets: list[SessionSetInput] = Field(..., min_length=1)


class TrainingSessionResponse(BaseModel):
    id: UUID
    mesocycle_id: UUID | None
    planned_session_id: UUID | None
    session_date: date
    name: str
    origin: str
    fatigue_notes: str | None
    sets: list[SessionSetResponse]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_domain(cls, ts: TrainingSession) -> TrainingSessionResponse:
        return cls(
            id=ts.id,
            mesocycle_id=ts.mesocycle_id,
            planned_session_id=ts.planned_session_id,
            session_date=ts.session_date,
            name=ts.name,
            origin=ts.origin.value,
            fatigue_notes=ts.fatigue_notes,
            sets=[SessionSetResponse.from_domain(s) for s in ts.sets],
            created_at=ts.created_at,
            updated_at=ts.updated_at,
        )


class PreviousExerciseMarkResponse(BaseModel):
    exercise_name: str
    last_session_date: date
    last_sets: list[SessionSetResponse]
    best_load: float
    best_reps: int
    best_unit: str
    best_rir: float | None
    best_e1rm_kg: float

    @classmethod
    def from_domain(cls, m: PreviousExerciseMark) -> PreviousExerciseMarkResponse:
        return cls(
            exercise_name=m.exercise_name,
            last_session_date=m.last_session_date,
            last_sets=[SessionSetResponse.from_domain(s) for s in m.last_sets],
            best_load=m.best_load,
            best_reps=m.best_reps,
            best_unit=m.best_unit.value,
            best_rir=m.best_rir,
            best_e1rm_kg=m.best_e1rm_kg,
        )


class TodaySessionExerciseResponse(BaseModel):
    planned: PlannedExerciseSchema
    previous_mark: PreviousExerciseMarkResponse | None

    @classmethod
    def from_domain(cls, v: TodaySessionExerciseView) -> TodaySessionExerciseResponse:
        return cls(
            planned=PlannedExerciseSchema.from_domain(v.planned),
            previous_mark=(
                PreviousExerciseMarkResponse.from_domain(v.previous_mark)
                if v.previous_mark is not None
                else None
            ),
        )


class TodaySessionResponse(BaseModel):
    active_mesocycle: MesocycleResponse | None
    planned_session: PlannedSessionResponse | None
    exercises: list[TodaySessionExerciseResponse]
    completed_sessions_in_mesocycle: int

    @classmethod
    def from_domain(cls, view: TodaySessionView) -> TodaySessionResponse:
        return cls(
            active_mesocycle=(
                MesocycleResponse.from_domain(view.active_mesocycle)
                if view.active_mesocycle is not None
                else None
            ),
            planned_session=(
                PlannedSessionResponse.from_domain(view.planned_session)
                if view.planned_session is not None
                else None
            ),
            exercises=[TodaySessionExerciseResponse.from_domain(e) for e in view.exercises],
            completed_sessions_in_mesocycle=view.completed_sessions_in_mesocycle,
        )


class MuscleGroupVolumeResponse(BaseModel):
    muscle_group: str
    direct_sets: int
    secondary_sets: int
    effective_sets: float
    planned_sets: int
    average_rir: float | None

    @classmethod
    def from_domain(cls, mg: MuscleGroupVolume) -> MuscleGroupVolumeResponse:
        return cls(
            muscle_group=mg.muscle_group,
            direct_sets=mg.direct_sets,
            secondary_sets=mg.secondary_sets,
            effective_sets=mg.effective_sets,
            planned_sets=mg.planned_sets,
            average_rir=mg.average_rir,
        )


class ExerciseTrendResponse(BaseModel):
    exercise_name: str
    sessions_analyzed: int
    latest_e1rm_kg: float
    previous_e1rm_kg: float
    e1rm_delta_pct: float
    latest_avg_rir: float | None
    status: str

    @classmethod
    def from_domain(cls, t: ExerciseTrend) -> ExerciseTrendResponse:
        return cls(
            exercise_name=t.exercise_name,
            sessions_analyzed=t.sessions_analyzed,
            latest_e1rm_kg=t.latest_e1rm_kg,
            previous_e1rm_kg=t.previous_e1rm_kg,
            e1rm_delta_pct=t.e1rm_delta_pct,
            latest_avg_rir=t.latest_avg_rir,
            status=t.status.value,
        )


class DeloadAssessmentResponse(BaseModel):
    status: str
    recommended: bool
    reasons_es: list[str]
    weeks_into_mesocycle: int
    high_fatigue_sessions: int
    regressing_exercises: list[str]

    @classmethod
    def from_domain(cls, d: DeloadAssessment) -> DeloadAssessmentResponse:
        return cls(
            status=d.status.value,
            recommended=d.recommended,
            reasons_es=list(d.reasons_es),
            weeks_into_mesocycle=d.weeks_into_mesocycle,
            high_fatigue_sessions=d.high_fatigue_sessions,
            regressing_exercises=list(d.regressing_exercises),
        )


class WeeklyVolumeSummaryResponse(BaseModel):
    week_start: date
    week_end: date
    active_mesocycle_id: UUID | None
    active_mesocycle_name: str | None
    total_sessions: int
    total_effective_sets: float
    by_muscle_group: list[MuscleGroupVolumeResponse]
    exercise_trends: list[ExerciseTrendResponse]
    deload_assessment: DeloadAssessmentResponse

    @classmethod
    def from_domain(cls, s: WeeklyVolumeSummary) -> WeeklyVolumeSummaryResponse:
        return cls(
            week_start=s.week_start,
            week_end=s.week_end,
            active_mesocycle_id=s.active_mesocycle_id,
            active_mesocycle_name=s.active_mesocycle_name,
            total_sessions=s.total_sessions,
            total_effective_sets=s.total_effective_sets,
            by_muscle_group=[MuscleGroupVolumeResponse.from_domain(m) for m in s.by_muscle_group],
            exercise_trends=[ExerciseTrendResponse.from_domain(t) for t in s.exercise_trends],
            deload_assessment=DeloadAssessmentResponse.from_domain(s.deload_assessment),
        )
