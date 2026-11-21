"""Training domain model: Mesocycles, Training Sessions, Weekly Effective Volume & Deload rules.

Pure Python: ZERO FastAPI, SQLAlchemy, or AI SDK imports.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from enum import StrEnum
from uuid import UUID


class MesocycleStatus(StrEnum):
    """Lifecycle states of a Mesocycle (single active|deload per Athlete)."""

    DRAFT = "draft"
    ACTIVE = "active"
    DELOAD = "deload"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class PriorMesocycleAction(StrEnum):
    """Explicit transition target for a prior active/deload Mesocycle upon replacement."""

    COMPLETED = "completed"
    ARCHIVED = "archived"


class SessionOrigin(StrEnum):
    """How a Training Session was recorded."""

    MANUAL_FORM = "manual_form"
    CHAT_TEXT = "chat_text"
    CHAT_VOICE = "chat_voice"


class LoadUnit(StrEnum):
    """Weight unit for a recorded set."""

    KG = "kg"
    LB = "lb"


class DeloadStatus(StrEnum):
    """Deload evaluation result for the current Mesocycle."""

    NOT_NEEDED = "not_needed"
    WATCH = "watch"
    RECOMMENDED = "recommended"


class TrendStatus(StrEnum):
    """Performance trend across recent sessions for a given exercise."""

    PROGRESSING = "progressing"
    STABLE = "stable"
    REGRESSING = "regressing"


class TrainingError(Exception):
    """Base domain error for training operations."""


class TrainingValidationError(TrainingError):
    """Raised when mesocycle or training session data violates domain constraints."""


class MesocycleNotFoundError(TrainingError):
    """Raised when a Mesocycle does not exist or does not belong to the Athlete."""


class ActiveMesocycleConflictError(TrainingError):
    """Raised when activating a Mesocycle while another is active/deload without confirmation."""

    def __init__(self, active_mesocycle: Mesocycle) -> None:
        self.active_mesocycle = active_mesocycle
        super().__init__(
            f"Ya tienes un Mesociclo activo ('{active_mesocycle.name}'). "
            "Confirma si deseas marcarlo como completado o archivado para activar el nuevo."
        )


class InvalidMesocycleTransitionError(TrainingError):
    """Raised when a Mesocycle status transition is not permitted."""


class TrainingSessionNotFoundError(TrainingError):
    """Raised when a Training Session does not exist or does not belong to the Athlete."""


_FATIGUE_KEYWORDS: tuple[str, ...] = (
    "fatiga",
    "agotado",
    "agotada",
    "cansado",
    "cansada",
    "sobrecargado",
    "sin fuerza",
    "molestia",
    "dolor",
    "pesado",
    "descarga",
    "deload",
    "estancado",
    "sueño malo",
)

_MUSCLE_GROUP_ALIASES: dict[str, str] = {
    "pecho": "pecho",
    "pectoral": "pecho",
    "chest": "pecho",
    "espalda": "espalda",
    "dorsal": "espalda",
    "back": "espalda",
    "cuadriceps": "cuadriceps",
    "quads": "cuadriceps",
    "quadriceps": "cuadriceps",
    "isquios": "isquios",
    "isquiotibiales": "isquios",
    "femoral": "isquios",
    "hamstrings": "isquios",
    "gluteos": "gluteos",
    "gluteo": "gluteos",
    "glutes": "gluteos",
    "hombros": "hombros",
    "hombro": "hombros",
    "deltoides": "hombros",
    "shoulders": "hombros",
    "biceps": "biceps",
    "triceps": "triceps",
    "gemelos": "gemelos",
    "pantorrillas": "gemelos",
    "calves": "gemelos",
    "core": "core",
    "abdomen": "core",
    "abdominales": "core",
    "abs": "core",
    "antebrazos": "antebrazos",
    "forearms": "antebrazos",
    "trapecio": "trapecio",
    "traps": "trapecio",
}

_LB_TO_KG = 0.45359237


def _strip_accents(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in nfkd if not unicodedata.combining(ch))


def normalize_exercise_key(name: str) -> str:
    """Canonical lowercase, accent-free key for matching exercises across sessions."""
    cleaned = " ".join(_strip_accents(name).lower().split())
    return cleaned


def normalize_muscle_group(name: str) -> str:
    """Normalize a muscle group label to a canonical Spanish lowercase identifier."""
    cleaned = " ".join(_strip_accents(name).lower().split())
    if not cleaned:
        return "general"
    return _MUSCLE_GROUP_ALIASES.get(cleaned, cleaned)


def load_to_kg(load: float, unit: LoadUnit) -> float:
    return load * _LB_TO_KG if unit == LoadUnit.LB else load


def estimate_e1rm_kg(load: float, reps: int, unit: LoadUnit = LoadUnit.KG) -> float:
    """Epley estimated 1RM in kg."""
    kg = load_to_kg(load, unit)
    if kg <= 0 or reps <= 0:
        return 0.0
    if reps == 1:
        return round(kg, 2)
    return round(kg * (1.0 + reps / 30.0), 2)


@dataclass(frozen=True, slots=True)
class PlannedExercise:
    """An exercise prescription inside a PlannedSession."""

    exercise_name: str
    primary_muscle_group: str
    secondary_muscle_groups: tuple[str, ...] = ()
    target_sets: int = 3
    rep_range_min: int = 8
    rep_range_max: int = 12
    target_rir: float | None = 2.0
    target_rpe: float | None = None
    notes: str | None = None

    def validate(self) -> None:
        if not self.exercise_name.strip():
            raise TrainingValidationError("El nombre del ejercicio es obligatorio.")
        if not self.primary_muscle_group.strip():
            raise TrainingValidationError("El grupo muscular principal es obligatorio.")
        if not (1 <= self.target_sets <= 20):
            raise TrainingValidationError("Las series objetivo deben estar entre 1 y 20.")
        if (
            self.rep_range_min < 1
            or self.rep_range_max < self.rep_range_min
            or self.rep_range_max > 100
        ):
            raise TrainingValidationError("El rango de repeticiones no es válido.")
        if self.target_rir is not None and not (0.0 <= self.target_rir <= 10.0):
            raise TrainingValidationError("El RIR objetivo debe estar entre 0 y 10.")
        if self.target_rpe is not None and not (1.0 <= self.target_rpe <= 10.0):
            raise TrainingValidationError("El RPE objetivo debe estar entre 1 y 10.")

    def to_dict(self) -> dict:
        return {
            "exercise_name": self.exercise_name.strip(),
            "primary_muscle_group": normalize_muscle_group(self.primary_muscle_group),
            "secondary_muscle_groups": [
                normalize_muscle_group(m) for m in self.secondary_muscle_groups if m.strip()
            ],
            "target_sets": self.target_sets,
            "rep_range_min": self.rep_range_min,
            "rep_range_max": self.rep_range_max,
            "target_rir": self.target_rir,
            "target_rpe": self.target_rpe,
            "notes": self.notes.strip() if self.notes else None,
        }

    @classmethod
    def from_dict(cls, data: dict) -> PlannedExercise:
        return cls(
            exercise_name=str(data.get("exercise_name", "")).strip(),
            primary_muscle_group=normalize_muscle_group(
                str(data.get("primary_muscle_group", "general"))
            ),
            secondary_muscle_groups=tuple(
                normalize_muscle_group(str(m))
                for m in (data.get("secondary_muscle_groups") or [])
                if str(m).strip()
            ),
            target_sets=int(data.get("target_sets", 3)),
            rep_range_min=int(data.get("rep_range_min", 8)),
            rep_range_max=int(data.get("rep_range_max", 12)),
            target_rir=(float(data["target_rir"]) if data.get("target_rir") is not None else None),
            target_rpe=(float(data["target_rpe"]) if data.get("target_rpe") is not None else None),
            notes=str(data["notes"]).strip() if data.get("notes") else None,
        )


@dataclass(frozen=True, slots=True)
class PlannedSession:
    """A planned training day inside a Mesocycle."""

    id: UUID | None
    day_order: int
    name: str
    exercises: tuple[PlannedExercise, ...] = ()

    def validate(self) -> None:
        if self.day_order < 1 or self.day_order > 14:
            raise TrainingValidationError("El orden del día debe estar entre 1 y 14.")
        if not self.name.strip():
            raise TrainingValidationError("El nombre de la sesión planificada es obligatorio.")
        if not self.exercises:
            raise TrainingValidationError(
                f"La sesión '{self.name}' debe incluir al menos un ejercicio."
            )
        for ex in self.exercises:
            ex.validate()


@dataclass(frozen=True, slots=True)
class Mesocycle:
    """Planned multi-week hypertrophy/strength training block."""

    id: UUID
    athlete_id: UUID
    name: str
    goal: str
    duration_weeks: int
    status: MesocycleStatus
    progression_criteria: str | None
    deload_criteria: str | None
    notes: str | None
    planned_sessions: tuple[PlannedSession, ...]
    created_at: datetime
    updated_at: datetime
    activated_at: datetime | None = None
    completed_at: datetime | None = None

    @property
    def is_current(self) -> bool:
        return self.status in (MesocycleStatus.ACTIVE, MesocycleStatus.DELOAD)

    def validate(self) -> None:
        if not self.name.strip():
            raise TrainingValidationError("El nombre del Mesociclo es obligatorio.")
        if not self.goal.strip():
            raise TrainingValidationError("El objetivo del Mesociclo es obligatorio.")
        if not (2 <= self.duration_weeks <= 16):
            raise TrainingValidationError(
                "La duración del Mesociclo debe estar entre 2 y 16 semanas."
            )
        if not self.planned_sessions:
            raise TrainingValidationError(
                "El Mesociclo debe incluir al menos una sesión planificada."
            )
        for ps in self.planned_sessions:
            ps.validate()

    def can_transition_to(self, target: MesocycleStatus) -> bool:
        allowed: dict[MesocycleStatus, set[MesocycleStatus]] = {
            MesocycleStatus.DRAFT: {MesocycleStatus.ACTIVE, MesocycleStatus.ARCHIVED},
            MesocycleStatus.ACTIVE: {
                MesocycleStatus.DELOAD,
                MesocycleStatus.COMPLETED,
                MesocycleStatus.ARCHIVED,
            },
            MesocycleStatus.DELOAD: {
                MesocycleStatus.ACTIVE,
                MesocycleStatus.COMPLETED,
                MesocycleStatus.ARCHIVED,
            },
            MesocycleStatus.COMPLETED: {MesocycleStatus.ARCHIVED},
            MesocycleStatus.ARCHIVED: set(),
        }
        return target in allowed[self.status]


@dataclass(frozen=True, slots=True)
class SessionSet:
    """A single performed set inside a TrainingSession."""

    id: UUID | None
    exercise_name: str
    muscle_group: str
    set_order: int
    reps: int
    load: float
    unit: LoadUnit = LoadUnit.KG
    rir: float | None = None
    rpe: float | None = None
    secondary_muscle_groups: tuple[str, ...] = ()
    notes: str | None = None

    def validate(self) -> None:
        if not self.exercise_name.strip():
            raise TrainingValidationError("El nombre del ejercicio en la serie es obligatorio.")
        if not self.muscle_group.strip():
            raise TrainingValidationError("El grupo muscular de la serie es obligatorio.")
        if self.set_order < 1:
            raise TrainingValidationError("El orden de serie debe ser mayor o igual a 1.")
        if self.reps < 1 or self.reps > 200:
            raise TrainingValidationError("Las repeticiones deben estar entre 1 y 200.")
        if self.load < 0.0 or self.load > 2000.0:
            raise TrainingValidationError("La carga debe estar entre 0 y 2000.")
        if self.rir is not None and not (0.0 <= self.rir <= 10.0):
            raise TrainingValidationError("El RIR debe estar entre 0 y 10.")
        if self.rpe is not None and not (1.0 <= self.rpe <= 10.0):
            raise TrainingValidationError("El RPE debe estar entre 1 y 10.")

    @property
    def is_effective_hypertrophy_set(self) -> bool:
        """Sets with RIR <= 4 (or unspecified RIR) count as effective hypertrophy sets."""
        if self.rir is not None:
            return self.rir <= 4.0
        if self.rpe is not None:
            return self.rpe >= 6.0
        return True


@dataclass(frozen=True, slots=True)
class TrainingSession:
    """A completed Training Session recorded by an Athlete."""

    id: UUID
    athlete_id: UUID
    mesocycle_id: UUID | None
    planned_session_id: UUID | None
    session_date: date
    name: str
    origin: SessionOrigin
    fatigue_notes: str | None
    sets: tuple[SessionSet, ...]
    created_at: datetime
    updated_at: datetime

    def validate(self) -> None:
        if not self.name.strip():
            raise TrainingValidationError("El nombre de la Sesión de Entrenamiento es obligatorio.")
        if not self.sets:
            raise TrainingValidationError(
                "La Sesión de Entrenamiento debe contener al menos una serie registrada."
            )
        for s in self.sets:
            s.validate()


@dataclass(frozen=True, slots=True)
class PreviousExerciseMark:
    """Last & best recorded performance for a given exercise by the Athlete."""

    exercise_name: str
    last_session_date: date
    last_sets: tuple[SessionSet, ...]
    best_load: float
    best_reps: int
    best_unit: LoadUnit
    best_rir: float | None
    best_e1rm_kg: float


@dataclass(frozen=True, slots=True)
class TodaySessionExerciseView:
    """Planned exercise paired with the Athlete's previous marks for that exercise."""

    planned: PlannedExercise
    previous_mark: PreviousExerciseMark | None


