"""Application use cases for Nutrition Phases, Weekly Check-ins, and Coach context (#8)."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, date, datetime
from uuid import UUID

from fitness_coach.application.ports.ai_provider import AIProviderPort, ModelTier
from fitness_coach.application.ports.repositories.knowledge import KnowledgeRepositoryPort
from fitness_coach.application.ports.repositories.nutrition import NutritionRepositoryPort
from fitness_coach.application.ports.repositories.profile import ProfileRepositoryPort
from fitness_coach.domain.identity import AuthContext
from fitness_coach.domain.knowledge import ValidityStatus
from fitness_coach.domain.nutrition import (
    PHASE_TYPE_LABELS_ES,
    TREND_STATUS_LABELS_ES,
    AdjustmentProposalStatus,
    CheckInNotFoundError,
    InvalidAdjustmentStateError,
    InvalidNutritionPhaseStateError,
    NutritionPhase,
    NutritionPhaseNotFoundError,
    NutritionPhaseStatus,
    NutritionPhaseType,
    NutritionValidationError,
    WeeklyCheckIn,
    build_deterministic_adjustment,
    compute_weight_trend,
    resolve_average_weight,
    validate_checkin_inputs,
    validate_phase_targets,
)
from fitness_coach.domain.profile import LivingProfile


class ListNutritionPhasesUseCase:
    def __init__(self, repo: NutritionRepositoryPort) -> None:
        self._repo = repo

    async def execute(self, *, auth: AuthContext) -> list[NutritionPhase]:
        return await self._repo.list_phases(auth.athlete_id)


class CreateNutritionPhaseUseCase:
    """Creates a new active NutritionPhase, closing any previous active phase cleanly."""

    def __init__(self, repo: NutritionRepositoryPort) -> None:
        self._repo = repo

    async def execute(
        self,
        *,
        auth: AuthContext,
        phase_type: NutritionPhaseType,
        start_date: date | None,
        target_calories: int,
        protein_g: int,
        fat_g: int,
        carbs_g: int,
        target_weekly_weight_change_kg: float,
        notes: str | None = None,
    ) -> NutritionPhase:
        validate_phase_targets(
            target_calories=target_calories,
            protein_g=protein_g,
            fat_g=fat_g,
            carbs_g=carbs_g,
            target_weekly_weight_change_kg=target_weekly_weight_change_kg,
        )
        effective_start = start_date or date.today()
        cleaned_notes = notes.strip() if notes and notes.strip() else None
        return await self._repo.create_active_phase(
            athlete_id=auth.athlete_id,
            phase_type=phase_type,
            start_date=effective_start,
            target_calories=target_calories,
            protein_g=protein_g,
            fat_g=fat_g,
            carbs_g=carbs_g,
            target_weekly_weight_change_kg=round(target_weekly_weight_change_kg, 3),
            notes=cleaned_notes,
        )


class UpdateNutritionPhaseUseCase:
    """Updates an active NutritionPhase owned by the Athlete."""

    def __init__(self, repo: NutritionRepositoryPort) -> None:
        self._repo = repo

    async def execute(
        self,
        *,
        auth: AuthContext,
        phase_id: UUID,
        phase_type: NutritionPhaseType | None = None,
        target_calories: int | None = None,
        protein_g: int | None = None,
        fat_g: int | None = None,
        carbs_g: int | None = None,
        target_weekly_weight_change_kg: float | None = None,
        notes: str | None = None,
        update_notes: bool = False,
    ) -> NutritionPhase:
        current = await self._repo.get_phase(auth.athlete_id, phase_id)
        if current is None:
            raise NutritionPhaseNotFoundError("No se encontró la Fase Nutricional solicitada.")
        if current.status != NutritionPhaseStatus.ACTIVE:
            raise InvalidNutritionPhaseStateError(
                "No se puede modificar una Fase Nutricional ya finalizada."
            )

        next_type = phase_type if phase_type is not None else current.phase_type
        next_calories = target_calories if target_calories is not None else current.target_calories
        next_protein = protein_g if protein_g is not None else current.protein_g
        next_fat = fat_g if fat_g is not None else current.fat_g
        next_carbs = carbs_g if carbs_g is not None else current.carbs_g
        next_rate = (
            target_weekly_weight_change_kg
            if target_weekly_weight_change_kg is not None
            else current.target_weekly_weight_change_kg
        )
        next_notes = (
            (notes.strip() if notes and notes.strip() else None)
            if update_notes
            else current.notes
        )

        validate_phase_targets(
            target_calories=next_calories,
            protein_g=next_protein,
            fat_g=next_fat,
            carbs_g=next_carbs,
            target_weekly_weight_change_kg=next_rate,
        )

        updated = await self._repo.update_phase(
            athlete_id=auth.athlete_id,
            phase_id=phase_id,
            phase_type=next_type,
            target_calories=next_calories,
            protein_g=next_protein,
            fat_g=next_fat,
            carbs_g=next_carbs,
            target_weekly_weight_change_kg=round(next_rate, 3),
            notes=next_notes,
        )
        assert updated is not None
        return updated


class CompleteNutritionPhaseUseCase:
    """Marks an active NutritionPhase as completed."""

    def __init__(self, repo: NutritionRepositoryPort) -> None:
        self._repo = repo

    async def execute(
        self,
        *,
        auth: AuthContext,
        phase_id: UUID,
        end_date: date | None = None,
    ) -> NutritionPhase:
        current = await self._repo.get_phase(auth.athlete_id, phase_id)
        if current is None:
            raise NutritionPhaseNotFoundError("No se encontró la Fase Nutricional solicitada.")
        if current.status != NutritionPhaseStatus.ACTIVE:
            raise InvalidNutritionPhaseStateError(
                "Esta Fase Nutricional ya se encuentra finalizada."
            )
        effective_end = end_date or date.today()
        if effective_end < current.start_date:
            raise NutritionValidationError(
                "La fecha de finalización no puede ser anterior a la fecha de inicio."
            )
        completed = await self._repo.complete_phase(
            athlete_id=auth.athlete_id,
            phase_id=phase_id,
            end_date=effective_end,
        )
        assert completed is not None
        return completed


class ListWeeklyCheckInsUseCase:
    def __init__(self, repo: NutritionRepositoryPort) -> None:
        self._repo = repo

    async def execute(self, *, auth: AuthContext, limit: int = 50) -> list[WeeklyCheckIn]:
        return await self._repo.list_checkins(auth.athlete_id, limit=limit)


class SubmitWeeklyCheckInUseCase:
    """Records a guided WeeklyCheckIn with idempotency protection, computes weight trend
    & TDEE delta, and produces Coach adjustment proposals without mutating the active phase.
    """

    def __init__(
        self,
        *,
        nutrition_repo: NutritionRepositoryPort,
        profile_repo: ProfileRepositoryPort,
        knowledge_repo: KnowledgeRepositoryPort,
        ai_provider: AIProviderPort,
    ) -> None:
        self._nutrition_repo = nutrition_repo
        self._profile_repo = profile_repo
        self._knowledge_repo = knowledge_repo
        self._ai_provider = ai_provider

    async def execute(
        self,
        *,
        auth: AuthContext,
        checkin_date: date | None,
        idempotency_key: str,
        average_weight_kg: float | None,
        daily_weights: Sequence[float] | None,
        body_measurements: dict[str, float] | None,
        adherence_score: int,
        sleep_quality: int,
        energy_level: int,
        hunger_level: int | None,
        recovery_score: int | None,
        perceived_fatigue: int,
        performance_notes: str | None,
    ) -> tuple[WeeklyCheckIn, bool]:
        cleaned_key = idempotency_key.strip()
        cleaned_measurements = validate_checkin_inputs(
            idempotency_key=cleaned_key,
            adherence_score=adherence_score,
            sleep_quality=sleep_quality,
            energy_level=energy_level,
            perceived_fatigue=perceived_fatigue,
            hunger_level=hunger_level,
            recovery_score=recovery_score,
            body_measurements=body_measurements,
        )
        avg_weight, cleaned_daily = resolve_average_weight(
            average_weight_kg=average_weight_kg,
            daily_weights=daily_weights,
        )

        # Idempotent double-submit protection: return existing Check-in without re-running AI
        existing = await self._nutrition_repo.get_checkin_by_idempotency_key(
            auth.athlete_id, cleaned_key
        )
        if existing is not None:
            return existing, False

        effective_date = checkin_date or date.today()
        active_phase = await self._nutrition_repo.get_active_phase(auth.athlete_id)
        prior_checkins = await self._nutrition_repo.list_checkins(auth.athlete_id, limit=8)

        trend = compute_weight_trend(
            current_weight_kg=avg_weight,
            current_date=effective_date,
            previous_checkins=prior_checkins,
            active_phase=active_phase,
        )

        proposal_dict, adjustment_status = build_deterministic_adjustment(
            active_phase=active_phase,
            trend=trend,
            adherence_score=adherence_score,
            sleep_quality=sleep_quality,
            energy_level=energy_level,
            perceived_fatigue=perceived_fatigue,
            hunger_level=hunger_level,
            recovery_score=recovery_score,
        )

        # Read Living Profile (allergies & food preferences) and approved Knowledge Base
        profile = await self._profile_repo.get_profile(auth.athlete_id)
        if profile is None:
            profile = LivingProfile.empty(auth.athlete_id)

        kb_query = self._build_kb_query(
            active_phase=active_phase,
            trend_status=trend.trend_status,
            perceived_fatigue=perceived_fatigue,
        )
        embed_res = (await self._ai_provider.embed_texts([kb_query]))[0]
        raw_hits = await self._knowledge_repo.hybrid_search(
            query=kb_query,
            query_embedding=embed_res.vector,
            query_embedding_model=embed_res.model_id,
            limit=3,
        )
        kb_hits = [h for h in raw_hits if h.card.validity_status != ValidityStatus.ARCHIVED]
        cited_card_ids = [str(h.card.id) for h in kb_hits]

        system_prompt = self._build_coach_system_prompt(
            profile=profile,
            active_phase=active_phase,
            kb_summaries=[
                f"- {h.card.title} ({h.card.evidence_level.value}): {h.card.curated_text_es[:280]}"
                for h in kb_hits
            ],
        )
        user_prompt = self._build_coach_user_prompt(
            checkin_date=effective_date,
            average_weight_kg=avg_weight,
            adherence_score=adherence_score,
            sleep_quality=sleep_quality,
            energy_level=energy_level,
            hunger_level=hunger_level,
            recovery_score=recovery_score,
            perceived_fatigue=perceived_fatigue,
            performance_notes=performance_notes,
            trend_status=trend.trend_status,
            actual_weekly=trend.actual_weekly_change_kg,
            target_weekly=trend.target_weekly_change_kg,
            tdee_delta=trend.estimated_tdee_delta_kcal,
            proposal_rationale=proposal_dict["rationale_es"],
        )

        llm_response = await self._ai_provider.generate(
            tier=ModelTier.REASONING,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )
        coach_summary = llm_response.text.strip() or proposal_dict["rationale_es"]

        respects_profile_notes: str | None = None
        if profile.allergies or profile.food_preferences:
            parts: list[str] = []
            if profile.allergies:
                parts.append(f"evitando {', '.join(profile.allergies)}")
            if profile.food_preferences:
                parts.append(f"priorizando {', '.join(profile.food_preferences)}")
            respects_profile_notes = "Recomendaciones adaptadas al Perfil Vivo: " + " y ".join(
                parts
            ) + "."

        coach_recommendations = {
            **proposal_dict,
            "summary_es": coach_summary,
            "cited_card_ids": cited_card_ids,
            "respects_profile_notes": respects_profile_notes,
        }

        cleaned_perf = (
            performance_notes.strip() if performance_notes and performance_notes.strip() else None
        )
        created = await self._nutrition_repo.create_checkin(
            athlete_id=auth.athlete_id,
            nutrition_phase_id=active_phase.id if active_phase else None,
            checkin_date=effective_date,
            idempotency_key=cleaned_key,
            average_weight_kg=avg_weight,
            daily_weights=cleaned_daily,
            body_measurements=cleaned_measurements,
            adherence_score=adherence_score,
            sleep_quality=sleep_quality,
            energy_level=energy_level,
            hunger_level=hunger_level,
            recovery_score=recovery_score,
            perceived_fatigue=perceived_fatigue,
            performance_notes=cleaned_perf,
            estimated_tdee_delta_kcal=trend.estimated_tdee_delta_kcal,
            weight_trend=trend,
            coach_recommendations=coach_recommendations,
            adjustment_status=adjustment_status,
        )
        return created, True

    @staticmethod
    def _build_kb_query(
        *,
        active_phase: NutritionPhase | None,
        trend_status: str,
        perceived_fatigue: int,
    ) -> str:
        terms = ["proteina", "nutricion"]
        if active_phase is not None:
            if active_phase.phase_type in (NutritionPhaseType.CUT, NutritionPhaseType.MINI_CUT):
                terms.extend(["deficit", "definicion", "fat loss"])
            elif active_phase.phase_type == NutritionPhaseType.BULK:
                terms.extend(["hipertrofia", "superavit"])
        if perceived_fatigue >= 7:
            terms.extend(["fatiga", "descarga", "deload", "recuperacion"])
        if "losing" in trend_status:
            terms.append("caloric deficit")
        return " ".join(terms)

    @staticmethod
    def _build_coach_system_prompt(
        *,
        profile: LivingProfile,
        active_phase: NutritionPhase | None,
        kb_summaries: list[str],
    ) -> str:
        allergies = ", ".join(profile.allergies) if profile.allergies else "ninguna"
        prefs = ", ".join(profile.food_preferences) if profile.food_preferences else "ninguna"
        phase_line = (
            f"{PHASE_TYPE_LABELS_ES[active_phase.phase_type]} "
            f"({active_phase.target_calories} kcal, P {active_phase.protein_g}g / "
            f"G {active_phase.fat_g}g / HC {active_phase.carbs_g}g, "
            f"ritmo objetivo {active_phase.target_weekly_weight_change_kg:+.2f} kg/sem)"
            if active_phase
            else "Sin Fase Nutricional activa"
        )
        kb_block = (
            "\n".join(kb_summaries)
            if kb_summaries
            else (
                "Sin Fichas de Evidencia específicas; usa conocimiento general "
                "basado en evidencia."
            )
        )
        return (
            "Eres el Coach de Fitness Coach analizando un Check-in semanal en español.\n"
            f"FASE NUTRICIONAL ACTIVA: {phase_line}\n"
            f"PERFIL VIVO — Alergias: {allergies} | Preferencias alimentarias: {prefs}\n"
            f"BASE DE CONOCIMIENTO APROBADA:\n{kb_block}\n"
            "Genera un análisis conciso, práctico y motivador explicando la tendencia de peso, "
            "el gasto energético estimado y el ajuste propuesto respetando alergias y preferencias."
        )

    @staticmethod
    def _build_coach_user_prompt(
        *,
        checkin_date: date,
        average_weight_kg: float,
        adherence_score: int,
        sleep_quality: int,
        energy_level: int,
        hunger_level: int | None,
        recovery_score: int | None,
        perceived_fatigue: int,
        performance_notes: str | None,
        trend_status: str,
        actual_weekly: float | None,
        target_weekly: float | None,
        tdee_delta: int | None,
        proposal_rationale: str,
    ) -> str:
        return (
            f"Check-in ({checkin_date.isoformat()}): peso medio {average_weight_kg} kg, "
            f"adherencia {adherence_score}/10, sueño {sleep_quality}/10, "
            f"energía {energy_level}/10, "
            f"hambre {hunger_level if hunger_level is not None else 'N/D'}/10, "
            f"recuperación {recovery_score if recovery_score is not None else 'N/D'}/10, "
            f"fatiga {perceived_fatigue}/10. "
            f"Notas de rendimiento: {performance_notes or 'sin notas'}. "
            f"Tendencia: {TREND_STATUS_LABELS_ES.get(trend_status, trend_status)} "
            f"(real: {actual_weekly} kg/sem vs objetivo: {target_weekly} kg/sem, "
            f"delta TDEE estimado: {tdee_delta} kcal/día). "
            f"Base de propuesta: {proposal_rationale}"
        )


class ApplyCheckInAdjustmentUseCase:
    """Explicitly confirms a Check-in adjustment proposal and applies it to the active phase."""

    def __init__(self, repo: NutritionRepositoryPort) -> None:
        self._repo = repo

    async def execute(
        self, *, auth: AuthContext, checkin_id: UUID
    ) -> tuple[WeeklyCheckIn, NutritionPhase]:
        checkin = await self._repo.get_checkin(auth.athlete_id, checkin_id)
        if checkin is None:
            raise CheckInNotFoundError("No se encontró el Check-in solicitado.")
        if checkin.adjustment_status != AdjustmentProposalStatus.PROPOSED:
            raise InvalidAdjustmentStateError(
                "Este Check-in no tiene una propuesta de ajuste pendiente de confirmación."
            )

        active_phase = await self._repo.get_active_phase(auth.athlete_id)
        if active_phase is None:
            raise NutritionPhaseNotFoundError(
                "No existe una Fase Nutricional activa a la que aplicar el ajuste."
            )

        rec = checkin.coach_recommendations
        next_calories = int(rec.get("proposed_target_calories") or active_phase.target_calories)
        next_protein = int(rec.get("proposed_protein_g") or active_phase.protein_g)
        next_fat = int(rec.get("proposed_fat_g") or active_phase.fat_g)
        next_carbs = int(rec.get("proposed_carbs_g") or active_phase.carbs_g)

        validate_phase_targets(
            target_calories=next_calories,
            protein_g=next_protein,
            fat_g=next_fat,
            carbs_g=next_carbs,
            target_weekly_weight_change_kg=active_phase.target_weekly_weight_change_kg,
        )

        updated_phase = await self._repo.update_phase(
            athlete_id=auth.athlete_id,
            phase_id=active_phase.id,
            phase_type=active_phase.phase_type,
            target_calories=next_calories,
            protein_g=next_protein,
            fat_g=next_fat,
            carbs_g=next_carbs,
            target_weekly_weight_change_kg=active_phase.target_weekly_weight_change_kg,
            notes=active_phase.notes,
        )
        assert updated_phase is not None

        resolved_checkin = await self._repo.resolve_checkin_adjustment(
            athlete_id=auth.athlete_id,
            checkin_id=checkin_id,
            status=AdjustmentProposalStatus.ACCEPTED,
            resolved_at=datetime.now(UTC),
        )
        assert resolved_checkin is not None
        return resolved_checkin, updated_phase


class DismissCheckInAdjustmentUseCase:
    """Dismisses a Check-in adjustment proposal without mutating the active NutritionPhase."""

    def __init__(self, repo: NutritionRepositoryPort) -> None:
        self._repo = repo

    async def execute(self, *, auth: AuthContext, checkin_id: UUID) -> WeeklyCheckIn:
        checkin = await self._repo.get_checkin(auth.athlete_id, checkin_id)
        if checkin is None:
            raise CheckInNotFoundError("No se encontró el Check-in solicitado.")
        if checkin.adjustment_status != AdjustmentProposalStatus.PROPOSED:
            raise InvalidAdjustmentStateError(
                "Este Check-in no tiene una propuesta de ajuste pendiente."
            )
        resolved = await self._repo.resolve_checkin_adjustment(
            athlete_id=auth.athlete_id,
            checkin_id=checkin_id,
            status=AdjustmentProposalStatus.DISMISSED,
            resolved_at=datetime.now(UTC),
        )
        assert resolved is not None
        return resolved


class NutritionCoachContextProvider:
    """Plugs active Fase Nutricional and recent Check-ins into CoachContextAssembler (#8)."""

    def __init__(self, repo: NutritionRepositoryPort) -> None:
        self._repo = repo

    async def get_context_block(self, athlete_id: UUID) -> str | None:
        active_phase = await self._repo.get_active_phase(athlete_id)
        recent_checkins = await self._repo.list_checkins(athlete_id, limit=4)

        if active_phase is None and not recent_checkins:
            return None

        lines: list[str] = []
        if active_phase is not None:
            phase_label = PHASE_TYPE_LABELS_ES[active_phase.phase_type]
            lines.append(
                f"- Fase activa: {phase_label} (desde {active_phase.start_date.isoformat()})"
            )
            lines.append(
                f"- Objetivos diarios: {active_phase.target_calories} kcal | "
                f"Proteína {active_phase.protein_g} g | Grasas {active_phase.fat_g} g | "
                f"Carbohidratos {active_phase.carbs_g} g"
            )
            lines.append(
                "- Ritmo objetivo semanal: "
                f"{active_phase.target_weekly_weight_change_kg:+.2f} kg/sem"
            )
            if active_phase.notes:
                lines.append(f"- Notas de fase: {active_phase.notes}")
        else:
            lines.append("- Fase activa: Ninguna Fase Nutricional activa registrada.")

        if recent_checkins:
            lines.append("- Check-ins recientes:")
            for item in recent_checkins:
                trend_desc = ""
                if item.weight_trend and item.weight_trend.actual_weekly_change_kg is not None:
                    trend_label = TREND_STATUS_LABELS_ES.get(
                        item.weight_trend.trend_status, item.weight_trend.trend_status
                    )
                    trend_desc = (
                        f" | tendencia {item.weight_trend.actual_weekly_change_kg:+.2f} kg/sem "
                        f"({trend_label})"
                    )
                tdee_desc = (
                    f" | delta TDEE {item.estimated_tdee_delta_kcal:+d} kcal"
                    if item.estimated_tdee_delta_kcal is not None
                    else ""
                )
                lines.append(
                    f"  * {item.checkin_date.isoformat()}: {item.average_weight_kg} kg{trend_desc}"
                    f"{tdee_desc} | adherencia {item.adherence_score}/10, "
                    f"sueño {item.sleep_quality}/10, energía {item.energy_level}/10, "
                    f"fatiga {item.perceived_fatigue}/10"
                )
                if item.performance_notes:
                    lines.append(f"    Rendimiento: {item.performance_notes}")

        return "FASE NUTRICIONAL ACTIVA Y CHECK-INS RECIENTES:\n" + "\n".join(lines)

