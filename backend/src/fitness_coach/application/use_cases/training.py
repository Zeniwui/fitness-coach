"""Application use cases for Training (#7): Mesocycles, Sessions, Volume, Deload & Coach."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from fitness_coach.application.ports.ai_provider import AIProviderPort, ModelTier
from fitness_coach.application.ports.repositories.knowledge import KnowledgeRepositoryPort
from fitness_coach.application.ports.repositories.profile import ProfileRepositoryPort
from fitness_coach.application.ports.repositories.training import TrainingRepositoryPort
from fitness_coach.domain.identity import AuthContext
from fitness_coach.domain.knowledge import ValidityStatus
from fitness_coach.domain.profile import InjuryRestriction, InjuryStatus, LivingProfile, PrimaryGoal
from fitness_coach.domain.training import (
    ActiveMesocycleConflictError,
    InvalidMesocycleTransitionError,
    Mesocycle,
    MesocycleNotFoundError,
    MesocycleStatus,
    PlannedExercise,
    PlannedSession,
    PriorMesocycleAction,
    SessionOrigin,
    SessionSet,
    TodaySessionExerciseView,
    TodaySessionView,
    TrainingSession,
    TrainingSessionNotFoundError,
    TrainingValidationError,
    WeeklyVolumeSummary,
    build_previous_exercise_mark,
    calculate_effective_weekly_volume,
    evaluate_deload_and_trends,
    get_iso_week_bounds,
)


@dataclass(frozen=True, slots=True)
class CoachMesocycleDraftResult:
    """Result of Coach-generated draft Mesocycle plus KB evidence IDs consulted."""

    mesocycle: Mesocycle
    cited_card_ids: tuple[UUID, ...]
    coach_rationale_es: str


@dataclass(frozen=True, slots=True)
class MesocycleActivationResult:
    """Result of activating a Mesocycle (including any prior active Mesocycle transitioned)."""

    mesocycle: Mesocycle
    previous_mesocycle: Mesocycle | None


class ListMesocyclesUseCase:
    def __init__(self, repo: TrainingRepositoryPort) -> None:
        self._repo = repo

    async def execute(self, *, auth: AuthContext) -> list[Mesocycle]:
        return await self._repo.list_mesocycles(athlete_id=auth.athlete_id)


class CreateMesocycleUseCase:
    def __init__(self, repo: TrainingRepositoryPort) -> None:
        self._repo = repo

    async def execute(
        self,
        *,
        auth: AuthContext,
        name: str,
        goal: str,
        duration_weeks: int,
        progression_criteria: str | None,
        deload_criteria: str | None,
        notes: str | None,
        planned_sessions: tuple[PlannedSession, ...],
    ) -> Mesocycle:
        now = datetime.now(UTC)
        draft = Mesocycle(
            id=UUID(int=0),
            athlete_id=auth.athlete_id,
            name=name,
            goal=goal,
            duration_weeks=duration_weeks,
            status=MesocycleStatus.DRAFT,
            progression_criteria=progression_criteria,
            deload_criteria=deload_criteria,
            notes=notes,
            planned_sessions=planned_sessions,
            created_at=now,
            updated_at=now,
        )
        draft.validate()
        return await self._repo.create_mesocycle(
            athlete_id=auth.athlete_id,
            name=draft.name,
            goal=draft.goal,
            duration_weeks=draft.duration_weeks,
            status=MesocycleStatus.DRAFT,
            progression_criteria=draft.progression_criteria,
            deload_criteria=draft.deload_criteria,
            notes=draft.notes,
            planned_sessions=draft.planned_sessions,
        )


def _build_default_sessions_for_profile(
    *,
    days_per_week: int,
    equipment: tuple[str, ...],
    active_injuries: tuple[InjuryRestriction, ...],
) -> tuple[PlannedSession, ...]:
    """Deterministic hypertrophy split tailored to days/week, equipment, and active injuries."""
    inj_text = " ".join(f"{i.body_part} {i.description}".lower() for i in active_injuries)
    has_shoulder_issue = any(k in inj_text for k in ("hombro", "manguito", "shoulder"))
    has_knee_issue = any(k in inj_text for k in ("rodilla", "knee", "rotula"))
    has_lower_back_issue = any(k in inj_text for k in ("lumbar", "espalda baja", "lower back"))
    eq_lower = " ".join(e.lower() for e in equipment)
    has_cables = "polea" in eq_lower or "cable" in eq_lower or not equipment

    press_ex = PlannedExercise(
        exercise_name="Press inclinado mancuernas neutro"
        if has_shoulder_issue
        else "Press inclinado mancuernas",
        primary_muscle_group="pecho",
        secondary_muscle_groups=("hombros", "triceps"),
        target_sets=3,
        rep_range_min=8,
        rep_range_max=12,
        target_rir=2.0,
        notes="Agarre neutro y rango cómodo" if has_shoulder_issue else None,
    )
    row_ex = PlannedExercise(
        exercise_name="Remo con pecho apoyado"
        if has_lower_back_issue
        else "Remo en polea baja"
        if has_cables
        else "Remo con mancuerna",
        primary_muscle_group="espalda",
        secondary_muscle_groups=("biceps",),
        target_sets=3,
        rep_range_min=8,
        rep_range_max=12,
        target_rir=2.0,
    )
    lat_ex = PlannedExercise(
        exercise_name="Jalón al pecho en polea" if has_cables else "Dominadas asistidas",
        primary_muscle_group="espalda",
        secondary_muscle_groups=("biceps",),
        target_sets=3,
        rep_range_min=8,
        rep_range_max=12,
        target_rir=2.0,
    )
    delts_ex = PlannedExercise(
        exercise_name="Elevaciones laterales en polea"
        if has_cables
        else "Elevaciones laterales mancuernas",
        primary_muscle_group="hombros",
        secondary_muscle_groups=(),
        target_sets=3,
        rep_range_min=12,
        rep_range_max=15,
        target_rir=1.0,
        notes="Evitar sobrecarga vertical por molestia de hombro" if has_shoulder_issue else None,
    )
    quad_ex = PlannedExercise(
        exercise_name="Prensa inclinada rango controlado"
        if has_knee_issue
        else "Sentadilla hack o prensa",
        primary_muscle_group="cuadriceps",
        secondary_muscle_groups=("gluteos",),
        target_sets=3,
        rep_range_min=8,
        rep_range_max=12,
        target_rir=2.0,
    )
    ham_ex = PlannedExercise(
        exercise_name="Curl femoral sentado"
        if has_lower_back_issue
        else "Peso muerto rumano mancuernas",
        primary_muscle_group="isquios",
        secondary_muscle_groups=("gluteos",),
        target_sets=3,
        rep_range_min=8,
        rep_range_max=12,
        target_rir=2.0,
    )
    arm_biceps = PlannedExercise(
        exercise_name="Curl bíceps inclinado mancuernas",
        primary_muscle_group="biceps",
        secondary_muscle_groups=(),
        target_sets=3,
        rep_range_min=10,
        rep_range_max=15,
        target_rir=1.0,
    )
    arm_triceps = PlannedExercise(
        exercise_name="Extensión tríceps en polea" if has_cables else "Press francés mancuernas",
        primary_muscle_group="triceps",
        secondary_muscle_groups=(),
        target_sets=3,
        rep_range_min=10,
        rep_range_max=15,
        target_rir=1.0,
    )
    calves_ex = PlannedExercise(
        exercise_name="Elevación de talones de pie",
        primary_muscle_group="gemelos",
        secondary_muscle_groups=(),
        target_sets=3,
        rep_range_min=10,
        rep_range_max=15,
        target_rir=1.0,
    )

    templates: list[tuple[str, tuple[PlannedExercise, ...]]] = [
        ("Torso A", (press_ex, row_ex, delts_ex, arm_biceps)),
        ("Pierna A", (quad_ex, ham_ex, calves_ex)),
        ("Torso B", (lat_ex, press_ex, delts_ex, arm_triceps)),
        ("Pierna B", (ham_ex, quad_ex, calves_ex)),
        ("Torso C (Enfoque Brazos y Espalda)", (row_ex, lat_ex, arm_biceps, arm_triceps)),
        ("Pierna C (Glúteo e Isquios)", (ham_ex, quad_ex, calves_ex)),
        ("Full Body Complementario", (press_ex, row_ex, quad_ex)),
    ]

    count = max(2, min(days_per_week, 6))
    return tuple(
        PlannedSession(
            id=None,
            day_order=idx + 1,
            name=templates[idx][0],
            exercises=templates[idx][1],
        )
        for idx in range(count)
    )


_MESOCYCLE_DRAFT_JSON_SCHEMA: dict[str, object] = {
    "type": "object",
    "title": "MesocycleDraft",
    "required": [
        "name",
        "goal",
        "duration_weeks",
        "progression_criteria",
        "deload_criteria",
        "planned_sessions",
    ],
    "properties": {
        "name": {"type": "string"},
        "goal": {"type": "string"},
        "duration_weeks": {"type": "integer", "minimum": 2, "maximum": 16},
        "progression_criteria": {"type": "string"},
        "deload_criteria": {"type": "string"},
        "planned_sessions": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["day_order", "name", "exercises"],
                "properties": {
                    "day_order": {"type": "integer", "minimum": 1, "maximum": 14},
                    "name": {"type": "string"},
                    "exercises": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "required": [
                                "exercise_name",
                                "primary_muscle_group",
                                "target_sets",
                                "rep_range_min",
                                "rep_range_max",
                            ],
                            "properties": {
                                "exercise_name": {"type": "string"},
                                "primary_muscle_group": {"type": "string"},
                                "secondary_muscle_groups": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                                "target_sets": {"type": "integer", "minimum": 1, "maximum": 20},
                                "rep_range_min": {"type": "integer", "minimum": 1, "maximum": 100},
                                "rep_range_max": {"type": "integer", "minimum": 1, "maximum": 100},
                                "target_rir": {"type": ["number", "null"]},
                                "target_rpe": {"type": ["number", "null"]},
                                "notes": {"type": ["string", "null"]},
                            },
                        },
                    },
                },
            },
        },
    },
}


def _parse_llm_planned_sessions(raw_sessions: object) -> tuple[PlannedSession, ...]:
    """Parse and validate LLM-generated planned sessions; return empty tuple on any invalid item."""
    if not isinstance(raw_sessions, list) or not raw_sessions:
        return ()
    try:
        sessions_buf: list[PlannedSession] = []
        for idx, ps_raw in enumerate(raw_sessions, start=1):
            if not isinstance(ps_raw, dict):
                raise TypeError("Planned session must be an object")
            exs_raw = ps_raw.get("exercises")
            if not isinstance(exs_raw, list) or not exs_raw:
                raise ValueError("Planned session must include exercises")
            exs = []
            for ex in exs_raw:
                if not isinstance(ex, dict):
                    raise TypeError("Exercise must be an object")
                exs.append(PlannedExercise.from_dict(ex))
            session_obj = PlannedSession(
                id=None,
                day_order=int(ps_raw.get("day_order", idx)),
                name=str(ps_raw.get("name", f"Sesión {idx}")).strip(),
                exercises=tuple(exs),
            )
            session_obj.validate()
            sessions_buf.append(session_obj)
        return tuple(sessions_buf)
    except (TrainingValidationError, ValueError, TypeError, KeyError):
        return ()


class DraftMesocycleWithCoachUseCase:
    """Generates a personalized draft Mesocycle using Living Profile, active injuries, and KB."""

    def __init__(
        self,
        *,
        training_repo: TrainingRepositoryPort,
        profile_repo: ProfileRepositoryPort,
        knowledge_repo: KnowledgeRepositoryPort,
        ai_provider: AIProviderPort,
    ) -> None:
        self._training_repo = training_repo
        self._profile_repo = profile_repo
        self._knowledge_repo = knowledge_repo
        self._ai_provider = ai_provider

    async def execute(
        self,
        *,
        auth: AuthContext,
        focus_notes: str | None = None,
        duration_weeks: int | None = None,
    ) -> CoachMesocycleDraftResult:
        profile = await self._profile_repo.get_profile(auth.athlete_id)
        if profile is None:
            profile = LivingProfile.empty(auth.athlete_id)
        active_injuries = tuple(
            await self._profile_repo.list_injuries(auth.athlete_id, status=InjuryStatus.ACTIVE)
        )

        # Query Base de Conocimiento for hypertrophy volume / RIR / progression evidence
        kb_query = "hipertrofia volumen semanal series efectivas RIR progresion descarga"
        if focus_notes:
            kb_query = f"{kb_query} {focus_notes.strip()}"
        embed = (await self._ai_provider.embed_texts([kb_query]))[0]
        raw_hits = await self._knowledge_repo.hybrid_search(
            query=kb_query,
            query_embedding=embed.vector,
            query_embedding_model=embed.model_id,
            limit=3,
        )
        kb_hits = [h for h in raw_hits if h.card.validity_status != ValidityStatus.ARCHIVED]
        cited_ids = tuple(h.card.id for h in kb_hits)

        days = profile.training_days_per_week or 4
        target_weeks = duration_weeks if duration_weeks is not None else 5
        goal_map = {
            PrimaryGoal.HYPERTROPHY: "Hipertrofia muscular",
            PrimaryGoal.STRENGTH: "Fuerza e hipertrofia",
            PrimaryGoal.FAT_LOSS: "Retención de masa muscular en definición",
            PrimaryGoal.BODY_RECOMPOSITION: "Recomposición corporal",
            PrimaryGoal.MAINTENANCE: "Mantenimiento de fuerza y masa muscular",
        }
        goal_label = (
            goal_map.get(profile.primary_goal, "Hipertrofia muscular")
            if profile.primary_goal
            else "Hipertrofia muscular"
        )

        inj_summary = (
            "; ".join(
                f"{i.body_part} ({i.severity.value}): {i.description}" for i in active_injuries
            )
            if active_injuries
            else "Ninguna"
        )
        kb_summary = (
            "\n".join(f"- {h.card.title} ({h.card.evidence_level.value})" for h in kb_hits)
            if kb_hits
            else "Sin fichas específicas aprobadas; aplicar consenso general de hipertrofia."
        )

        eq_text = ", ".join(profile.equipment) if profile.equipment else "gimnasio estándar"
        system_prompt = (
            "Eres el Coach de Fitness Coach. Diseña un Mesociclo personalizado en español "
            "respetando el Perfil Vivo, equipamiento, días disponibles y lesiones activas.\n"
            f"PERFIL VIVO: objetivo={goal_label}, días/semana={days}, "
            f"duración sesión={profile.session_duration_min or 60} min, "
            f"equipo={eq_text}.\n"
            f"LESIONES ACTIVAS: {inj_summary}\n"
            f"EVIDENCIA CONSULTADA:\n{kb_summary}"
        )
        user_prompt = (
            f"Genera un borrador de Mesociclo de {target_weeks} semanas para {days} días/semana. "
            f"Notas adicionales del Atleta: {(focus_notes or 'Sin notas adicionales').strip()}."
        )

        llm_resp = await self._ai_provider.generate(
            tier=ModelTier.REASONING,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=_MESOCYCLE_DRAFT_JSON_SCHEMA,
        )

        # Parse structured output if LLM returned a valid mesocycle; else build tailored split
        data = llm_resp.structured_data if isinstance(llm_resp.structured_data, dict) else {}
        parsed_sessions = _parse_llm_planned_sessions(data.get("planned_sessions"))
        if not parsed_sessions:
            parsed_sessions = _build_default_sessions_for_profile(
                days_per_week=days,
                equipment=profile.equipment,
                active_injuries=active_injuries,
            )

        default_name = f"Mesociclo {goal_label} ({days} días)"
        raw_name = data.get("name")
        name = raw_name.strip() if isinstance(raw_name, str) and raw_name.strip() else default_name
        raw_goal = data.get("goal")
        goal = raw_goal.strip() if isinstance(raw_goal, str) and raw_goal.strip() else goal_label

        raw_weeks = data.get("duration_weeks")
        try:
            if isinstance(raw_weeks, bool) or raw_weeks is None:
                resolved_weeks = target_weeks
            else:
                resolved_weeks = int(raw_weeks)
        except (ValueError, TypeError):
            resolved_weeks = target_weeks
        resolved_weeks = max(2, min(resolved_weeks, 16))

        default_progression = (
            "Doble progresión: al completar el techo de repeticiones con RIR objetivo "
            "en todas las series, subir 2.5–5% la carga."
        )
        raw_prog = data.get("progression_criteria")
        progression = (
            raw_prog.strip()
            if isinstance(raw_prog, str) and raw_prog.strip()
            else default_progression
        )
        default_deload = (
            f"Semana {resolved_weeks} o ante caída de rendimiento en ≥2 ejercicios / "
            "fatiga persistente: reducir series al 50–60% manteniendo RIR 3–4."
        )
        raw_deload = data.get("deload_criteria")
        deload = (
            raw_deload.strip()
            if isinstance(raw_deload, str) and raw_deload.strip()
            else default_deload
        )
        notes = focus_notes.strip() if focus_notes and focus_notes.strip() else None
        if active_injuries:
            inj_note = f"Adaptado a restricciones activas: {inj_summary}."
            notes = f"{notes} {inj_note}".strip() if notes else inj_note

        now = datetime.now(UTC)
        draft = Mesocycle(
            id=UUID(int=0),
            athlete_id=auth.athlete_id,
            name=name,
            goal=goal,
            duration_weeks=resolved_weeks,
            status=MesocycleStatus.DRAFT,
            progression_criteria=progression,
            deload_criteria=deload,
            notes=notes,
            planned_sessions=parsed_sessions,
            created_at=now,
            updated_at=now,
        )
        try:
            draft.validate()
        except TrainingValidationError:
            safe_weeks = max(2, min(target_weeks, 16))
            draft = Mesocycle(
                id=UUID(int=0),
                athlete_id=auth.athlete_id,
                name=default_name,
                goal=goal_label,
                duration_weeks=safe_weeks,
                status=MesocycleStatus.DRAFT,
                progression_criteria=default_progression,
                deload_criteria=default_deload,
                notes=notes,
                planned_sessions=_build_default_sessions_for_profile(
                    days_per_week=days,
                    equipment=profile.equipment,
                    active_injuries=active_injuries,
                ),
                created_at=now,
                updated_at=now,
            )
            draft.validate()

        created = await self._training_repo.create_mesocycle(
            athlete_id=auth.athlete_id,
            name=draft.name,
            goal=draft.goal,
            duration_weeks=draft.duration_weeks,
            status=MesocycleStatus.DRAFT,
            progression_criteria=draft.progression_criteria,
            deload_criteria=draft.deload_criteria,
            notes=draft.notes,
            planned_sessions=draft.planned_sessions,
        )

        rationale = llm_resp.text.strip() or (
            f"Borrador generado para {days} días/semana ({resolved_weeks} semanas) "
            "adaptado a tu Perfil Vivo."
        )
        return CoachMesocycleDraftResult(
            mesocycle=created,
            cited_card_ids=cited_ids,
            coach_rationale_es=rationale,
        )


class UpdateMesocycleUseCase:
    def __init__(self, repo: TrainingRepositoryPort) -> None:
        self._repo = repo

    async def execute(
        self,
        *,
        auth: AuthContext,
        mesocycle_id: UUID,
        name: str | None = None,
        goal: str | None = None,
        duration_weeks: int | None = None,
        progression_criteria: str | None = None,
        deload_criteria: str | None = None,
        notes: str | None = None,
        planned_sessions: tuple[PlannedSession, ...] | None = None,
    ) -> Mesocycle:
        existing = await self._repo.get_mesocycle(
            athlete_id=auth.athlete_id, mesocycle_id=mesocycle_id
        )
        if existing is None:
            raise MesocycleNotFoundError("No se encontró el Mesociclo solicitado.")

        candidate = Mesocycle(
            id=existing.id,
            athlete_id=existing.athlete_id,
            name=name if name is not None else existing.name,
            goal=goal if goal is not None else existing.goal,
            duration_weeks=duration_weeks
            if duration_weeks is not None
            else existing.duration_weeks,
            status=existing.status,
            progression_criteria=(
                progression_criteria
                if progression_criteria is not None
                else existing.progression_criteria
            ),
            deload_criteria=(
                deload_criteria if deload_criteria is not None else existing.deload_criteria
            ),
            notes=notes if notes is not None else existing.notes,
            planned_sessions=(
                planned_sessions if planned_sessions is not None else existing.planned_sessions
            ),
            created_at=existing.created_at,
            updated_at=existing.updated_at,
            activated_at=existing.activated_at,
            completed_at=existing.completed_at,
        )
        candidate.validate()

        updated = await self._repo.update_mesocycle(
            athlete_id=auth.athlete_id,
            mesocycle_id=mesocycle_id,
            name=candidate.name,
            goal=candidate.goal,
            duration_weeks=candidate.duration_weeks,
            progression_criteria=candidate.progression_criteria,
            deload_criteria=candidate.deload_criteria,
            notes=candidate.notes,
            planned_sessions=candidate.planned_sessions,
        )
        assert updated is not None
        return updated


class ActivateMesocycleUseCase:
    """Enforces single-active-Mesocycle invariant with explicit transition confirmation."""

    def __init__(self, repo: TrainingRepositoryPort) -> None:
        self._repo = repo

    async def execute(
        self,
        *,
        auth: AuthContext,
        mesocycle_id: UUID,
        confirm_transition_status: PriorMesocycleAction | None = None,
    ) -> MesocycleActivationResult:
        target = await self._repo.get_mesocycle(
            athlete_id=auth.athlete_id, mesocycle_id=mesocycle_id
        )
        if target is None:
            raise MesocycleNotFoundError("No se encontró el Mesociclo solicitado.")

        if target.status == MesocycleStatus.ACTIVE:
            return MesocycleActivationResult(mesocycle=target, previous_mesocycle=None)

        if target.status in (MesocycleStatus.COMPLETED, MesocycleStatus.ARCHIVED):
            raise InvalidMesocycleTransitionError(
                "No se puede activar un Mesociclo que ya fue completado o archivado."
            )

        now = datetime.now(UTC)
        current = await self._repo.get_current_mesocycle(athlete_id=auth.athlete_id)
        previous_transitioned: Mesocycle | None = None

        if current is not None and current.id != target.id:
            if confirm_transition_status is None:
                raise ActiveMesocycleConflictError(current)
            next_prior_status = MesocycleStatus(confirm_transition_status.value)
            previous_transitioned = await self._repo.set_mesocycle_status(
                athlete_id=auth.athlete_id,
                mesocycle_id=current.id,
                status=next_prior_status,
                completed_at=now,
            )

        activated = await self._repo.set_mesocycle_status(
            athlete_id=auth.athlete_id,
            mesocycle_id=target.id,
            status=MesocycleStatus.ACTIVE,
            activated_at=target.activated_at or now,
        )
        assert activated is not None
        return MesocycleActivationResult(
            mesocycle=activated,
            previous_mesocycle=previous_transitioned,
        )


class TransitionMesocycleStatusUseCase:
    """Transitions a Mesocycle status (e.g. active -> deload, deload -> completed, etc.)."""

    def __init__(self, repo: TrainingRepositoryPort) -> None:
        self._repo = repo

    async def execute(
        self,
        *,
        auth: AuthContext,
        mesocycle_id: UUID,
        target_status: MesocycleStatus,
    ) -> Mesocycle:
        target = await self._repo.get_mesocycle(
            athlete_id=auth.athlete_id, mesocycle_id=mesocycle_id
        )
        if target is None:
            raise MesocycleNotFoundError("No se encontró el Mesociclo solicitado.")
        if target.status == target_status:
            return target
        if not target.can_transition_to(target_status):
            raise InvalidMesocycleTransitionError(
                f"No se permite pasar el Mesociclo de '{target.status.value}' "
                f"a '{target_status.value}'."
            )
        if target_status == MesocycleStatus.ACTIVE:
            current = await self._repo.get_current_mesocycle(athlete_id=auth.athlete_id)
            if current is not None and current.id != target.id:
                raise ActiveMesocycleConflictError(current)

        now = datetime.now(UTC)
        completed_at = (
            now if target_status in (MesocycleStatus.COMPLETED, MesocycleStatus.ARCHIVED) else None
        )
        updated = await self._repo.set_mesocycle_status(
            athlete_id=auth.athlete_id,
            mesocycle_id=target.id,
            status=target_status,
            completed_at=completed_at,
        )
        assert updated is not None
        return updated


class GetTodaySessionUseCase:
    """Returns today's planned session from the active Mesocycle plus previous marks."""

    def __init__(self, repo: TrainingRepositoryPort) -> None:
        self._repo = repo

    async def execute(
        self,
        *,
        auth: AuthContext,
        planned_session_id: UUID | None = None,
    ) -> TodaySessionView:
        current = await self._repo.get_current_mesocycle(athlete_id=auth.athlete_id)
        if current is None or not current.planned_sessions:
            return TodaySessionView(
                active_mesocycle=current,
                planned_session=None,
                exercises=(),
                completed_sessions_in_mesocycle=0,
            )

        meso_sessions = await self._repo.list_training_sessions(
            athlete_id=auth.athlete_id, mesocycle_id=current.id, limit=200
        )
        selected: PlannedSession | None = None
        if planned_session_id is not None:
            for ps in current.planned_sessions:
                if ps.id == planned_session_id:
                    selected = ps
                    break
        if selected is None:
            # Rotate cleanly based on completed sessions count in this mesocycle
            idx = len(meso_sessions) % len(current.planned_sessions)
            selected = current.planned_sessions[idx]

        all_recent_sessions = await self._repo.list_training_sessions(
            athlete_id=auth.athlete_id, limit=120
        )
        exercises_view = tuple(
            TodaySessionExerciseView(
                planned=ex,
                previous_mark=build_previous_exercise_mark(
                    exercise_name=ex.exercise_name,
                    historical_sessions=all_recent_sessions,
                ),
            )
            for ex in selected.exercises
        )

        return TodaySessionView(
            active_mesocycle=current,
            planned_session=selected,
            exercises=exercises_view,
            completed_sessions_in_mesocycle=len(meso_sessions),
        )