@dataclass(frozen=True, slots=True)
class TodaySessionView:
    """Today's session view for the active Mesocycle."""

    active_mesocycle: Mesocycle | None
    planned_session: PlannedSession | None
    exercises: tuple[TodaySessionExerciseView, ...]
    completed_sessions_in_mesocycle: int


@dataclass(frozen=True, slots=True)
class MuscleGroupVolume:
    """Weekly volume metrics for a single muscle group."""

    muscle_group: str
    direct_sets: int
    secondary_sets: int
    effective_sets: float
    planned_sets: int
    average_rir: float | None


@dataclass(frozen=True, slots=True)
class ExerciseTrend:
    """Performance trend of an exercise over recent sessions."""

    exercise_name: str
    sessions_analyzed: int
    latest_e1rm_kg: float
    previous_e1rm_kg: float
    e1rm_delta_pct: float
    latest_avg_rir: float | None
    status: TrendStatus


@dataclass(frozen=True, slots=True)
class DeloadAssessment:
    """Structured deload (descarga) recommendation & rationale."""

    status: DeloadStatus
    recommended: bool
    reasons_es: tuple[str, ...]
    weeks_into_mesocycle: int
    high_fatigue_sessions: int
    regressing_exercises: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class WeeklyVolumeSummary:
    """Complete weekly training volume and deload analysis."""

    week_start: date
    week_end: date
    active_mesocycle_id: UUID | None
    active_mesocycle_name: str | None
    total_sessions: int
    total_effective_sets: float
    by_muscle_group: tuple[MuscleGroupVolume, ...]
    exercise_trends: tuple[ExerciseTrend, ...]
    deload_assessment: DeloadAssessment


