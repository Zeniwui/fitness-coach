"""Application use cases for Coach Chat (#6) with extensible context assembly."""

from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol
from uuid import UUID

from fitness_coach.application.ports.ai_provider import AIProviderPort, ModelTier
from fitness_coach.application.ports.identity_storage import BinaryStoragePort
from fitness_coach.application.ports.repositories.coach import CoachRepositoryPort
from fitness_coach.application.ports.repositories.knowledge import KnowledgeRepositoryPort
from fitness_coach.application.ports.repositories.multimodal import MultimodalRepositoryPort
from fitness_coach.application.ports.repositories.profile import ProfileRepositoryPort
from fitness_coach.application.ports.scientific_sources import ScientificSourcesPort
from fitness_coach.application.use_cases.knowledge import (
    check_existing_candidate_for_proposal,
    generate_critical_sheet,
)
from fitness_coach.application.use_cases.multimodal import ParseNaturalTrainingSessionUseCase
from fitness_coach.application.use_cases.profile import LivingProfileSnapshot
from fitness_coach.domain.coach import (
    CLINICAL_BOUNDARY_NOTICE_ES,
    GENERAL_KNOWLEDGE_DISCLOSURE_ES,
    LIVE_SEARCH_QUARANTINE_LABEL,
    PEDS_BOUNDARY_NOTICE_ES,
    BoundaryKind,
    ChatMessage,
    Citation,
    CoachPolicy,
    CoachValidationError,
    Conversation,
    ConversationNotFoundError,
    InvalidProposalStateError,
    MessageRole,
    ProfileUpdateProposal,
    ProposalNotFoundError,
    ProposalStatus,
    QuarantinedLiveResult,
)
from fitness_coach.domain.identity import AuthContext
from fitness_coach.domain.knowledge import (
    AccessLevel,
    CandidateOrigin,
    CandidateStatus,
    CandidateStudy,
    EvidenceSearchHit,
    ValidityStatus,
    compute_content_hash,
    normalize_doi,
    normalize_pmid,
)
from fitness_coach.domain.multimodal import (
    AttachmentMediaType,
    AttachmentNotFoundError,
    build_multimodal_image_prompt_block,
    detect_training_session_description,
)
from fitness_coach.domain.profile import (
    ExperienceLevel,
    InjuryRestriction,
    InjurySeverity,
    InjuryStatus,
    LivingProfile,
    PrimaryGoal,
    normalize_tag_list,
)


class ExtraCoachContextProvider(Protocol):
    """Extensible hook so #7 (Training) and #8 (Nutrition) plug into CoachContextAssembler."""

    async def get_context_block(self, athlete_id: UUID) -> str | None: ...


@dataclass(frozen=True, slots=True)
class AssembledCoachContext:
    """Complete per-turn context passed to the Coach LLM."""

    profile: LivingProfile
    active_injuries: tuple[InjuryRestriction, ...]
    citations: tuple[Citation, ...]
    used_general_knowledge: bool
    live_search_results: tuple[QuarantinedLiveResult, ...]
    boundary: BoundaryKind
    system_prompt: str
    user_prompt: str


@dataclass(frozen=True, slots=True)
class CoachStreamEvent:
    """Typed SSE event emitted during a Coach response stream."""

    event: str
    data: dict[str, Any] = field(default_factory=dict)