class ListTrainingSessionsUseCase:
    def __init__(self, repo: TrainingRepositoryPort) -> None:
        self._repo = repo

    async def execute(
        self,
        *,
        auth: AuthContext,
        mesocycle_id: UUID | None = None,
        limit: int = 50,
    ) -> list[TrainingSession]:
        return await self._repo.list_training_sessions(
            athlete_id=auth.athlete_id, mesocycle_id=mesocycle_id, limit=limit
        )


def _ensure_planned_session_belongs_to_mesocycle(
    mesocycle: Mesocycle | None, planned_session_id: UUID | None
) -> None:
    """Validate that planned_session_id belongs to the resolved Mesocycle."""
    if planned_session_id is None:
        return
    if mesocycle is None or planned_session_id not in {
        ps.id for ps in mesocycle.planned_sessions
    }:
        raise TrainingValidationError(
            "La sesión planificada indicada no pertenece al Mesociclo seleccionado."
        )


class CreateTrainingSessionUseCase:
    def __init__(self, repo: TrainingRepositoryPort) -> None:
        self._repo = repo

    async def execute(
        self,
        *,
        auth: AuthContext,
        session_date: date,
        name: str,
        sets: tuple[SessionSet, ...],
        mesocycle_id: UUID | None = None,
        planned_session_id: UUID | None = None,
        origin: SessionOrigin = SessionOrigin.MANUAL_FORM,
        fatigue_notes: str | None = None,
    ) -> TrainingSession:
        meso: Mesocycle | None = None
        resolved_mesocycle_id = mesocycle_id
        if resolved_mesocycle_id is not None:
            meso = await self._repo.get_mesocycle(
                athlete_id=auth.athlete_id, mesocycle_id=resolved_mesocycle_id
            )
            if meso is None:
                raise MesocycleNotFoundError("El Mesociclo indicado no pertenece a tu cuenta.")
        else:
            current = await self._repo.get_current_mesocycle(athlete_id=auth.athlete_id)
            if current is not None:
                meso = current
                resolved_mesocycle_id = current.id

        _ensure_planned_session_belongs_to_mesocycle(meso, planned_session_id)

        now = datetime.now(UTC)
        candidate = TrainingSession(
            id=UUID(int=0),
            athlete_id=auth.athlete_id,
            mesocycle_id=resolved_mesocycle_id,
            planned_session_id=planned_session_id,
            session_date=session_date,
            name=name,
            origin=origin,
            fatigue_notes=fatigue_notes,
            sets=sets,
            created_at=now,
            updated_at=now,
        )
        candidate.validate()

        return await self._repo.create_training_session(
            athlete_id=auth.athlete_id,
            mesocycle_id=candidate.mesocycle_id,
            planned_session_id=candidate.planned_session_id,
            session_date=candidate.session_date,
            name=candidate.name,
            origin=candidate.origin,
            fatigue_notes=candidate.fatigue_notes,
            sets=candidate.sets,
        )