def get_iso_week_bounds(ref_date: date) -> tuple[date, date]:
    """Return Monday..Sunday bounds for the ISO week containing ref_date."""
    week_start = ref_date - timedelta(days=ref_date.weekday())
    week_end = week_start + timedelta(days=6)
    return week_start, week_end


def build_previous_exercise_mark(
    *,
    exercise_name: str,
    historical_sessions: list[TrainingSession],
) -> PreviousExerciseMark | None:
    """Compute last session sets and best historical mark for an exercise."""
    target_key = normalize_exercise_key(exercise_name)
    matched_by_session: list[tuple[date, list[SessionSet]]] = []
    for session in historical_sessions:
        matching_sets = [
            s for s in session.sets if normalize_exercise_key(s.exercise_name) == target_key
        ]
        if matching_sets:
            matched_by_session.append((session.session_date, matching_sets))

    if not matched_by_session:
        return None

    # Sort newest first to grab the latest session
    matched_by_session.sort(key=lambda item: item[0], reverse=True)
    last_date, last_sets = matched_by_session[0]

    best_set = last_sets[0]
    best_e1rm = estimate_e1rm_kg(best_set.load, best_set.reps, best_set.unit)
    for _, sets in matched_by_session:
        for s in sets:
            e1rm = estimate_e1rm_kg(s.load, s.reps, s.unit)
            if e1rm > best_e1rm:
                best_e1rm = e1rm
                best_set = s

    return PreviousExerciseMark(
        exercise_name=exercise_name,
        last_session_date=last_date,
        last_sets=tuple(sorted(last_sets, key=lambda s: s.set_order)),
        best_load=best_set.load,
        best_reps=best_set.reps,
        best_unit=best_set.unit,
        best_rir=best_set.rir,
        best_e1rm_kg=best_e1rm,
    )


