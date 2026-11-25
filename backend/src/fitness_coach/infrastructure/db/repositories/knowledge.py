"""SQLAlchemy 2 async repository for Knowledge Base & Curator Inbox (pgvector + tsvector RRF)."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from fitness_coach.domain.knowledge import (
    EVIDENCE_HIERARCHY_WEIGHTS,
    VALIDITY_PRIORITY_MULTIPLIER,
    AccessLevel,
    CandidateNotFoundError,
    CandidateOrigin,
    CandidateStatus,
    CandidateStudy,
    CriticalSheet6Blocks,
    EvidenceCard,
    EvidenceCardDetail,
    EvidenceCardNotFoundError,
    EvidenceCoverage,
    EvidenceLevel,
    EvidenceRelation,
    EvidenceSearchHit,
    RelationType,
    ValidityStatus,
    validate_safe_http_url,
)
from fitness_coach.infrastructure.db.models.knowledge import (
    CandidateStudyModel,
    EvidenceCardModel,
    EvidenceRelationModel,
)

RRF_K = 60


def _candidate_to_domain(row: CandidateStudyModel) -> CandidateStudy:
    return CandidateStudy(
        id=row.id,
        doi=row.doi,
        pmid=row.pmid,
        pmcid=row.pmcid,
        content_hash=row.content_hash,
        source_url=row.source_url,
        title=row.title,
        authors=tuple(row.authors or []),
        journal=row.journal,
        published_year=row.published_year,
        origin=CandidateOrigin(row.origin),
        access_level=AccessLevel(row.access_level),
        critical_sheet=CriticalSheet6Blocks.from_dict(row.critical_sheet),
        previous_critical_sheet=(
            CriticalSheet6Blocks.from_dict(row.previous_critical_sheet)
            if row.previous_critical_sheet
            else None
        ),
        status=CandidateStatus(row.status),
        rejection_reason=row.rejection_reason,
        curator_notes=row.curator_notes,
        pdf_storage_path=row.pdf_storage_path,
        monthly_cut_run_id=row.monthly_cut_run_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _card_to_domain(row: EvidenceCardModel) -> EvidenceCard:
    return EvidenceCard(
        id=row.id,
        candidate_study_id=row.candidate_study_id,
        doi=row.doi,
        pmid=row.pmid,
        source_url=row.source_url,
        title=row.title,
        evidence_level=EvidenceLevel(row.evidence_level),
        coverage=EvidenceCoverage(row.coverage),
        curated_text_es=row.curated_text_es,
        key_terms_en=tuple(row.key_terms_en or []),
        tags=tuple(row.tags or []),
        curator_notes=row.curator_notes,
        validity_status=ValidityStatus(row.validity_status),
        embedding_model=row.embedding_model,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _relation_to_domain(row: EvidenceRelationModel) -> EvidenceRelation:
    return EvidenceRelation(
        id=row.id,
        source_card_id=row.source_card_id,
        target_card_id=row.target_card_id,
        relation_type=RelationType(row.relation_type),
        rationale=row.rationale,
        created_at=row.created_at,
    )


def _build_search_tsv_expression(
    *,
    title: str,
    curated_text_es: str,
    key_terms_en: list[str],
    tags: list[str],
    curator_notes: str | None,
):
    """Build weighted bilingual + exact-acronym tsvector expression in PostgreSQL."""
    terms_str = " ".join(key_terms_en)
    tags_str = " ".join(tags)
    notes_str = curator_notes or ""

    vec_es = func.setweight(
        func.to_tsvector("spanish", f"{title} {curated_text_es}"),
        literal_column("'A'::\"char\""),
    )
    vec_simple = func.setweight(
        func.to_tsvector("simple", f"{title} {terms_str} {tags_str} {curated_text_es}"),
        literal_column("'A'::\"char\""),
    )
    vec_en = func.setweight(
        func.to_tsvector("english", f"{title} {terms_str}"),
        literal_column("'B'::\"char\""),
    )
    vec_notes = func.setweight(
        func.to_tsvector("spanish", notes_str),
        literal_column("'C'::\"char\""),
    )
    return vec_es.op("||")(vec_simple).op("||")(vec_en).op("||")(vec_notes)


class SqlAlchemyKnowledgeRepository:
    """Async PostgreSQL repository with pgvector cosine + weighted tsvector RRF search."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_candidate(
        self,
        *,
        doi: str | None,
        pmid: str | None,
        pmcid: str | None,
        content_hash: str | None,
        source_url: str | None,
        title: str,
        authors: list[str],
        journal: str | None,
        published_year: int | None,
        origin: CandidateOrigin,
        access_level: AccessLevel,
        critical_sheet: CriticalSheet6Blocks,
        pdf_storage_path: str | None = None,
        monthly_cut_run_id: UUID | None = None,
    ) -> CandidateStudy:
        safe_url = validate_safe_http_url(source_url)
        model = CandidateStudyModel(
            doi=doi,
            pmid=pmid,
            pmcid=pmcid,
            content_hash=content_hash,
            source_url=safe_url,
            title=title,
            authors=list(authors),
            journal=journal,
            published_year=published_year,
            origin=origin.value,
            access_level=access_level.value,
            critical_sheet=critical_sheet.to_dict(),
            previous_critical_sheet=None,
            status=CandidateStatus.PENDING.value,
            pdf_storage_path=pdf_storage_path,
            monthly_cut_run_id=monthly_cut_run_id,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _candidate_to_domain(model)

    async def get_candidate_by_id(self, candidate_id: UUID) -> CandidateStudy | None:
        result = await self._session.execute(
            select(CandidateStudyModel).where(CandidateStudyModel.id == candidate_id)
        )
        row = result.scalar_one_or_none()
        return _candidate_to_domain(row) if row else None

    async def find_candidate_by_identifiers(
        self,
        *,
        doi: str | None = None,
        pmid: str | None = None,
        content_hash: str | None = None,
    ) -> CandidateStudy | None:
        conditions = []
        if doi:
            conditions.append(CandidateStudyModel.doi == doi)
        if pmid:
            conditions.append(CandidateStudyModel.pmid == pmid)
        if content_hash:
            conditions.append(CandidateStudyModel.content_hash == content_hash)
        if not conditions:
            return None
        result = await self._session.execute(
            select(CandidateStudyModel)
            .where(or_(*conditions))
            .order_by(CandidateStudyModel.created_at.desc())
            .limit(1)
        )
        row = result.scalar_one_or_none()
        return _candidate_to_domain(row) if row else None

    async def list_candidates(
        self, *, status: CandidateStatus | None = None
    ) -> list[CandidateStudy]:
        stmt = select(CandidateStudyModel).order_by(CandidateStudyModel.created_at.desc())
        if status is not None:
            stmt = stmt.where(CandidateStudyModel.status == status.value)
        result = await self._session.execute(stmt)
        return [_candidate_to_domain(row) for row in result.scalars().all()]

    async def update_candidate_pdf_analysis(
        self,
        *,
        candidate_id: UUID,
        access_level: AccessLevel,
        critical_sheet: CriticalSheet6Blocks,
        previous_critical_sheet: CriticalSheet6Blocks,
        pdf_storage_path: str,
        content_hash: str,
    ) -> CandidateStudy:
        result = await self._session.execute(
            select(CandidateStudyModel).where(CandidateStudyModel.id == candidate_id)
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise CandidateNotFoundError("No se encontró el Estudio Candidato solicitado.")
        row.access_level = access_level.value
        row.previous_critical_sheet = previous_critical_sheet.to_dict()
        row.critical_sheet = critical_sheet.to_dict()
        row.pdf_storage_path = pdf_storage_path
        row.content_hash = content_hash
        row.updated_at = datetime.now(UTC)
        await self._session.flush()
        await self._session.refresh(row)
        return _candidate_to_domain(row)

    async def reopen_rejected_candidate(
        self,
        *,
        candidate_id: UUID,
        title: str,
        source_url: str | None,
        authors: list[str],
        journal: str | None,
        published_year: int | None,
        doi: str | None,
        pmid: str | None,
        pmcid: str | None,
        origin: CandidateOrigin,
        access_level: AccessLevel,
        critical_sheet: CriticalSheet6Blocks,
        pdf_storage_path: str | None,
        content_hash: str | None,
    ) -> CandidateStudy:
        safe_url = validate_safe_http_url(source_url)
        result = await self._session.execute(
            select(CandidateStudyModel).where(CandidateStudyModel.id == candidate_id)
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise CandidateNotFoundError("No se encontró el Estudio Candidato solicitado.")
        row.title = title
        row.source_url = safe_url
        row.authors = list(authors)
        row.journal = journal
        row.published_year = published_year
        row.doi = doi
        row.pmid = pmid
        row.pmcid = pmcid
        row.origin = origin.value
        row.previous_critical_sheet = row.critical_sheet
        row.critical_sheet = critical_sheet.to_dict()
        row.access_level = access_level.value
        if pdf_storage_path:
            row.pdf_storage_path = pdf_storage_path
        if content_hash:
            row.content_hash = content_hash
        row.status = CandidateStatus.PENDING.value
        row.rejection_reason = None
        row.updated_at = datetime.now(UTC)
        await self._session.flush()
        await self._session.refresh(row)
        return _candidate_to_domain(row)

    async def mark_candidate_rejected(
        self, *, candidate_id: UUID, rejection_reason: str
    ) -> CandidateStudy:
        result = await self._session.execute(
            select(CandidateStudyModel).where(CandidateStudyModel.id == candidate_id)
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise CandidateNotFoundError("No se encontró el Estudio Candidato solicitado.")
        row.status = CandidateStatus.REJECTED.value
        row.rejection_reason = rejection_reason.strip()
        row.updated_at = datetime.now(UTC)
        await self._session.flush()
        await self._session.refresh(row)
        return _candidate_to_domain(row)

    async def mark_candidate_approved(
        self, *, candidate_id: UUID, curator_notes: str | None
    ) -> CandidateStudy:
        result = await self._session.execute(
            select(CandidateStudyModel).where(CandidateStudyModel.id == candidate_id)
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise CandidateNotFoundError("No se encontró el Estudio Candidato solicitado.")
        row.status = CandidateStatus.APPROVED.value
        if curator_notes is not None:
            row.curator_notes = curator_notes
        row.updated_at = datetime.now(UTC)
        await self._session.flush()
        await self._session.refresh(row)
        return _candidate_to_domain(row)

    async def create_evidence_card(
        self,
        *,
        candidate_study_id: UUID,
        doi: str | None,
        pmid: str | None,
        source_url: str | None,
        title: str,
        evidence_level: EvidenceLevel,
        coverage: EvidenceCoverage,
        curated_text_es: str,
        key_terms_en: list[str],
        tags: list[str],
        curator_notes: str | None,
        validity_status: ValidityStatus,
        embedding: list[float],
        embedding_model: str,
    ) -> EvidenceCard:
        safe_url = validate_safe_http_url(source_url)
        clean_tags = sorted({t.strip().lower() for t in tags if t.strip()})
        clean_terms = list(dict.fromkeys(t.strip() for t in key_terms_en if t.strip()))
        tsv_expr = _build_search_tsv_expression(
            title=title,
            curated_text_es=curated_text_es,
            key_terms_en=clean_terms,
            tags=clean_tags,
            curator_notes=curator_notes,
        )
        model = EvidenceCardModel(
            candidate_study_id=candidate_study_id,
            doi=doi,
            pmid=pmid,
            source_url=safe_url,
            title=title,
            evidence_level=evidence_level.value,
            coverage=coverage.value,
            curated_text_es=curated_text_es,
            key_terms_en=clean_terms,
            tags=clean_tags,
            curator_notes=curator_notes,
            validity_status=validity_status.value,
            embedding=embedding,
            embedding_model=embedding_model,
            search_tsv=tsv_expr,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _card_to_domain(model)

    async def get_evidence_card_by_id(self, card_id: UUID) -> EvidenceCard | None:
        result = await self._session.execute(
            select(EvidenceCardModel).where(EvidenceCardModel.id == card_id)
        )
        row = result.scalar_one_or_none()
        return _card_to_domain(row) if row else None

    async def get_evidence_card_detail(self, card_id: UUID) -> EvidenceCardDetail | None:
        card = await self.get_evidence_card_by_id(card_id)
        if card is None:
            return None
        outgoing_rows = (
            (
                await self._session.execute(
                    select(EvidenceRelationModel)
                    .where(EvidenceRelationModel.source_card_id == card_id)
                    .order_by(EvidenceRelationModel.created_at.asc())
                )
            )
            .scalars()
            .all()
        )
        incoming_rows = (
            (
                await self._session.execute(
                    select(EvidenceRelationModel)
                    .where(EvidenceRelationModel.target_card_id == card_id)
                    .order_by(EvidenceRelationModel.created_at.asc())
                )
            )
            .scalars()
            .all()
        )

        updating_source_ids = [
            rel.source_card_id
            for rel in incoming_rows
            if rel.relation_type in (RelationType.NUANCES.value, RelationType.SUPERSEDES.value)
        ]
        updated_by: list[EvidenceCard] = []
        if updating_source_ids:
            upd_rows = (
                (
                    await self._session.execute(
                        select(EvidenceCardModel).where(
                            EvidenceCardModel.id.in_(updating_source_ids)
                        )
                    )
                )
                .scalars()
                .all()
            )
            updated_by = [_card_to_domain(r) for r in upd_rows]

        return EvidenceCardDetail(
            card=card,
            outgoing_relations=tuple(_relation_to_domain(r) for r in outgoing_rows),
            incoming_relations=tuple(_relation_to_domain(r) for r in incoming_rows),
            updated_by_cards=tuple(updated_by),
        )

    async def update_evidence_card(
        self,
        *,
        card_id: UUID,
        curator_notes: str | None,
        tags: list[str] | None,
        validity_status: ValidityStatus | None,
        curated_text_es: str | None,
        key_terms_en: list[str] | None,
        embedding: list[float] | None,
        embedding_model: str | None,
    ) -> EvidenceCard:
        result = await self._session.execute(
            select(EvidenceCardModel).where(EvidenceCardModel.id == card_id)
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise EvidenceCardNotFoundError("No se encontró la Ficha de Evidencia solicitada.")

        if curator_notes is not None:
            row.curator_notes = curator_notes
        if tags is not None:
            row.tags = sorted({t.strip().lower() for t in tags if t.strip()})
        if validity_status is not None:
            row.validity_status = validity_status.value
        if curated_text_es is not None:
            row.curated_text_es = curated_text_es
        if key_terms_en is not None:
            row.key_terms_en = list(dict.fromkeys(t.strip() for t in key_terms_en if t.strip()))
        if embedding is not None and embedding_model is not None:
            row.embedding = embedding
            row.embedding_model = embedding_model

        row.search_tsv = _build_search_tsv_expression(
            title=row.title,
            curated_text_es=row.curated_text_es,
            key_terms_en=list(row.key_terms_en or []),
            tags=list(row.tags or []),
            curator_notes=row.curator_notes,
        )
        row.updated_at = datetime.now(UTC)
        await self._session.flush()
        await self._session.refresh(row)
        return _card_to_domain(row)

    async def create_relation(
        self,
        *,
        source_card_id: UUID,
        target_card_id: UUID,
        relation_type: RelationType,
        rationale: str | None,
    ) -> EvidenceRelation:
        existing = (
            await self._session.execute(
                select(EvidenceRelationModel).where(
                    EvidenceRelationModel.source_card_id == source_card_id,
                    EvidenceRelationModel.target_card_id == target_card_id,
                    EvidenceRelationModel.relation_type == relation_type.value,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            return _relation_to_domain(existing)

        model = EvidenceRelationModel(
            source_card_id=source_card_id,
            target_card_id=target_card_id,
            relation_type=relation_type.value,
            rationale=rationale,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _relation_to_domain(model)

    async def hybrid_search(
        self,
        *,
        query: str | None,
        query_embedding: list[float] | None,
        query_embedding_model: str | None,
        tags: list[str] | None = None,
        evidence_level: EvidenceLevel | None = None,
        validity_status: ValidityStatus | None = None,
        limit: int = 20,
    ) -> list[EvidenceSearchHit]:
        def _apply_filters(stmt):
            if tags:
                clean_tags = [t.strip().lower() for t in tags if t.strip()]
                if clean_tags:
                    stmt = stmt.where(EvidenceCardModel.tags.overlap(clean_tags))
            if evidence_level is not None:
                stmt = stmt.where(EvidenceCardModel.evidence_level == evidence_level.value)
            if validity_status is not None:
                stmt = stmt.where(EvidenceCardModel.validity_status == validity_status.value)
            return stmt

        clean_query = (query or "").strip()
        if not clean_query:
            stmt = _apply_filters(select(EvidenceCardModel)).order_by(
                EvidenceCardModel.created_at.desc()
            )
            rows = (await self._session.execute(stmt.limit(limit * 2))).scalars().all()
            cards = [_card_to_domain(r) for r in rows]
            cards.sort(
                key=lambda c: (
                    VALIDITY_PRIORITY_MULTIPLIER[c.validity_status],
                    EVIDENCE_HIERARCHY_WEIGHTS[c.evidence_level],
                    c.created_at.timestamp(),
                ),
                reverse=True,
            )
            selected = cards[:limit]
            updating_map = await self._fetch_updating_cards_map([c.id for c in selected])
            return [
                EvidenceSearchHit(
                    card=c,
                    score=round(
                        VALIDITY_PRIORITY_MULTIPLIER[c.validity_status]
                        * EVIDENCE_HIERARCHY_WEIGHTS[c.evidence_level],
                        6,
                    ),
                    vector_rank=None,
                    lexical_rank=None,
                    updated_by_cards=tuple(updating_map.get(c.id, [])),
                )
                for c in selected
            ]

        candidate_pool = max(limit * 3, 50)
        vector_ranks: dict[UUID, int] = {}
        vector_similarities: dict[UUID, float] = {}
        lexical_ranks: dict[UUID, int] = {}
        cards_by_id: dict[UUID, EvidenceCard] = {}

        # 1. Semantic vector search via pgvector cosine distance
        if query_embedding is not None:
            distance_expr = EvidenceCardModel.embedding.cosine_distance(query_embedding)
            vec_stmt = _apply_filters(
                select(EvidenceCardModel, distance_expr.label("distance"))
            ).where(func.vector_dims(EvidenceCardModel.embedding) == len(query_embedding))
            if query_embedding_model:
                vec_stmt = vec_stmt.where(
                    EvidenceCardModel.embedding_model == query_embedding_model
                )
            vec_stmt = vec_stmt.order_by(distance_expr.asc()).limit(candidate_pool)
            vec_rows = (await self._session.execute(vec_stmt)).all()
            for rank, (model_row, distance) in enumerate(vec_rows, start=1):
                similarity = 1.0 - float(distance)
                if similarity <= 0.15:
                    continue
                card = _card_to_domain(model_row)
                cards_by_id[card.id] = card
                vector_ranks[card.id] = rank
                vector_similarities[card.id] = similarity

        # 2. Lexical weighted tsvector search (Spanish + English + exact simple acronyms)
        tsq_es = func.websearch_to_tsquery("spanish", clean_query)
        tsq_en = func.websearch_to_tsquery("english", clean_query)
        tsq_simple = func.plainto_tsquery("simple", clean_query)
        combined_tsq = tsq_es.op("||")(tsq_en).op("||")(tsq_simple)
        lex_rank_expr = func.ts_rank_cd(EvidenceCardModel.search_tsv, combined_tsq)

        lex_stmt = _apply_filters(
            select(EvidenceCardModel, lex_rank_expr.label("lex_score"))
        ).where(EvidenceCardModel.search_tsv.op("@@")(combined_tsq))
        lex_stmt = lex_stmt.order_by(lex_rank_expr.desc()).limit(candidate_pool)
        lex_rows = (await self._session.execute(lex_stmt)).all()
        for rank, (model_row, _lex_score) in enumerate(lex_rows, start=1):
            card = _card_to_domain(model_row)
            cards_by_id[card.id] = card
            lexical_ranks[card.id] = rank

        # 3. Reciprocal Rank Fusion (RRF) + Validity & Evidence Hierarchy priority
        scored: list[tuple[float, UUID]] = []
        for card_id, card in cards_by_id.items():
            v_rank = vector_ranks.get(card_id)
            l_rank = lexical_ranks.get(card_id)
            rrf = (1.0 / (RRF_K + v_rank) if v_rank is not None else 0.0) + (
                1.0 / (RRF_K + l_rank) if l_rank is not None else 0.0
            )
            validity_mult = VALIDITY_PRIORITY_MULTIPLIER[card.validity_status]
            hierarchy_factor = 0.85 + 0.15 * EVIDENCE_HIERARCHY_WEIGHTS[card.evidence_level]
            final_score = rrf * validity_mult * hierarchy_factor
            scored.append((final_score, card_id))

        scored.sort(key=lambda item: item[0], reverse=True)
        top_ids = [cid for _, cid in scored[:limit]]
        updating_map = await self._fetch_updating_cards_map(top_ids)

        return [
            EvidenceSearchHit(
                card=cards_by_id[cid],
                score=round(score, 6),
                vector_rank=vector_ranks.get(cid),
                lexical_rank=lexical_ranks.get(cid),
                updated_by_cards=tuple(updating_map.get(cid, [])),
            )
            for score, cid in scored[:limit]
        ]

    async def _fetch_updating_cards_map(
        self, card_ids: list[UUID]
    ) -> dict[UUID, list[EvidenceCard]]:
        if not card_ids:
            return {}
        rel_rows = (
            (
                await self._session.execute(
                    select(EvidenceRelationModel).where(
                        EvidenceRelationModel.target_card_id.in_(card_ids),
                        EvidenceRelationModel.relation_type.in_(
                            [RelationType.NUANCES.value, RelationType.SUPERSEDES.value]
                        ),
                    )
                )
            )
            .scalars()
            .all()
        )
        if not rel_rows:
            return {}
        source_ids = list({r.source_card_id for r in rel_rows})
        source_rows = (
            (
                await self._session.execute(
                    select(EvidenceCardModel).where(EvidenceCardModel.id.in_(source_ids))
                )
            )
            .scalars()
            .all()
        )
        source_by_id = {r.id: _card_to_domain(r) for r in source_rows}
        result: dict[UUID, list[EvidenceCard]] = {}
        for rel in rel_rows:
            src = source_by_id.get(rel.source_card_id)
            if src is not None:
                result.setdefault(rel.target_card_id, []).append(src)
        return result

    async def list_all_evidence_cards(self) -> list[EvidenceCard]:
        rows = (
            (
                await self._session.execute(
                    select(EvidenceCardModel).order_by(EvidenceCardModel.created_at.asc())
                )
            )
            .scalars()
            .all()
        )
        return [_card_to_domain(r) for r in rows]

    async def update_card_embedding(
        self, *, card_id: UUID, embedding: list[float], embedding_model: str
    ) -> None:
        result = await self._session.execute(
            select(EvidenceCardModel).where(EvidenceCardModel.id == card_id)
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise EvidenceCardNotFoundError("No se encontró la Ficha de Evidencia solicitada.")
        row.embedding = embedding
        row.embedding_model = embedding_model
        row.updated_at = datetime.now(UTC)
        await self._session.flush()