class UpdateTrainingSessionUseCase:
    def __init__(self, repo: TrainingRepositoryPort) -> None:
        self._repo = repo

    async def execute(
        self,
        *,
        auth: AuthContext,
        session_id: UUID,
        session_date: date,
        name: str,
        sets: tuple[SessionSet, ...],
        mesocycle_id: UUID | None = None,
        planned_session_id: UUID | None = None,
        fatigue_notes: str | None = None,
    ) -> TrainingSession:
        existing = await self._repo.get_training_session(
            athlete_id=auth.athlete_id, session_id=session_id
        )
        if existing is None:
            raise TrainingSessionNotFoundError(
                "No se encontró la Sesión de Entrenamiento solicitada."
            )

        resolved_meso_id = mesocycle_id if mesocycle_id is not None else existing.mesocycle_id
        meso: Mesocycle | None = None
        if resolved_meso_id is not None:
            meso = await self._repo.get_mesocycle(
                athlete_id=auth.athlete_id, mesocycle_id=resolved_meso_id
            )
            if meso is None:
                raise MesocycleNotFoundError("El Mesociclo indicado no pertenece a tu cuenta.")

        resolved_planned_session_id = (
            planned_session_id
            if planned_session_id is not None
            else existing.planned_session_id
        )
        _ensure_planned_session_belongs_to_mesocycle(meso, resolved_planned_session_id)

        candidate = TrainingSession(
            id=existing.id,
            athlete_id=existing.athlete_id,
            mesocycle_id=resolved_meso_id,
            planned_session_id=resolved_planned_session_id,
            session_date=session_date,
            name=name,
            origin=existing.origin,
            fatigue_notes=fatigue_notes,
            sets=sets,
            created_at=existing.created_at,
            updated_at=existing.updated_at,
        )
        candidate.validate()

        updated = await self._repo.update_training_session(
            athlete_id=auth.athlete_id,
            session_id=session_id,
            mesocycle_id=candidate.mesocycle_id,
            planned_session_id=candidate.planned_session_id,
            session_date=candidate.session_date,
            name=candidate.name,
            fatigue_notes=candidate.fatigue_notes,
            sets=candidate.sets,
        )
        assert updated is not None
        return updated