def calculate_effective_weekly_volume(
    *,
    week_sessions: list[TrainingSession],
    active_mesocycle: Mesocycle | None,
) -> tuple[MuscleGroupVolume, ...]:
    """Calculate direct, secondary (0.5x), and effective hypertrophy sets per muscle group."""
    direct_counts: dict[str, int] = {}
    secondary_counts: dict[str, int] = {}
    effective_totals: dict[str, float] = {}
    rir_values: dict[str, list[float]] = {}
    planned_counts: dict[str, int] = {}

    if active_mesocycle is not None:
        for ps in active_mesocycle.planned_sessions:
            for ex in ps.exercises:
                mg = normalize_muscle_group(ex.primary_muscle_group)
                planned_counts[mg] = planned_counts.get(mg, 0) + ex.target_sets

    for session in week_sessions:
        for s in session.sets:
            if not s.is_effective_hypertrophy_set:
                continue
            primary = normalize_muscle_group(s.muscle_group)
            direct_counts[primary] = direct_counts.get(primary, 0) + 1
            effective_totals[primary] = effective_totals.get(primary, 0.0) + 1.0
            if s.rir is not None:
                rir_values.setdefault(primary, []).append(s.rir)

            for sec in s.secondary_muscle_groups:
                sec_norm = normalize_muscle_group(sec)
                if sec_norm == primary:
                    continue
                secondary_counts[sec_norm] = secondary_counts.get(sec_norm, 0) + 1
                effective_totals[sec_norm] = effective_totals.get(sec_norm, 0.0) + 0.5

    all_groups = sorted(
        set(direct_counts) | set(secondary_counts) | set(planned_counts),
        key=lambda g: (-effective_totals.get(g, 0.0), g),
    )

    result: list[MuscleGroupVolume] = []
    for mg in all_groups:
        rirs = rir_values.get(mg, [])
        avg_rir = round(sum(rirs) / len(rirs), 2) if rirs else None
        result.append(
            MuscleGroupVolume(
                muscle_group=mg,
                direct_sets=direct_counts.get(mg, 0),
                secondary_sets=secondary_counts.get(mg, 0),
                effective_sets=round(effective_totals.get(mg, 0.0), 2),
                planned_sets=planned_counts.get(mg, 0),
                average_rir=avg_rir,
            )
        )
    return tuple(result)