class CoachContextAssembler:
    """Builds Spanish Coach system/user prompts from Living Profile, active injuries,
    Knowledge Base hybrid search, quarantined live search, and optional #7/#8 providers.
    """

    def __init__(
        self,
        *,
        profile_repo: ProfileRepositoryPort,
        knowledge_repo: KnowledgeRepositoryPort,
        ai_provider: AIProviderPort,
        scientific_sources: ScientificSourcesPort | None = None,
        training_context_provider: ExtraCoachContextProvider | None = None,
        nutrition_context_provider: ExtraCoachContextProvider | None = None,
        extra_providers: Sequence[ExtraCoachContextProvider] = (),
    ) -> None:
        self._profile_repo = profile_repo
        self._knowledge_repo = knowledge_repo
        self._ai_provider = ai_provider
        self._scientific_sources = scientific_sources
        self._training_provider = training_context_provider
        self._nutrition_provider = nutrition_context_provider
        self._extra_providers = tuple(extra_providers)

    async def assemble(
        self,
        *,
        athlete_id: UUID,
        user_message: str,
        history: Sequence[ChatMessage],
        enable_live_search: bool = False,
        extra_prompt_blocks: Sequence[str] = (),
    ) -> AssembledCoachContext:
        profile = await self._profile_repo.get_profile(athlete_id)
        if profile is None:
            profile = LivingProfile.empty(athlete_id)

        # CRITICAL: ONLY active injuries are included (resolved/deleted vanish immediately)
        active_injuries = tuple(
            await self._profile_repo.list_injuries(athlete_id, status=InjuryStatus.ACTIVE)
        )

        # Hybrid search over approved Base de Conocimiento (active/nuanced prioritized)
        embed_result = (await self._ai_provider.embed_texts([user_message.strip()]))[0]
        raw_hits = await self._knowledge_repo.hybrid_search(
            query=user_message.strip(),
            query_embedding=embed_result.vector,
            query_embedding_model=embed_result.model_id,
            limit=5,
        )
        # Filter out archived cards and keep meaningful matches
        kb_hits = [
            hit
            for hit in raw_hits
            if hit.card.validity_status != ValidityStatus.ARCHIVED
        ]
        citations = tuple(self._to_citation(hit) for hit in kb_hits[:3])
        used_general_knowledge = len(citations) == 0

        # Quarantined live search when explicitly requested or triggered on cold-start/recent study
        live_results: tuple[QuarantinedLiveResult, ...] = ()
        if (
            self._scientific_sources is not None
            and CoachPolicy.should_trigger_live_search(
                user_text=user_message,
                explicit_request=enable_live_search,
                kb_hits_count=len(citations),
            )
        ):
            raw_live = await self._scientific_sources.live_web_search(
                query=user_message.strip(), max_results=3
            )
            filtered_live: list[QuarantinedLiveResult] = []
            for hit in raw_live:
                norm_doi = normalize_doi(hit.doi)
                norm_pmid = normalize_pmid(hit.pmid)
                if norm_doi or norm_pmid:
                    existing = await self._knowledge_repo.find_candidate_by_identifiers(
                        doi=norm_doi, pmid=norm_pmid
                    )
                    if existing is not None and existing.status == CandidateStatus.REJECTED:
                        continue
                filtered_live.append(
                    QuarantinedLiveResult(
                        title=hit.title,
                        url=hit.url,
                        snippet=hit.snippet,
                        doi=hit.doi,
                        pmid=hit.pmid,
                        published_year=hit.published_year,
                        quarantine_label=LIVE_SEARCH_QUARANTINE_LABEL,
                    )
                )
            live_results = tuple(filtered_live)

        boundary = CoachPolicy.classify_boundary(user_message)

        # Extensible context blocks (#7 Training, #8 Nutrition, or future providers)
        extra_blocks: list[str] = []
        for provider in (
            self._training_provider,
            self._nutrition_provider,
            *self._extra_providers,
        ):
            if provider is not None:
                block = await provider.get_context_block(athlete_id)
                if block:
                    extra_blocks.append(block)
        for inline_block in extra_prompt_blocks:
            if inline_block.strip():
                extra_blocks.append(inline_block)

        system_prompt = self._build_system_prompt(
            profile=profile,
            active_injuries=active_injuries,
            kb_hits=kb_hits[:3],
            used_general_knowledge=used_general_knowledge,
            live_results=live_results,
            boundary=boundary,
            extra_blocks=extra_blocks,
        )
        user_prompt = self._build_user_prompt(history=history, user_message=user_message)

        return AssembledCoachContext(
            profile=profile,
            active_injuries=active_injuries,
            citations=citations,
            used_general_knowledge=used_general_knowledge,
            live_search_results=live_results,
            boundary=boundary,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )

    @staticmethod
    def _to_citation(hit: EvidenceSearchHit) -> Citation:
        updating_card = hit.updated_by_cards[0] if hit.updated_by_cards else None
        return Citation(
            card_id=hit.card.id,
            title=hit.card.title,
            evidence_level=hit.card.evidence_level.value,
            validity_status=hit.card.validity_status.value,
            doi=hit.card.doi,
            pmid=hit.card.pmid,
            source_url=hit.card.source_url,
            superseded_by_card_id=updating_card.id if updating_card else None,
            superseded_by_title=updating_card.title if updating_card else None,
        )

    @staticmethod
    def _build_system_prompt(
        *,
        profile: LivingProfile,
        active_injuries: tuple[InjuryRestriction, ...],
        kb_hits: list[EvidenceSearchHit],
        used_general_knowledge: bool,
        live_results: tuple[QuarantinedLiveResult, ...],
        boundary: BoundaryKind,
        extra_blocks: list[str],
    ) -> str:
        sections: list[str] = [
            (
                "Eres el Coach de Fitness Coach, especializado en ciencias del deporte, "
                "hipertrofia, fisioculturismo y nutrición deportiva. Responde siempre en español "
                "claro, directo, práctico y basado en evidencia."
            ),
            (
                "REGLAS DE FRONTERA OBLIGATORIAS:\n"
                f"- Entrenamiento natural por defecto: {PEDS_BOUNDARY_NOTICE_ES}\n"
                f"- Límite clínico/médico: {CLINICAL_BOUNDARY_NOTICE_ES}"
            ),
        ]

        if boundary == BoundaryKind.PEDS:
            sections.append(
                "ALERTA DE FRONTERA ACTIVA (PEDs/Farmacología): El Atleta ha preguntado por "
                "farmacología o PEDs. Rechaza explícitamente prescribir ciclos, dosis o protocolos "
                "y limítate a contexto científico objetivo y reducción de daños."
            )
        elif boundary == BoundaryKind.CLINICAL:
            sections.append(
                "ALERTA DE FRONTERA ACTIVA (Clínica/Médica): El Atleta presenta una consulta "
                "médica o de nutrición clínica. Rechaza diagnosticar o prescribir nutrición "
                "clínica, ofrece adaptaciones conservadoras y deriva a médico, fisioterapeuta "
                "o nutricionista clínico."
            )

        # Living Profile block
        goal_val = profile.primary_goal.value if profile.primary_goal else "no definido"
        exp_val = profile.experience_level.value if profile.experience_level else "no definido"
        eq_val = ", ".join(profile.equipment) if profile.equipment else "no especificado"
        al_val = ", ".join(profile.allergies) if profile.allergies else "ninguna registrada"
        fp_val = (
            ", ".join(profile.food_preferences)
            if profile.food_preferences
            else "ninguna registrada"
        )
        profile_lines = [
            f"- Enfoque: {profile.training_approach.value}",
            f"- Objetivo principal: {goal_val}",
            f"- Nivel de experiencia: {exp_val}",
            (
                f"- Edad/Peso/Altura: {profile.age or 'N/D'} años, "
                f"{profile.base_weight_kg or 'N/D'} kg, {profile.height_cm or 'N/D'} cm"
            ),
            (
                f"- Disponibilidad: {profile.training_days_per_week or 'N/D'} días/semana, "
                f"{profile.session_duration_min or 'N/D'} min/sesión"
            ),
            f"- Equipo: {eq_val}",
            f"- Alergias: {al_val}",
            f"- Preferencias alimentarias: {fp_val}",
        ]
        if profile.notes:
            profile_lines.append(f"- Notas: {profile.notes}")
        sections.append("PERFIL VIVO ACTIVO DEL ATLETA:\n" + "\n".join(profile_lines))

        # Active injuries block
        if active_injuries:
            inj_lines = [
                f"- {inj.body_part} (severidad: {inj.severity.value}): {inj.description}"
                for inj in active_injuries
            ]
            sections.append(
                "LESIONES O RESTRICCIONES ACTIVAS (RESPETAR EN TODA RECOMENDACIÓN):\n"
                + "\n".join(inj_lines)
            )
        else:
            sections.append(
                "LESIONES O RESTRICCIONES ACTIVAS: Ninguna restricción activa registrada."
            )

        for block in extra_blocks:
            sections.append(block)

        # Knowledge Base citations block
        if kb_hits:
            kb_lines = []
            for idx, hit in enumerate(kb_hits, start=1):
                card = hit.card
                line = (
                    f"[{idx}] {card.title} | Nivel: {card.evidence_level.value} | "
                    f"Vigencia: {card.validity_status.value}\n"
                    f"Resumen curado: {card.curated_text_es[:500]}"
                )
                if hit.updated_by_cards:
                    upd_title = hit.updated_by_cards[0].title
                    line += f"\n(Nota de evolución: actualizada por '{upd_title}')"
                kb_lines.append(line)
            sections.append(
                "BASE DE CONOCIMIENTO APROBADA (CITA ESTAS FICHAS DE EVIDENCIA):\n"
                + "\n\n".join(kb_lines)
            )
        elif used_general_knowledge:
            sections.append(
                "BASE DE CONOCIMIENTO: Sin Fichas de Evidencia aprobadas aplicables. "
                f"Declara explícitamente: '{GENERAL_KNOWLEDGE_DISCLOSURE_ES}'"
            )

        if live_results:
            live_lines = [
                f"- {item.title} ({item.url}): {item.snippet}" for item in live_results
            ]
            sections.append(
                f"RESULTADOS DE BÚSQUEDA EN VIVO EN CUARENTENA ({LIVE_SEARCH_QUARANTINE_LABEL}):\n"
                + "\n".join(live_lines)
            )

        return "\n\n".join(sections)

    @staticmethod
    def _build_user_prompt(*, history: Sequence[ChatMessage], user_message: str) -> str:
        if not history:
            return user_message.strip()
        recent = history[-8:]
        lines = [
            f"{'Atleta' if msg.role == MessageRole.USER else 'Coach'}: {msg.content}"
            for msg in recent
        ]
        lines.append(f"Atleta: {user_message.strip()}")
        return "\n".join(lines)