class DeleteTrainingSessionUseCase:
    def __init__(self, repo: TrainingRepositoryPort) -> None:
        self._repo = repo

    async def execute(self, *, auth: AuthContext, session_id: UUID) -> None:
        deleted = await self._repo.delete_training_session(
            athlete_id=auth.athlete_id, session_id=session_id
        )
        if not deleted:
            raise TrainingSessionNotFoundError(
                "No se encontró la Sesión de Entrenamiento solicitada."
            )


class GetWeeklyVolumeSummaryUseCase:
    """Calculates weekly effective volume per muscle group + trends + deload assessment."""

    def __init__(self, repo: TrainingRepositoryPort) -> None:
        self._repo = repo

    async def execute(
        self,
        *,
        auth: AuthContext,
        week_start: date | None = None,
    ) -> WeeklyVolumeSummary:
        ref = week_start or date.today()
        w_start, w_end = get_iso_week_bounds(ref)
        current = await self._repo.get_current_mesocycle(athlete_id=auth.athlete_id)

        week_sessions = await self._repo.list_training_sessions(
            athlete_id=auth.athlete_id,
            date_from=w_start,
            date_to=w_end,
            limit=50,
        )
        recent_sessions = await self._repo.list_training_sessions(
            athlete_id=auth.athlete_id,
            date_from=w_start - timedelta(days=28),
            date_to=w_end,
            limit=100,
        )

        by_muscle = calculate_effective_weekly_volume(
            week_sessions=week_sessions,
            active_mesocycle=current,
        )
        deload, trends = evaluate_deload_and_trends(
            active_mesocycle=current,
            recent_sessions=recent_sessions,
            reference_date=w_end if week_start is not None else date.today(),
        )
        total_effective = round(sum(m.effective_sets for m in by_muscle), 2)

        return WeeklyVolumeSummary(
            week_start=w_start,
            week_end=w_end,
            active_mesocycle_id=current.id if current else None,
            active_mesocycle_name=current.name if current else None,
            total_sessions=len(week_sessions),
            total_effective_sets=total_effective,
            by_muscle_group=by_muscle,
            exercise_trends=trends,
            deload_assessment=deload,
        )