def evaluate_deload_and_trends(
    *,
    active_mesocycle: Mesocycle | None,
    recent_sessions: list[TrainingSession],
    reference_date: date,
) -> tuple[DeloadAssessment, tuple[ExerciseTrend, ...]]:
    """Analyze exercise load/RIR trends and determine if a deload (descarga) is warranted."""
    # Sort oldest -> newest for trend progression
    ordered = sorted(recent_sessions, key=lambda s: (s.session_date, s.created_at))

    # Group by exercise key: list of (session_date, max_e1rm, avg_rir)
    per_exercise: dict[str, tuple[str, list[tuple[date, float, float | None]]]] = {}
    for session in ordered:
        session_ex_sets: dict[str, list[SessionSet]] = {}
        for s in session.sets:
            key = normalize_exercise_key(s.exercise_name)
            session_ex_sets.setdefault(key, []).append(s)
        for key, sets in session_ex_sets.items():
            best_e1rm = max(estimate_e1rm_kg(s.load, s.reps, s.unit) for s in sets)
            rirs = [s.rir for s in sets if s.rir is not None]
            avg_rir = round(sum(rirs) / len(rirs), 2) if rirs else None
            display_name = sets[0].exercise_name
            per_exercise.setdefault(key, (display_name, []))[1].append(
                (session.session_date, best_e1rm, avg_rir)
            )

    trends: list[ExerciseTrend] = []
    regressing_names: list[str] = []
    for _, (display_name, points) in per_exercise.items():
        if len(points) < 2:
            continue
        prev_e1rm = points[-2][1]
        latest_e1rm = points[-1][1]
        latest_rir = points[-1][2]
        if prev_e1rm > 0:
            delta_pct = round(((latest_e1rm - prev_e1rm) / prev_e1rm) * 100.0, 2)
        else:
            delta_pct = 0.0

        if delta_pct <= -2.5:
            t_status = TrendStatus.REGRESSING
            regressing_names.append(display_name)
        elif delta_pct >= 1.5:
            t_status = TrendStatus.PROGRESSING
        else:
            t_status = TrendStatus.STABLE

        trends.append(
            ExerciseTrend(
                exercise_name=display_name,
                sessions_analyzed=len(points),
                latest_e1rm_kg=latest_e1rm,
                previous_e1rm_kg=prev_e1rm,
                e1rm_delta_pct=delta_pct,
                latest_avg_rir=latest_rir,
                status=t_status,
            )
        )

    # Fatigue signals across recent sessions (last 14 days or last 6 sessions)
    recent_window = ordered[-6:]
    high_fatigue_sessions = 0
    for session in recent_window:
        notes_lower = _strip_accents((session.fatigue_notes or "").lower())
        has_fatigue_note = any(kw in notes_lower for kw in _FATIGUE_KEYWORDS)
        rirs = [s.rir for s in session.sets if s.rir is not None]
        low_rir = bool(rirs) and (sum(rirs) / len(rirs)) <= 0.8
        if has_fatigue_note or low_rir:
            high_fatigue_sessions += 1

    weeks_into_meso = 0
    planned_deload_due = False
    if active_mesocycle is not None and active_mesocycle.activated_at is not None:
        days_active = max(0, (reference_date - active_mesocycle.activated_at.date()).days)
        weeks_into_meso = (days_active // 7) + 1
        if weeks_into_meso >= active_mesocycle.duration_weeks:
            planned_deload_due = True

    reasons: list[str] = []
    if planned_deload_due and active_mesocycle is not None:
        reasons.append(
            f"Has alcanzado la semana {weeks_into_meso} de {active_mesocycle.duration_weeks} "
            "del Mesociclo activo (descarga planificada)."
        )
    if regressing_names:
        reasons.append(f"Caída de rendimiento (e1RM) detectada en: {', '.join(regressing_names)}.")
    if high_fatigue_sessions >= 2:
        reasons.append(
            f"Fatiga acumulada o proximidad extrema al fallo (RIR ≤ 0.8) en "
            f"{high_fatigue_sessions} sesiones recientes."
        )

    if (
        planned_deload_due
        or (len(regressing_names) >= 1 and high_fatigue_sessions >= 2)
        or len(regressing_names) >= 2
    ):
        deload_status = DeloadStatus.RECOMMENDED
        recommended = True
    elif high_fatigue_sessions >= 2 or len(regressing_names) == 1:
        deload_status = DeloadStatus.WATCH
        recommended = False
    else:
        deload_status = DeloadStatus.NOT_NEEDED
        recommended = False

    return (
        DeloadAssessment(
            status=deload_status,
            recommended=recommended,
            reasons_es=tuple(reasons),
            weeks_into_mesocycle=weeks_into_meso,
            high_fatigue_sessions=high_fatigue_sessions,
            regressing_exercises=tuple(regressing_names),
        ),
        tuple(trends),
    )