class ListConversationsUseCase:
    def __init__(self, repo: CoachRepositoryPort) -> None:
        self._repo = repo

    async def execute(self, *, auth: AuthContext) -> list[Conversation]:
        return await self._repo.list_conversations(athlete_id=auth.athlete_id)


class CreateConversationUseCase:
    def __init__(self, repo: CoachRepositoryPort) -> None:
        self._repo = repo

    async def execute(self, *, auth: AuthContext, title: str | None = None) -> Conversation:
        cleaned = (title or "").strip() or "Nueva conversación"
        if len(cleaned) > 200:
            cleaned = cleaned[:200]
        return await self._repo.create_conversation(athlete_id=auth.athlete_id, title=cleaned)


class ListMessagesUseCase:
    def __init__(self, repo: CoachRepositoryPort) -> None:
        self._repo = repo

    async def execute(self, *, auth: AuthContext, conversation_id: UUID) -> list[ChatMessage]:
        conv = await self._repo.get_conversation(
            athlete_id=auth.athlete_id, conversation_id=conversation_id
        )
        if conv is None:
            raise ConversationNotFoundError("No se encontró la conversación solicitada.")
        return await self._repo.list_messages(
            athlete_id=auth.athlete_id, conversation_id=conversation_id
        )


class SendCoachMessageStreamUseCase:
    """Persists the Athlete message, streams Coach SSE events, and saves reply + proposals."""

    def __init__(
        self,
        *,
        coach_repo: CoachRepositoryPort,
        context_assembler: CoachContextAssembler,
        ai_provider: AIProviderPort,
        multimodal_repo: MultimodalRepositoryPort | None = None,
        binary_storage: BinaryStoragePort | None = None,
    ) -> None:
        self._coach_repo = coach_repo
        self._assembler = context_assembler
        self._ai_provider = ai_provider
        self._multimodal_repo = multimodal_repo
        self._binary_storage = binary_storage

    async def execute(
        self,
        *,
        auth: AuthContext,
        conversation_id: UUID,
        content: str,
        enable_live_search: bool = False,
        attachment_ids: Sequence[UUID] = (),
    ) -> AsyncIterator[CoachStreamEvent]:
        cleaned = content.strip()
        if not cleaned:
            raise CoachValidationError("El mensaje no puede estar vacío.")

        conv = await self._coach_repo.get_conversation(
            athlete_id=auth.athlete_id, conversation_id=conversation_id
        )
        if conv is None:
            raise ConversationNotFoundError("No se encontró la conversación solicitada.")

        # Resolve & isolate Athlete-scoped attachments before persisting
        resolved_attachments = []
        image_payloads: list[tuple[bytes, str]] = []
        extra_prompt_blocks: list[str] = []
        if attachment_ids:
            if self._multimodal_repo is None or self._binary_storage is None:
                raise AttachmentNotFoundError("Almacenamiento multimodal no disponible.")
            unique_ids = list(dict.fromkeys(attachment_ids))
            resolved_attachments = await self._multimodal_repo.list_attachments_by_ids(
                athlete_id=auth.athlete_id,
                attachment_ids=unique_ids,
            )
            if len(resolved_attachments) != len(unique_ids):
                raise AttachmentNotFoundError("No se encontró el archivo adjunto solicitado.")
            image_attachments = [
                a for a in resolved_attachments if a.media_type == AttachmentMediaType.IMAGE
            ]
            for att in image_attachments:
                raw_bytes = await self._binary_storage.get_athlete_object(
                    athlete_id=auth.athlete_id,
                    storage_path=att.storage_path,
                )
                image_payloads.append((raw_bytes, att.mime_type))
            if image_attachments:
                extra_prompt_blocks.append(
                    build_multimodal_image_prompt_block(
                        attachments=image_attachments,
                        user_text=cleaned,
                    )
                )

        history = await self._coach_repo.list_messages(
            athlete_id=auth.athlete_id, conversation_id=conversation_id, limit=20
        )

        # Persist Athlete turn first
        user_msg = await self._coach_repo.create_message(
            conversation_id=conversation_id,
            athlete_id=auth.athlete_id,
            role=MessageRole.USER,
            content=cleaned,
        )
        if resolved_attachments and self._multimodal_repo is not None:
            await self._multimodal_repo.link_attachments_to_message(
                athlete_id=auth.athlete_id,
                attachment_ids=[a.id for a in resolved_attachments],
                message_id=user_msg.id,
            )

        # Auto-title default conversations on first message
        next_title: str | None = None
        if not history and conv.title == "Nueva conversación":
            next_title = cleaned[:72]
        await self._coach_repo.touch_conversation(
            athlete_id=auth.athlete_id,
            conversation_id=conversation_id,
            title=next_title,
        )

        # Assemble active Living Profile, active injuries, KB citations, live search & boundaries
        assembled = await self._assembler.assemble(
            athlete_id=auth.athlete_id,
            user_message=cleaned,
            history=history,
            enable_live_search=enable_live_search,
            extra_prompt_blocks=extra_prompt_blocks,
        )

        # Stream tokens from AIProviderPort (reasoning tier for coaching)
        collected_chunks: list[str] = []
        async for delta in self._ai_provider.stream_text(
            tier=ModelTier.REASONING,
            system_prompt=assembled.system_prompt,
            user_prompt=assembled.user_prompt,
            images=image_payloads or None,
        ):
            if delta:
                collected_chunks.append(delta)
                yield CoachStreamEvent(event="token", data={"delta": delta})

        raw_reply = "".join(collected_chunks).strip()
        final_reply = CoachPolicy.ensure_policy_disclosures(
            text=raw_reply,
            used_general_knowledge=assembled.used_general_knowledge,
            boundary=assembled.boundary,
            has_live_search=bool(assembled.live_search_results),
        )
        if final_reply != raw_reply:
            # Emit any mandatory disclosure suffix/prefix cleanly if not already streamed
            extra_delta = "\n\n" + final_reply.replace(raw_reply, "").strip()
            if extra_delta.strip():
                yield CoachStreamEvent(event="token", data={"delta": extra_delta})

        # Emit citations / general knowledge event
        yield CoachStreamEvent(
            event="citations",
            data={
                "citations": [c.to_dict() for c in assembled.citations],
                "used_general_knowledge": assembled.used_general_knowledge,
                "boundary_triggered": assembled.boundary.value,
            },
        )

        # Emit quarantined live search event if applicable
        if assembled.live_search_results:
            yield CoachStreamEvent(
                event="live_search_quarantine",
                data={
                    "quarantine_label": LIVE_SEARCH_QUARANTINE_LABEL,
                    "results": [r.to_dict() for r in assembled.live_search_results],
                },
            )

        # Persist assistant message
        assistant_msg = await self._coach_repo.create_message(
            conversation_id=conversation_id,
            athlete_id=auth.athlete_id,
            role=MessageRole.ASSISTANT,
            content=final_reply,
            citations=assembled.citations,
            live_search_results=assembled.live_search_results,
            used_general_knowledge=assembled.used_general_knowledge,
            boundary_triggered=assembled.boundary,
        )

        # Detect Living Profile update proposal (never mutates LivingProfile until accepted)
        detected = CoachPolicy.detect_profile_change(
            user_text=cleaned,
            current_profile=assembled.profile,
        )
        if detected is not None:
            proposed_changes, summary_es = detected
            proposal = await self._coach_repo.create_proposal(
                athlete_id=auth.athlete_id,
                message_id=assistant_msg.id,
                proposed_changes=proposed_changes,
                summary_es=summary_es,
            )
            yield CoachStreamEvent(
                event="profile_proposal",
                data={
                    "proposal": {
                        "id": str(proposal.id),
                        "message_id": str(proposal.message_id) if proposal.message_id else None,
                        "proposed_changes": proposal.proposed_changes,
                        "summary_es": proposal.summary_es,
                        "status": proposal.status.value,
                        "created_at": proposal.created_at.isoformat(),
                        "resolved_at": None,
                    }
                },
            )

        # Detect natural-language TrainingSession description -> emit unconfirmed draft
        if detect_training_session_description(cleaned):
            draft_parser = ParseNaturalTrainingSessionUseCase(ai_provider=self._ai_provider)
            draft = await draft_parser.execute(auth=auth, text=cleaned)
            yield CoachStreamEvent(
                event="session_draft",
                data={"draft": draft.to_dict()},
            )

        yield CoachStreamEvent(
            event="done",
            data={
                "message": {
                    "id": str(assistant_msg.id),
                    "conversation_id": str(assistant_msg.conversation_id),
                    "role": assistant_msg.role.value,
                    "content": assistant_msg.content,
                    "citations": [c.to_dict() for c in assistant_msg.citations],
                    "live_search_results": [
                        r.to_dict() for r in assistant_msg.live_search_results
                    ],
                    "used_general_knowledge": assistant_msg.used_general_knowledge,
                    "boundary_triggered": assistant_msg.boundary_triggered.value,
                    "created_at": (
                        assistant_msg.created_at.isoformat() if assistant_msg.created_at else None
                    ),
                }
            },
        )