class TrainingCoachContextProvider:
    """Pluggable training context provider for CoachContextAssembler."""

    def __init__(self, repo: TrainingRepositoryPort) -> None:
        self._repo = repo

    async def get_context_block(self, athlete_id: UUID) -> str | None:
        current = await self._repo.get_current_mesocycle(athlete_id=athlete_id)
        recent_sessions = await self._repo.list_training_sessions(athlete_id=athlete_id, limit=12)
        if current is None and not recent_sessions:
            return None

        lines: list[str] = ["CONTEXTO DE ENTRENAMIENTO ACTIVO DEL ATLETA:"]
        if current is not None:
            sessions_names = ", ".join(ps.name for ps in current.planned_sessions)
            lines.append(
                f"- Mesociclo actual: '{current.name}' (estado: {current.status.value}, "
                f"objetivo: {current.goal}, duración: {current.duration_weeks} semanas)."
            )
            lines.append(f"- División planificada: {sessions_names}")
            if current.deload_criteria:
                lines.append(f"- Criterio de descarga: {current.deload_criteria}")
        else:
            lines.append("- Mesociclo actual: Ningún Mesociclo activo actualmente.")

        w_start, w_end = get_iso_week_bounds(date.today())
        week_sessions = [s for s in recent_sessions if w_start <= s.session_date <= w_end]
        by_muscle = calculate_effective_weekly_volume(
            week_sessions=week_sessions,
            active_mesocycle=current,
        )
        if by_muscle:
            vol_str = ", ".join(
                f"{m.muscle_group}: {m.effective_sets} series efectivas "
                f"(directas={m.direct_sets}, secundarias={m.secondary_sets})"
                for m in by_muscle[:8]
            )
            lines.append(
                f"- Volumen semanal efectivo ({w_start.isoformat()} a {w_end.isoformat()}): "
                f"{vol_str}"
            )

        if recent_sessions:
            lines.append("- Últimas Sesiones de Entrenamiento:")
            for s in recent_sessions[:5]:
                rirs = [st.rir for st in s.sets if st.rir is not None]
                avg_rir = f", RIR medio {round(sum(rirs) / len(rirs), 1)}" if rirs else ""
                note_txt = f" | Fatiga/notas: {s.fatigue_notes}" if s.fatigue_notes else ""
                lines.append(
                    f"  * {s.session_date.isoformat()} — {s.name} "
                    f"({len(s.sets)} series{avg_rir}){note_txt}"
                )

        deload, trends = evaluate_deload_and_trends(
            active_mesocycle=current,
            recent_sessions=recent_sessions,
            reference_date=date.today(),
        )
        if trends:
            trend_str = ", ".join(
                f"{t.exercise_name}: {t.status.value} ({t.e1rm_delta_pct:+.1f}% e1RM)"
                for t in trends[:6]
            )
            lines.append(f"- Tendencia de rendimiento: {trend_str}")

        lines.append(
            f"- Evaluación de descarga (deload): {deload.status.value} "
            f"(recomendada={'sí' if deload.recommended else 'no'})."
        )
        if deload.reasons_es:
            lines.append("  Motivos: " + " | ".join(deload.reasons_es))

        return "\n".join(lines)
