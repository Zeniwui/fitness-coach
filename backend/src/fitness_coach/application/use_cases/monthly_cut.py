"""Use cases for Monthly Cut, Quota Checkpointing, Seed Batch & Trending Topics (#5)."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

from fitness_coach.application.ports.ai_provider import (
    AIProviderPort,
    ModelTier,
    RateLimitError,
)
from fitness_coach.application.ports.repositories.knowledge import KnowledgeRepositoryPort
from fitness_coach.application.ports.repositories.monthly_cut import MonthlyCutRepositoryPort
from fitness_coach.application.ports.scientific_sources import ScientificSourcesPort
from fitness_coach.application.use_cases.knowledge import generate_critical_sheet
from fitness_coach.domain.identity import AuthContext
from fitness_coach.domain.knowledge import (
    CandidateOrigin,
    CriticalSheet6Blocks,
    EvidenceCard,
    ValidityStatus,
    normalize_doi,
    normalize_pmid,
)
from fitness_coach.domain.monthly_cut import (
    DEFAULT_MAX_CANDIDATES,
    DEFAULT_MONTHLY_CUT_QUERY,
    FOUNDATIONAL_SEED_BATCH,
    MonthlyCutNotFoundError,
    MonthlyCutRun,
    MonthlyCutRunType,
    MonthlyCutStateError,
    MonthlyCutStatus,
    MonthlyCutValidationError,
    QueuedArticle,
    TrendingTopic,
    TrendingTopicNotFoundError,
    TrendingTopicStatus,
    filter_and_prioritize_articles,
    validate_max_candidates,
)

CommitFn = Callable[[], Awaitable[None]]


async def _noop_commit() -> None:
    return None


@dataclass(frozen=True, slots=True)
class SeedBatchResult:
    run_id: UUID
    total_in_catalog: int
    created_count: int
    skipped_count: int


async def _find_related_kb_cards(
    *,
    knowledge_repo: KnowledgeRepositoryPort,
    ai_provider: AIProviderPort,
    query_text: str,
    limit: int = 3,
) -> list[EvidenceCard]:
    """Query approved KnowledgeBase to ground block 6 impact & TrendingTopic contrasts."""
    all_cards = await knowledge_repo.list_all_evidence_cards()
    if not all_cards:
        return []
    embeddings = await ai_provider.embed_texts([query_text])
    emb = embeddings[0]
    hits = await knowledge_repo.hybrid_search(
        query=query_text,
        query_embedding=emb.vector,
        query_embedding_model=emb.model_id,
        validity_status=ValidityStatus.ACTIVE,
        limit=limit,
    )
    return [h.card for h in hits]


async def _process_run_from_checkpoint(
    *,
    run: MonthlyCutRun,
    monthly_cut_repo: MonthlyCutRepositoryPort,
    knowledge_repo: KnowledgeRepositoryPort,
    ai_provider: AIProviderPort,
    scientific_sources: ScientificSourcesPort,
    commit: CommitFn,
) -> MonthlyCutRun:
    """Execute Stage 2/3 (per-candidate 6-block analysis + Trending Topics) from durable cursor."""
    cursor: dict[str, Any] = dict(run.checkpoint_cursor or {})
    raw_queue: list[dict[str, Any]] = list(cursor.get("queue") or [])
    queue = [QueuedArticle.from_dict(item) for item in raw_queue]
    next_index = int(cursor.get("next_index", 0))
    processed_keys: list[str] = list(cursor.get("processed_keys") or [])
    processed_set: set[str] = set(processed_keys)
    analyzed_count = run.analyzed_count

    run = await monthly_cut_repo.update_run(
        run_id=run.id,
        status=MonthlyCutStatus.ANALYZING,
        pause_reason=None,
        error_message=None,
    )
    await commit()

    # Stage 2/3a: Per-candidate critical analysis with durable checkpointing
    for idx in range(next_index, len(queue)):
        article = queue[idx]

        # Idempotency guard: skip if already processed in cursor or already present in DB
        if article.key in processed_set:
            cursor["next_index"] = idx + 1
            continue

        existing = await knowledge_repo.find_candidate_by_identifiers(
            doi=article.doi,
            pmid=article.pmid,
        )
        if existing is not None:
            processed_keys.append(article.key)
            processed_set.add(article.key)
            cursor["next_index"] = idx + 1
            cursor["processed_keys"] = processed_keys
            run = await monthly_cut_repo.update_run(
                run_id=run.id,
                checkpoint_cursor=cursor,
            )
            await commit()
            continue

        source_text = article.full_text or article.abstract or article.title

        try:
            related_cards = await _find_related_kb_cards(
                knowledge_repo=knowledge_repo,
                ai_provider=ai_provider,
                query_text=f"{article.title} {article.abstract or ''}".strip(),
                limit=3,
            )
            sheet = await generate_critical_sheet(
                ai_provider=ai_provider,
                title=article.title,
                authors=list(article.authors),
                journal=article.journal,
                published_year=article.published_year,
                doi=article.doi,
                pmid=article.pmid,
                source_url=article.source_url,
                access_level=article.access_level,
                source_text=source_text,
            )
        except RateLimitError as exc:
            cursor["next_index"] = idx
            cursor["processed_keys"] = processed_keys
            run = await monthly_cut_repo.update_run(
                run_id=run.id,
                status=MonthlyCutStatus.PAUSED_RATE_LIMIT,
                analyzed_count=analyzed_count,
                checkpoint_cursor=cursor,
                pause_reason=str(exc)
                or "Cuota de IA alcanzada (HTTP 429). Reanudar desde checkpoint.",
            )
            await commit()
            return run

        if (
            related_cards
            and "Fichas relacionadas en Base de Conocimiento"
            not in sheet.block_6_impact_vs_existing_kb
        ):
            refs = "; ".join(f"{c.title} ({c.evidence_level.value})" for c in related_cards)
            enriched_b6 = (
                f"{sheet.block_6_impact_vs_existing_kb} "
                f"Fichas relacionadas en Base de Conocimiento: {refs}."
            )
            sheet = CriticalSheet6Blocks(
                block_1_identification=sheet.block_1_identification,
                block_2_design_and_evidence_level=sheet.block_2_design_and_evidence_level,
                block_3_population_and_protocol=sheet.block_3_population_and_protocol,
                block_4_key_findings_and_applicability=sheet.block_4_key_findings_and_applicability,
                block_5_limitations_and_conflicts=sheet.block_5_limitations_and_conflicts,
                block_6_impact_vs_existing_kb=enriched_b6,
                suggested_evidence_level=sheet.suggested_evidence_level,
                suggested_tags=sheet.suggested_tags,
                key_terms_en=sheet.key_terms_en,
                curated_summary_es=sheet.curated_summary_es,
            )

        await knowledge_repo.create_candidate(
            doi=article.doi,
            pmid=article.pmid,
            pmcid=article.pmcid,
            content_hash=None,
            source_url=article.source_url,
            title=article.title,
            authors=list(article.authors),
            journal=article.journal,
            published_year=article.published_year,
            origin=CandidateOrigin.MONTHLY_CUT,
            access_level=article.access_level,
            critical_sheet=sheet,
            monthly_cut_run_id=run.id,
        )

        analyzed_count += 1
        processed_keys.append(article.key)
        processed_set.add(article.key)
        cursor["next_index"] = idx + 1
        cursor["processed_keys"] = processed_keys

        run = await monthly_cut_repo.update_run(
            run_id=run.id,
            analyzed_count=analyzed_count,
            checkpoint_cursor=cursor,
        )
        await commit()

    # Stage 3b: Independent Trending Topics generation (contrasted against KnowledgeBase)
    if not cursor.get("trending_generated", False):
        trend_query = run.query_override or "fitness hypertrophy bodybuilding nutrition trends"
        live_hits = await scientific_sources.live_web_search(query=trend_query, max_results=3)

        if live_hits:
            try:
                kb_cards = await _find_related_kb_cards(
                    knowledge_repo=knowledge_repo,
                    ai_provider=ai_provider,
                    query_text=" ".join(h.title for h in live_hits),
                    limit=5,
                )
            except RateLimitError as exc:
                cursor["next_index"] = len(queue)
                cursor["processed_keys"] = processed_keys
                cursor["trending_generated"] = False
                run = await monthly_cut_repo.update_run(
                    run_id=run.id,
                    status=MonthlyCutStatus.PAUSED_RATE_LIMIT,
                    analyzed_count=analyzed_count,
                    checkpoint_cursor=cursor,
                    pause_reason=str(exc)
                    or "Cuota de IA alcanzada al consultar Base de Conocimiento (HTTP 429).",
                )
                await commit()
                return run
            kb_context = (
                "\n".join(f"- [{c.id}] {c.title}: {c.curated_text_es}" for c in kb_cards)
                if kb_cards
                else "Sin Fichas de Evidencia aprobadas aún en la Base de Conocimiento."
            )

            for hit in live_hits:
                try:
                    response = await ai_provider.generate(
                        tier=ModelTier.FAST,
                        system_prompt=(
                            "Contrasta críticamente este Tema de Actualidad del fitness frente "
                            "a la Base de Conocimiento aprobada. Responde en español con "
                            "evaluación crítica clara, separada de la evidencia primaria."
                        ),
                        user_prompt=(
                            f"Tema: {hit.title}\nResumen externo: {hit.snippet}\n"
                            f"Enlace: {hit.url}\n\nBase de Conocimiento disponible:\n{kb_context}"
                        ),
                        json_schema={"type": "object", "title": "TrendingTopicEvaluation"},
                    )
                except RateLimitError as exc:
                    cursor["next_index"] = len(queue)
                    cursor["processed_keys"] = processed_keys
                    cursor["trending_generated"] = False
                    run = await monthly_cut_repo.update_run(
                        run_id=run.id,
                        status=MonthlyCutStatus.PAUSED_RATE_LIMIT,
                        analyzed_count=analyzed_count,
                        checkpoint_cursor=cursor,
                        pause_reason=str(exc)
                        or "Cuota de IA alcanzada al evaluar Temas de Actualidad (HTTP 429).",
                    )
                    await commit()
                    return run

                data = response.structured_data or {}
                title = str(data.get("title") or hit.title).strip()
                summary = str(data.get("summary") or hit.snippet or hit.title).strip()
                evaluation = str(
                    data.get("critical_evaluation")
                    or response.text
                    or "Contraste crítico frente a la Base de Conocimiento pendiente de revisión."
                ).strip()
                cited_ids = [c.id for c in kb_cards]

                await monthly_cut_repo.create_trending_topic(
                    monthly_cut_run_id=run.id,
                    title=title,
                    summary=summary,
                    critical_evaluation=evaluation,
                    cited_card_ids=cited_ids,
                )

        cursor["trending_generated"] = True

    run = await monthly_cut_repo.update_run(
        run_id=run.id,
        status=MonthlyCutStatus.COMPLETED,
        analyzed_count=analyzed_count,
        checkpoint_cursor=cursor,
        pause_reason=None,
        finished_at=datetime.now(UTC),
    )
    await commit()
    return run


class RunMonthlyCutUseCase:
    """Execute a full 3-stage Corte Mensual (manual from Curator or scheduled from CLI)."""

    def __init__(
        self,
        *,
        monthly_cut_repo: MonthlyCutRepositoryPort,
        knowledge_repo: KnowledgeRepositoryPort,
        ai_provider: AIProviderPort,
        scientific_sources: ScientificSourcesPort,
    ) -> None:
        self._monthly_cut_repo = monthly_cut_repo
        self._knowledge_repo = knowledge_repo
        self._ai_provider = ai_provider
        self._scientific_sources = scientific_sources

    async def execute(
        self,
        *,
        auth: AuthContext | None,
        run_type: MonthlyCutRunType = MonthlyCutRunType.MANUAL,
        date_from: date | None = None,
        date_to: date | None = None,
        query_override: str | None = None,
        max_candidates: int = DEFAULT_MAX_CANDIDATES,
        commit: CommitFn = _noop_commit,
    ) -> MonthlyCutRun:
        if auth is not None:
            auth.require_curator()

        validated_max = validate_max_candidates(max_candidates)
        if date_from and date_to and date_from > date_to:
            raise MonthlyCutValidationError(
                "La fecha de inicio no puede ser posterior a la fecha de fin."
            )

        run = await self._monthly_cut_repo.create_run(
            run_type=run_type,
            date_from=date_from,
            date_to=date_to,
            query_override=query_override.strip() if query_override else None,
            max_candidates=validated_max,
        )
        await commit()

        # Stage 1: Collect from scientific sources (0 LLM calls)
        run = await self._monthly_cut_repo.update_run(
            run_id=run.id,
            status=MonthlyCutStatus.COLLECTING,
        )
        await commit()

        query = run.query_override or DEFAULT_MONTHLY_CUT_QUERY
        try:
            records = await self._scientific_sources.search_literature(
                query=query,
                date_from=date_from,
                date_to=date_to,
                max_results=max(50, validated_max * 5),
            )
        except Exception as exc:
            run = await self._monthly_cut_repo.update_run(
                run_id=run.id,
                status=MonthlyCutStatus.FAILED,
                error_message=f"Error al recolectar literatura científica: {exc}",
                finished_at=datetime.now(UTC),
            )
            await commit()
            return run

        observed_sources = sorted({r.source_name for r in records if r.source_name})

        # Stage 1b: Deterministic pre-filtering, deduplication & cap (0 LLM calls)
        run = await self._monthly_cut_repo.update_run(
            run_id=run.id,
            status=MonthlyCutStatus.FILTERING,
            sources=observed_sources,
            collected_count=len(records),
        )
        await commit()

        existing_dois, existing_pmids = await self._monthly_cut_repo.get_existing_identifiers()
        raw_dicts = [
            {
                "title": r.title,
                "source_name": r.source_name,
                "source_url": r.source_url,
                "doi": r.doi,
                "pmid": r.pmid,
                "pmcid": r.pmcid,
                "authors": list(r.authors),
                "journal": r.journal,
                "published_year": r.published_year,
                "abstract": r.abstract,
                "full_text": r.full_text,
                "is_open_access": r.is_open_access,
            }
            for r in records
        ]
        queued = filter_and_prioritize_articles(
            raw_articles=raw_dicts,
            existing_dois=existing_dois,
            existing_pmids=existing_pmids,
            max_candidates=validated_max,
        )

        cursor: dict[str, Any] = {
            "queue": [a.to_dict() for a in queued],
            "next_index": 0,
            "processed_keys": [],
            "trending_generated": False,
        }
        run = await self._monthly_cut_repo.update_run(
            run_id=run.id,
            filtered_count=len(queued),
            checkpoint_cursor=cursor,
        )
        await commit()

        # Stage 2 & 3: Analyze queued candidates + generate independent Trending Topics
        return await _process_run_from_checkpoint(
            run=run,
            monthly_cut_repo=self._monthly_cut_repo,
            knowledge_repo=self._knowledge_repo,
            ai_provider=self._ai_provider,
            scientific_sources=self._scientific_sources,
            commit=commit,
        )


class ResumeMonthlyCutUseCase:
    """Resume a paused_rate_limit (or failed) Corte Mensual strictly from its checkpoint."""

    def __init__(
        self,
        *,
        monthly_cut_repo: MonthlyCutRepositoryPort,
        knowledge_repo: KnowledgeRepositoryPort,
        ai_provider: AIProviderPort,
        scientific_sources: ScientificSourcesPort,
    ) -> None:
        self._monthly_cut_repo = monthly_cut_repo
        self._knowledge_repo = knowledge_repo
        self._ai_provider = ai_provider
        self._scientific_sources = scientific_sources

    async def execute(
        self,
        *,
        auth: AuthContext | None,
        run_id: UUID,
        commit: CommitFn = _noop_commit,
    ) -> MonthlyCutRun:
        if auth is not None:
            auth.require_curator()

        run = await self._monthly_cut_repo.get_run(run_id)
        if run is None:
            raise MonthlyCutNotFoundError("Ejecución de Corte Mensual no encontrada.")
        if run.status not in {MonthlyCutStatus.PAUSED_RATE_LIMIT, MonthlyCutStatus.FAILED}:
            raise MonthlyCutStateError(
                "Solo se pueden reanudar cortes pausados o fallidos "
                f"(estado actual: '{run.status.value}')."
            )

        return await _process_run_from_checkpoint(
            run=run,
            monthly_cut_repo=self._monthly_cut_repo,
            knowledge_repo=self._knowledge_repo,
            ai_provider=self._ai_provider,
            scientific_sources=self._scientific_sources,
            commit=commit,
        )


class LoadSeedBatchUseCase:
    """Idempotently load foundational meta-analyses & Position Stands as pending candidates."""

    def __init__(
        self,
        *,
        monthly_cut_repo: MonthlyCutRepositoryPort,
        knowledge_repo: KnowledgeRepositoryPort,
    ) -> None:
        self._monthly_cut_repo = monthly_cut_repo
        self._knowledge_repo = knowledge_repo

    async def execute(
        self,
        *,
        auth: AuthContext | None,
        commit: CommitFn = _noop_commit,
    ) -> SeedBatchResult:
        if auth is not None:
            auth.require_curator()

        existing_dois, existing_pmids = await self._monthly_cut_repo.get_existing_identifiers()

        run = await self._monthly_cut_repo.create_run(
            run_type=MonthlyCutRunType.SEED,
            date_from=None,
            date_to=None,
            query_override="Lote Semilla fundacional (meta-análisis y Position Stands)",
            max_candidates=len(FOUNDATIONAL_SEED_BATCH),
        )

        created = 0
        skipped = 0
        for spec in FOUNDATIONAL_SEED_BATCH:
            norm_doi = normalize_doi(spec.doi)
            norm_pmid = normalize_pmid(spec.pmid)
            if (norm_doi and norm_doi in existing_dois) or (
                norm_pmid and norm_pmid in existing_pmids
            ):
                skipped += 1
                continue

            await self._knowledge_repo.create_candidate(
                doi=norm_doi,
                pmid=norm_pmid,
                pmcid=None,
                content_hash=None,
                source_url=spec.source_url,
                title=spec.title,
                authors=list(spec.authors),
                journal=spec.journal,
                published_year=spec.published_year,
                origin=CandidateOrigin.SEED_BATCH,
                access_level=spec.access_level,
                critical_sheet=spec.to_critical_sheet(),
                monthly_cut_run_id=run.id,
            )
            if norm_doi:
                existing_dois.add(norm_doi)
            if norm_pmid:
                existing_pmids.add(norm_pmid)
            created += 1

        await self._monthly_cut_repo.update_run(
            run_id=run.id,
            status=MonthlyCutStatus.COMPLETED,
            sources=["Seed Catalog (Meta-Analyses & ISSN Position Stands)"],
            collected_count=len(FOUNDATIONAL_SEED_BATCH),
            filtered_count=created,
            analyzed_count=created,
            checkpoint_cursor={"seed_created": created, "seed_skipped": skipped},
            finished_at=datetime.now(UTC),
        )
        await commit()

        return SeedBatchResult(
            run_id=run.id,
            total_in_catalog=len(FOUNDATIONAL_SEED_BATCH),
            created_count=created,
            skipped_count=skipped,
        )


class ListMonthlyCutRunsUseCase:
    def __init__(self, repo: MonthlyCutRepositoryPort) -> None:
        self._repo = repo

    async def execute(self, *, auth: AuthContext, limit: int = 50) -> list[MonthlyCutRun]:
        auth.require_curator()
        return await self._repo.list_runs(limit=limit)


class GetMonthlyCutRunUseCase:
    def __init__(self, repo: MonthlyCutRepositoryPort) -> None:
        self._repo = repo

    async def execute(self, *, auth: AuthContext, run_id: UUID) -> MonthlyCutRun:
        auth.require_curator()
        run = await self._repo.get_run(run_id)
        if run is None:
            raise MonthlyCutNotFoundError("Ejecución de Corte Mensual no encontrada.")
        return run


class ListTrendingTopicsUseCase:
    def __init__(self, repo: MonthlyCutRepositoryPort) -> None:
        self._repo = repo

    async def execute_for_curator(
        self,
        *,
        auth: AuthContext,
        status: TrendingTopicStatus | None = None,
    ) -> list[TrendingTopic]:
        auth.require_curator()
        return await self._repo.list_trending_topics(status=status)

    async def execute_approved_for_athlete(self) -> list[TrendingTopic]:
        return await self._repo.list_trending_topics(status=TrendingTopicStatus.APPROVED_CONTEXT)


class ReviewTrendingTopicUseCase:
    def __init__(self, repo: MonthlyCutRepositoryPort) -> None:
        self._repo = repo

    async def execute(
        self,
        *,
        auth: AuthContext,
        topic_id: UUID,
        decision: TrendingTopicStatus,
    ) -> TrendingTopic:
        auth.require_curator()
        if decision not in {TrendingTopicStatus.APPROVED_CONTEXT, TrendingTopicStatus.DISMISSED}:
            raise MonthlyCutValidationError(
                "La decisión sobre un Tema de Actualidad debe ser 'approved_context' o 'dismissed'."
            )
        existing = await self._repo.get_trending_topic(topic_id)
        if existing is None:
            raise TrendingTopicNotFoundError("Tema de Actualidad no encontrado.")
        return await self._repo.update_trending_topic_status(topic_id=topic_id, status=decision)