class PromoteLiveSearchResultUseCase:
    """1-click promotion of a quarantined live-search hit into a pending CandidateStudy.

    Accessible to both Athlete and Curator (ADR-0001: NEVER creates an EvidenceCard directly).
    """

    def __init__(
        self,
        *,
        knowledge_repo: KnowledgeRepositoryPort,
        ai_provider: AIProviderPort,
    ) -> None:
        self._knowledge_repo = knowledge_repo
        self._ai_provider = ai_provider

    async def execute(
        self,
        *,
        auth: AuthContext,
        title: str,
        url: str,
        snippet: str,
        doi: str | None = None,
        pmid: str | None = None,
        published_year: int | None = None,
    ) -> CandidateStudy:
        cleaned_title = title.strip()
        cleaned_url = url.strip()
        if not cleaned_title or not cleaned_url:
            raise CoachValidationError("Se requiere título y enlace del resultado para promoverlo.")

        norm_doi = normalize_doi(doi)
        norm_pmid = normalize_pmid(pmid)
        content_hash = compute_content_hash(f"{cleaned_title}\n{cleaned_url}\n{snippet}")

        # Respect existing deduplication invariants without bypassing Curator rejection history
        await check_existing_candidate_for_proposal(
            repo=self._knowledge_repo,
            doi=norm_doi,
            pmid=norm_pmid,
            content_hash=content_hash,
            allow_reopen=False,
        )

        source_text = snippet.strip() or cleaned_title
        sheet = await generate_critical_sheet(
            ai_provider=self._ai_provider,
            title=cleaned_title,
            authors=[],
            journal=None,
            published_year=published_year,
            doi=norm_doi,
            pmid=norm_pmid,
            source_url=cleaned_url,
            access_level=AccessLevel.ABSTRACT_ONLY_PAYWALL,
            source_text=source_text,
        )

        return await self._knowledge_repo.create_candidate(
            doi=norm_doi,
            pmid=norm_pmid,
            pmcid=None,
            content_hash=content_hash,
            source_url=cleaned_url,
            title=cleaned_title,
            authors=[],
            journal=None,
            published_year=published_year,
            origin=CandidateOrigin.LIVE_SEARCH_PROMOTED,
            access_level=AccessLevel.ABSTRACT_ONLY_PAYWALL,
            critical_sheet=sheet,
            pdf_storage_path=None,
            monthly_cut_run_id=None,
        )


class ListProfileProposalsUseCase:
    def __init__(self, coach_repo: CoachRepositoryPort) -> None:
        self._coach_repo = coach_repo

    async def execute(
        self, *, auth: AuthContext, status: ProposalStatus | None = None
    ) -> list[ProfileUpdateProposal]:
        return await self._coach_repo.list_proposals(athlete_id=auth.athlete_id, status=status)


class AcceptProfileProposalUseCase:
    """Explicitly confirms a Living Profile proposal and persists its changes."""

    def __init__(
        self,
        *,
        coach_repo: CoachRepositoryPort,
        profile_repo: ProfileRepositoryPort,
    ) -> None:
        self._coach_repo = coach_repo
        self._profile_repo = profile_repo

    async def execute(
        self, *, auth: AuthContext, proposal_id: UUID
    ) -> tuple[ProfileUpdateProposal, LivingProfileSnapshot]:
        proposal = await self._coach_repo.get_proposal(
            athlete_id=auth.athlete_id, proposal_id=proposal_id
        )
        if proposal is None:
            raise ProposalNotFoundError("No se encontró la propuesta de Perfil Vivo solicitada.")
        if proposal.status != ProposalStatus.PROPOSED:
            raise InvalidProposalStateError("Esta propuesta de Perfil Vivo ya fue resuelta.")

        changes = proposal.proposed_changes
        current = await self._profile_repo.get_profile(auth.athlete_id)
        if current is None:
            current = LivingProfile.empty(auth.athlete_id)

        profile_mutated = False
        next_days = current.training_days_per_week
        next_duration = current.session_duration_min
        next_goal = current.primary_goal
        next_level = current.experience_level
        next_weight = current.base_weight_kg
        next_height = current.height_cm
        next_age = current.age
        next_equipment = list(current.equipment)
        next_allergies = list(current.allergies)
        next_food = list(current.food_preferences)
        next_notes = current.notes

        if "training_days_per_week" in changes:
            next_days = int(changes["training_days_per_week"])
            profile_mutated = True
        if "session_duration_min" in changes:
            next_duration = int(changes["session_duration_min"])
            profile_mutated = True
        if "primary_goal" in changes:
            next_goal = PrimaryGoal(str(changes["primary_goal"]))
            profile_mutated = True
        if "experience_level" in changes:
            next_level = ExperienceLevel(str(changes["experience_level"]))
            profile_mutated = True
        if "base_weight_kg" in changes:
            next_weight = float(changes["base_weight_kg"])
            profile_mutated = True
        if "height_cm" in changes:
            next_height = float(changes["height_cm"])
            profile_mutated = True
        if "age" in changes:
            next_age = int(changes["age"])
            profile_mutated = True
        if "equipment_add" in changes:
            next_equipment.extend(str(item) for item in changes["equipment_add"])
            profile_mutated = True
        if "allergies_add" in changes:
            next_allergies.extend(str(item) for item in changes["allergies_add"])
            profile_mutated = True
        if "food_preferences_add" in changes:
            next_food.extend(str(item) for item in changes["food_preferences_add"])
            profile_mutated = True
        if "notes" in changes:
            next_notes = str(changes["notes"]).strip() or None
            profile_mutated = True

        saved_profile = current
        if profile_mutated:
            updated_profile = LivingProfile(
                athlete_id=auth.athlete_id,
                age=next_age,
                sex=current.sex,
                height_cm=next_height,
                base_weight_kg=next_weight,
                experience_level=next_level,
                primary_goal=next_goal,
                training_days_per_week=next_days,
                session_duration_min=next_duration,
                equipment=normalize_tag_list(next_equipment),
                allergies=normalize_tag_list(next_allergies),
                food_preferences=normalize_tag_list(next_food),
                training_approach=current.training_approach,
                notes=next_notes,
            )
            updated_profile.validate()
            saved_profile = await self._profile_repo.upsert_profile(updated_profile)

        new_injury = changes.get("new_injury")
        if isinstance(new_injury, dict) and new_injury.get("body_part"):
            raw_sev = str(new_injury.get("severity") or "moderate")
            try:
                severity = InjurySeverity(raw_sev)
            except ValueError:
                severity = InjurySeverity.MODERATE
            desc = str(new_injury.get("description") or "Molestia reportada en chat").strip()
            await self._profile_repo.create_injury(
                athlete_id=auth.athlete_id,
                body_part=str(new_injury["body_part"]).strip(),
                description=desc,
                severity=severity,
            )

        resolved = await self._coach_repo.resolve_proposal(
            athlete_id=auth.athlete_id,
            proposal_id=proposal_id,
            status=ProposalStatus.ACCEPTED,
            resolved_at=datetime.now(UTC),
        )
        assert resolved is not None
        injuries = await self._profile_repo.list_injuries(auth.athlete_id)
        return resolved, LivingProfileSnapshot(profile=saved_profile, injuries=tuple(injuries))


class DismissProfileProposalUseCase:
    """Dismisses a Living Profile proposal without modifying the Athlete's Living Profile."""

    def __init__(self, coach_repo: CoachRepositoryPort) -> None:
        self._coach_repo = coach_repo

    async def execute(self, *, auth: AuthContext, proposal_id: UUID) -> ProfileUpdateProposal:
        proposal = await self._coach_repo.get_proposal(
            athlete_id=auth.athlete_id, proposal_id=proposal_id
        )
        if proposal is None:
            raise ProposalNotFoundError("No se encontró la propuesta de Perfil Vivo solicitada.")
        if proposal.status != ProposalStatus.PROPOSED:
            raise InvalidProposalStateError("Esta propuesta de Perfil Vivo ya fue resuelta.")

        resolved = await self._coach_repo.resolve_proposal(
            athlete_id=auth.athlete_id,
            proposal_id=proposal_id,
            status=ProposalStatus.DISMISSED,
            resolved_at=datetime.now(UTC),
        )
        assert resolved is not None
        return resolved
