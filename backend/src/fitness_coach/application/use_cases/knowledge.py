"""Application use cases for Knowledge Base & Curator Inbox (#4)."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from fitness_coach.application.ports.ai_provider import AIProviderPort, ModelTier
from fitness_coach.application.ports.identity_storage import BinaryStoragePort
from fitness_coach.application.ports.repositories.knowledge import KnowledgeRepositoryPort
from fitness_coach.application.ports.scientific_sources import ScientificSourcesPort
from fitness_coach.domain.identity import AuthContext
from fitness_coach.domain.knowledge import (
    PAYWALL_WARNING_LABEL,
    AccessLevel,
    CandidateNotFoundError,
    CandidateOrigin,
    CandidateStatus,
    CandidateStudy,
    CriticalSheet6Blocks,
    DuplicateActiveStudyError,
    DuplicateRejectedStudyError,
    EvidenceCard,
    EvidenceCardDetail,
    EvidenceCardNotFoundError,
    EvidenceCoverage,
    EvidenceLevel,
    EvidenceSearchHit,
    KnowledgeValidationError,
    RelationType,
    ScientificSourceNotFoundError,
    ValidityStatus,
    compute_content_hash,
    normalize_doi,
    normalize_pmid,
    validate_evidence_relation,
    validate_safe_http_url,
)
from fitness_coach.infrastructure.scientific.pdf_extractor import extract_pdf_text


def _build_embedding_input(
    *, title: str, curated_text_es: str, key_terms_en: list[str], tags: list[str]
) -> str:
    parts = [title.strip(), curated_text_es.strip()]
    if key_terms_en:
        parts.append(" ".join(key_terms_en))
    if tags:
        parts.append(" ".join(tags))
    return "\n".join(p for p in parts if p)


async def check_existing_candidate_for_proposal(
    *,
    repo: KnowledgeRepositoryPort,
    doi: str | None = None,
    pmid: str | None = None,
    content_hash: str | None = None,
    allow_reopen: bool = False,
) -> CandidateStudy | None:
    """Shared deduplication & rejection-history guard for CandidateStudy creation/promotion.

    Returns the prior rejected CandidateStudy only when `allow_reopen=True`.
    Raises DuplicateRejectedStudyError if previously rejected and `allow_reopen=False`.
    Raises DuplicateActiveStudyError if already pending or approved.
    """
    existing = await repo.find_candidate_by_identifiers(
        doi=doi,
        pmid=pmid,
        content_hash=content_hash,
    )
    if existing is None:
        return None
    if existing.status == CandidateStatus.REJECTED:
        if not allow_reopen:
            raise DuplicateRejectedStudyError(prior_candidate=existing)
        return existing
    if existing.status == CandidateStatus.APPROVED:
        raise DuplicateActiveStudyError(
            "Este estudio ya forma parte de la Base de Conocimiento aprobada."
        )
    raise DuplicateActiveStudyError(
        "Este estudio ya está en la Bandeja del Curador como Estudio Candidato."
    )


async def generate_critical_sheet(
    *,
    ai_provider: AIProviderPort,
    title: str,
    authors: list[str],
    journal: str | None,
    published_year: int | None,
    doi: str | None,
    pmid: str | None,
    source_url: str | None,
    access_level: AccessLevel,
    source_text: str,
) -> CriticalSheet6Blocks:
    """Generate mandatory 6-block critical sheet via AIProviderPort with structured validation."""
    is_abstract_only = access_level == AccessLevel.ABSTRACT_ONLY_PAYWALL
    access_instruction = (
        f"IMPORTANTE: {PAYWALL_WARNING_LABEL}. Limita estrictamente todas las conclusiones "
        "a lo demostrable en el abstract y declara la ausencia de texto completo en el bloque 5."
        if is_abstract_only
        else (
            "Dispones del texto completo del estudio; extrae protocolo, n, "
            "tamaños del efecto y limitaciones."
        )
    )
    system_prompt = (
        "Eres un analista crítico de ciencias del deporte, hipertrofia y nutrición deportiva. "
        "Genera obligatoriamente la ficha crítica de 6 bloques en español para el Curador. "
        + access_instruction
    )
    user_prompt = (
        f"Título: {title}\n"
        f"Autores: {', '.join(authors) if authors else 'No especificados'}\n"
        f"Revista/Año: {journal or 'N/D'} ({published_year or 'N/D'})\n"
        f"DOI: {doi or 'N/D'} | PMID: {pmid or 'N/D'} | URL: {source_url or 'N/D'}\n"
        f"Nivel de acceso: {access_level.value}\n\n"
        f"Texto disponible:\n{source_text[:8000]}"
    )
    response = await ai_provider.generate(
        tier=ModelTier.REASONING,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        json_schema={"type": "object", "title": "CriticalSheet6Blocks"},
    )
    data = response.structured_data or {}

    id_parts = [title]
    if authors:
        id_parts.append(f"Autores: {', '.join(authors[:5])}")
    if journal or published_year:
        id_parts.append(f"{journal or ''} ({published_year or 's.f.'})".strip())
    if doi:
        id_parts.append(f"DOI: {doi} (https://doi.org/{doi})")
    if pmid:
        id_parts.append(f"PubMed: https://pubmed.ncbi.nlm.nih.gov/{pmid}/")
    elif source_url:
        id_parts.append(f"Enlace: {source_url}")
    default_b1 = " | ".join(id_parts)

    excerpt = " ".join(source_text.strip().split())[:420] or title
    default_b2 = (
        "Diseño identificado a partir del texto del estudio "
        f"({'evaluación limitada al abstract' if is_abstract_only else 'texto completo revisado'})."
    )
    default_b3 = (
        f"Población, muestra (n) y protocolo extraídos: {excerpt}"
        if not is_abstract_only
        else f"Datos de muestra y protocolo limitados al abstract disponible: {excerpt}"
    )
    default_b4 = (
        f"Hallazgos clave y aplicabilidad práctica basados en texto completo: {excerpt}"
        if not is_abstract_only
        else (
            "Hallazgos preliminares limitados exclusivamente a lo demostrable en el abstract "
            f"(pendiente de verificación con texto completo): {excerpt}"
        )
    )
    default_b5 = (
        f"{PAYWALL_WARNING_LABEL}. No se dispone del texto completo para auditar "
        "tamaño de muestra completo, sesgos metodológicos ni conflictos de interés."
        if is_abstract_only
        else (
            "Revisar tamaño muestral, adherencia, duración de intervención "
            "y posibles conflictos de interés."
        )
    )
    default_b6 = (
        "Pendiente de contraste por el Curador frente a las Fichas de Evidencia existentes "
        "(confirmar, matizar o superar evidencia previa)."
    )

    raw_level = str(
        data.get("suggested_evidence_level") or _infer_evidence_level(title, source_text)
    )
    try:
        suggested_level = EvidenceLevel(raw_level)
    except ValueError:
        suggested_level = EvidenceLevel.RCT

    b5_value = str(data.get("block_5_limitations_and_conflicts") or default_b5)
    if is_abstract_only and "abstract" not in b5_value.lower():
        b5_value = f"{PAYWALL_WARNING_LABEL}. {b5_value}"

    return CriticalSheet6Blocks(
        block_1_identification=str(data.get("block_1_identification") or default_b1),
        block_2_design_and_evidence_level=str(
            data.get("block_2_design_and_evidence_level") or default_b2
        ),
        block_3_population_and_protocol=str(
            data.get("block_3_population_and_protocol") or default_b3
        ),
        block_4_key_findings_and_applicability=str(
            data.get("block_4_key_findings_and_applicability") or default_b4
        ),
        block_5_limitations_and_conflicts=b5_value,
        block_6_impact_vs_existing_kb=str(data.get("block_6_impact_vs_existing_kb") or default_b6),
        suggested_evidence_level=suggested_level,
        suggested_tags=tuple(str(t) for t in (data.get("suggested_tags") or [])),
        key_terms_en=tuple(
            str(t) for t in (data.get("key_terms_en") or _extract_key_terms(title, source_text))
        ),
        curated_summary_es=str(data.get("curated_summary_es") or default_b4),
    )


def _infer_evidence_level(title: str, text: str) -> str:
    combined = f"{title} {text}".lower()
    if "meta-analysis" in combined or "meta-análisis" in combined or "metaanalysis" in combined:
        return EvidenceLevel.META_ANALYSIS.value
    if "position stand" in combined or "issn" in combined:
        return EvidenceLevel.POSITION_STAND.value
    if "systematic review" in combined or "revisión sistemática" in combined:
        return EvidenceLevel.SYSTEMATIC_REVIEW.value
    if "randomized" in combined or "randomised" in combined or "rct" in combined:
        return EvidenceLevel.RCT.value
    if "preprint" in combined or "sportrxiv" in combined:
        return EvidenceLevel.PREPRINT.value
    return EvidenceLevel.CONTROLLED_TRIAL.value


def _extract_key_terms(title: str, text: str) -> list[str]:
    known_acronyms = ("RIR", "1RM", "HMB", "ISSN", "mTOR", "RPE", "DXA", "MPS")
    combined = f"{title} {text}"
    found = [ac for ac in known_acronyms if ac.lower() in combined.lower()]
    if title.strip():
        found.append(title.strip()[:120])
    return list(dict.fromkeys(found))


class ListCandidatesUseCase:
    def __init__(self, repo: KnowledgeRepositoryPort) -> None:
        self._repo = repo

    async def execute(
        self, *, auth: AuthContext, status: CandidateStatus | None = None
    ) -> list[CandidateStudy]:
        auth.require_curator()
        return await self._repo.list_candidates(status=status)


class GetCandidateUseCase:
    def __init__(self, repo: KnowledgeRepositoryPort) -> None:
        self._repo = repo

    async def execute(self, *, auth: AuthContext, candidate_id: UUID) -> CandidateStudy:
        auth.require_curator()
        candidate = await self._repo.get_candidate_by_id(candidate_id)
        if candidate is None:
            raise CandidateNotFoundError("No se encontró el Estudio Candidato solicitado.")
        return candidate


class ProposeCandidateFromDoiUseCase:
    def __init__(
        self,
        *,
        repo: KnowledgeRepositoryPort,
        scientific_sources: ScientificSourcesPort,
        ai_provider: AIProviderPort,
    ) -> None:
        self._repo = repo
        self._scientific_sources = scientific_sources
        self._ai_provider = ai_provider

    async def execute(
        self,
        *,
        auth: AuthContext,
        doi_or_url: str,
        allow_reopen: bool = False,
    ) -> CandidateStudy:
        auth.require_curator()
        normalized_doi = normalize_doi(doi_or_url)
        if not normalized_doi:
            raise KnowledgeValidationError("Debes proporcionar un DOI o enlace válido.")

        article = await self._scientific_sources.fetch_by_doi(normalized_doi)
        if article is None:
            raise ScientificSourceNotFoundError(
                f"No se encontró ningún estudio científico para el DOI '{normalized_doi}'."
            )

        doi = normalize_doi(article.doi) or normalized_doi
        pmid = normalize_pmid(article.pmid)
        safe_url = validate_safe_http_url(article.source_url)
        existing_rejected = await check_existing_candidate_for_proposal(
            repo=self._repo,
            doi=doi,
            pmid=pmid,
            allow_reopen=allow_reopen,
        )
        if existing_rejected is not None:
            access_level = (
                AccessLevel.FULL_TEXT_OPEN_ACCESS
                if article.is_open_access and article.full_text
                else AccessLevel.ABSTRACT_ONLY_PAYWALL
            )
            source_text = (
                article.full_text
                if access_level == AccessLevel.FULL_TEXT_OPEN_ACCESS and article.full_text
                else (article.abstract or article.title)
            )
            sheet = await generate_critical_sheet(
                ai_provider=self._ai_provider,
                title=article.title,
                authors=list(article.authors),
                journal=article.journal,
                published_year=article.published_year,
                doi=doi,
                pmid=pmid,
                source_url=safe_url,
                access_level=access_level,
                source_text=source_text,
            )
            return await self._repo.reopen_rejected_candidate(
                candidate_id=existing_rejected.id,
                title=article.title,
                source_url=safe_url,
                authors=list(article.authors),
                journal=article.journal,
                published_year=article.published_year,
                doi=doi,
                pmid=pmid,
                pmcid=article.pmcid,
                origin=CandidateOrigin.MANUAL_UPLOAD,
                access_level=access_level,
                critical_sheet=sheet,
                pdf_storage_path=None,
                content_hash=compute_content_hash(source_text),
            )

        access_level = (
            AccessLevel.FULL_TEXT_OPEN_ACCESS
            if article.is_open_access and article.full_text
            else AccessLevel.ABSTRACT_ONLY_PAYWALL
        )
        source_text = (
            article.full_text
            if access_level == AccessLevel.FULL_TEXT_OPEN_ACCESS and article.full_text
            else (article.abstract or article.title)
        )
        sheet = await generate_critical_sheet(
            ai_provider=self._ai_provider,
            title=article.title,
            authors=list(article.authors),
            journal=article.journal,
            published_year=article.published_year,
            doi=doi,
            pmid=pmid,
            source_url=safe_url,
            access_level=access_level,
            source_text=source_text,
        )
        return await self._repo.create_candidate(
            doi=doi,
            pmid=pmid,
            pmcid=article.pmcid,
            content_hash=compute_content_hash(source_text),
            source_url=safe_url,
            title=article.title,
            authors=list(article.authors),
            journal=article.journal,
            published_year=article.published_year,
            origin=CandidateOrigin.MANUAL_UPLOAD,
            access_level=access_level,
            critical_sheet=sheet,
        )


class ProposeCandidateFromPdfUseCase:
    def __init__(
        self,
        *,
        repo: KnowledgeRepositoryPort,
        binary_storage: BinaryStoragePort,
        ai_provider: AIProviderPort,
    ) -> None:
        self._repo = repo
        self._binary_storage = binary_storage
        self._ai_provider = ai_provider

    async def execute(
        self,
        *,
        auth: AuthContext,
        filename: str,
        pdf_bytes: bytes,
        title: str | None = None,
        doi: str | None = None,
        allow_reopen: bool = False,
    ) -> CandidateStudy:
        auth.require_curator()
        extracted_text = extract_pdf_text(pdf_bytes)
        normalized_doi = normalize_doi(doi)
        content_hash = compute_content_hash(extracted_text)

        existing_rejected = await check_existing_candidate_for_proposal(
            repo=self._repo,
            doi=normalized_doi,
            content_hash=content_hash,
            allow_reopen=allow_reopen,
        )
        resolved_title = (title or "").strip() or extracted_text.splitlines()[0][:180] or filename
        source_url = f"https://doi.org/{normalized_doi}" if normalized_doi else None
        canonical_key = f"manual/{content_hash}.pdf"

        if existing_rejected is not None:
            storage_path = await self._binary_storage.put_curator_pdf(
                relative_path=canonical_key,
                data=pdf_bytes,
            )
            sheet = await generate_critical_sheet(
                ai_provider=self._ai_provider,
                title=resolved_title,
                authors=[],
                journal=None,
                published_year=None,
                doi=normalized_doi,
                pmid=None,
                source_url=source_url,
                access_level=AccessLevel.FULL_TEXT_UPLOADED_PDF,
                source_text=extracted_text,
            )
            return await self._repo.reopen_rejected_candidate(
                candidate_id=existing_rejected.id,
                title=resolved_title,
                source_url=source_url,
                authors=[],
                journal=None,
                published_year=None,
                doi=normalized_doi,
                pmid=None,
                pmcid=None,
                origin=CandidateOrigin.MANUAL_UPLOAD,
                access_level=AccessLevel.FULL_TEXT_UPLOADED_PDF,
                critical_sheet=sheet,
                pdf_storage_path=storage_path,
                content_hash=content_hash,
            )

        storage_path = await self._binary_storage.put_curator_pdf(
            relative_path=canonical_key,
            data=pdf_bytes,
        )
        sheet = await generate_critical_sheet(
            ai_provider=self._ai_provider,
            title=resolved_title,
            authors=[],
            journal=None,
            published_year=None,
            doi=normalized_doi,
            pmid=None,
            source_url=source_url,
            access_level=AccessLevel.FULL_TEXT_UPLOADED_PDF,
            source_text=extracted_text,
        )
        return await self._repo.create_candidate(
            doi=normalized_doi,
            pmid=None,
            pmcid=None,
            content_hash=content_hash,
            source_url=source_url,
            title=resolved_title,
            authors=[],
            journal=None,
            published_year=None,
            origin=CandidateOrigin.MANUAL_UPLOAD,
            access_level=AccessLevel.FULL_TEXT_UPLOADED_PDF,
            critical_sheet=sheet,
            pdf_storage_path=storage_path,
        )


class UploadCandidatePdfUseCase:
    def __init__(
        self,
        *,
        repo: KnowledgeRepositoryPort,
        binary_storage: BinaryStoragePort,
        ai_provider: AIProviderPort,
    ) -> None:
        self._repo = repo
        self._binary_storage = binary_storage
        self._ai_provider = ai_provider

    async def execute(
        self,
        *,
        auth: AuthContext,
        candidate_id: UUID,
        filename: str,
        pdf_bytes: bytes,
    ) -> CandidateStudy:
        auth.require_curator()
        candidate = await self._repo.get_candidate_by_id(candidate_id)
        if candidate is None:
            raise CandidateNotFoundError("No se encontró el Estudio Candidato solicitado.")
        candidate.ensure_pending()

        # Validate & extract BEFORE mutating storage or DB so errors never corrupt prior state
        extracted_text = extract_pdf_text(pdf_bytes)
        content_hash = compute_content_hash(extracted_text)

        sheet = await generate_critical_sheet(
            ai_provider=self._ai_provider,
            title=candidate.title,
            authors=list(candidate.authors),
            journal=candidate.journal,
            published_year=candidate.published_year,
            doi=candidate.doi,
            pmid=candidate.pmid,
            source_url=candidate.source_url,
            access_level=AccessLevel.FULL_TEXT_UPLOADED_PDF,
            source_text=extracted_text,
        )
        storage_path = await self._binary_storage.put_curator_pdf(
            relative_path=f"candidates/{candidate.id}/{content_hash[:12]}.pdf",
            data=pdf_bytes,
        )
        return await self._repo.update_candidate_pdf_analysis(
            candidate_id=candidate.id,
            access_level=AccessLevel.FULL_TEXT_UPLOADED_PDF,
            critical_sheet=sheet,
            previous_critical_sheet=candidate.critical_sheet,
            pdf_storage_path=storage_path,
            content_hash=content_hash,
        )


@dataclass(frozen=True, slots=True)
class RelationInput:
    target_card_id: UUID
    relation_type: RelationType
    rationale: str | None = None


class ApproveCandidateUseCase:
    def __init__(
        self,
        *,
        repo: KnowledgeRepositoryPort,
        ai_provider: AIProviderPort,
    ) -> None:
        self._repo = repo
        self._ai_provider = ai_provider

    async def execute(
        self,
        *,
        auth: AuthContext,
        candidate_id: UUID,
        evidence_level: EvidenceLevel | None = None,
        curated_text_es: str | None = None,
        key_terms_en: list[str] | None = None,
        tags: list[str] | None = None,
        curator_notes: str | None = None,
        relations: list[RelationInput] | None = None,
    ) -> EvidenceCardDetail:
        auth.require_curator()
        candidate = await self._repo.get_candidate_by_id(candidate_id)
        if candidate is None:
            raise CandidateNotFoundError("No se encontró el Estudio Candidato solicitado.")
        candidate.ensure_pending()

        # Verify all relation targets exist before mutating
        relation_items = relations or []
        for rel in relation_items:
            target = await self._repo.get_evidence_card_by_id(rel.target_card_id)
            if target is None:
                raise EvidenceCardNotFoundError(
                    f"La Ficha de Evidencia relacionada ({rel.target_card_id}) no existe."
                )

        resolved_level = evidence_level or candidate.critical_sheet.suggested_evidence_level
        resolved_coverage = (
            EvidenceCoverage.ABSTRACT_ONLY
            if candidate.access_level == AccessLevel.ABSTRACT_ONLY_PAYWALL
            else EvidenceCoverage.FULL_TEXT
        )
        resolved_text_es = (
            (curated_text_es or "").strip()
            or candidate.critical_sheet.curated_summary_es.strip()
            or candidate.critical_sheet.block_4_key_findings_and_applicability
        )
        resolved_terms = (
            key_terms_en
            if key_terms_en is not None
            else list(candidate.critical_sheet.key_terms_en)
        )
        resolved_tags = tags if tags is not None else list(candidate.critical_sheet.suggested_tags)

        embedding_text = _build_embedding_input(
            title=candidate.title,
            curated_text_es=resolved_text_es,
            key_terms_en=resolved_terms,
            tags=resolved_tags,
        )
        embed_result = (await self._ai_provider.embed_texts([embedding_text]))[0]

        await self._repo.mark_candidate_approved(
            candidate_id=candidate.id, curator_notes=curator_notes
        )
        card = await self._repo.create_evidence_card(
            candidate_study_id=candidate.id,
            doi=candidate.doi,
            pmid=candidate.pmid,
            source_url=candidate.source_url,
            title=candidate.title,
            evidence_level=resolved_level,
            coverage=resolved_coverage,
            curated_text_es=resolved_text_es,
            key_terms_en=resolved_terms,
            tags=resolved_tags,
            curator_notes=curator_notes,
            validity_status=ValidityStatus.ACTIVE,
            embedding=embed_result.vector,
            embedding_model=embed_result.model_id,
        )

        for rel in relation_items:
            await self._repo.create_relation(
                source_card_id=card.id,
                target_card_id=rel.target_card_id,
                relation_type=rel.relation_type,
                rationale=rel.rationale,
            )
            if rel.relation_type == RelationType.SUPERSEDES:
                await self._repo.update_evidence_card(
                    card_id=rel.target_card_id,
                    curator_notes=None,
                    tags=None,
                    validity_status=ValidityStatus.SUPERSEDED,
                    curated_text_es=None,
                    key_terms_en=None,
                    embedding=None,
                    embedding_model=None,
                )
            elif rel.relation_type == RelationType.NUANCES:
                target_card = await self._repo.get_evidence_card_by_id(rel.target_card_id)
                if target_card and target_card.validity_status == ValidityStatus.ACTIVE:
                    await self._repo.update_evidence_card(
                        card_id=rel.target_card_id,
                        curator_notes=None,
                        tags=None,
                        validity_status=ValidityStatus.NUANCED,
                        curated_text_es=None,
                        key_terms_en=None,
                        embedding=None,
                        embedding_model=None,
                    )

        detail = await self._repo.get_evidence_card_detail(card.id)
        assert detail is not None
        return detail


class RejectCandidateUseCase:
    def __init__(self, repo: KnowledgeRepositoryPort) -> None:
        self._repo = repo

    async def execute(
        self, *, auth: AuthContext, candidate_id: UUID, rejection_reason: str
    ) -> CandidateStudy:
        auth.require_curator()
        if not rejection_reason or not rejection_reason.strip():
            raise KnowledgeValidationError(
                "Debes indicar un motivo obligatorio para rechazar un Estudio Candidato."
            )
        candidate = await self._repo.get_candidate_by_id(candidate_id)
        if candidate is None:
            raise CandidateNotFoundError("No se encontró el Estudio Candidato solicitado.")
        candidate.ensure_pending()
        return await self._repo.mark_candidate_rejected(
            candidate_id=candidate.id, rejection_reason=rejection_reason
        )


class UpdateEvidenceCardUseCase:
    def __init__(
        self,
        *,
        repo: KnowledgeRepositoryPort,
        ai_provider: AIProviderPort,
    ) -> None:
        self._repo = repo
        self._ai_provider = ai_provider

    async def execute(
        self,
        *,
        auth: AuthContext,
        card_id: UUID,
        curator_notes: str | None = None,
        tags: list[str] | None = None,
        validity_status: ValidityStatus | None = None,
        curated_text_es: str | None = None,
        key_terms_en: list[str] | None = None,
        add_relations: list[RelationInput] | None = None,
    ) -> EvidenceCardDetail:
        auth.require_curator()
        existing = await self._repo.get_evidence_card_by_id(card_id)
        if existing is None:
            raise EvidenceCardNotFoundError("No se encontró la Ficha de Evidencia solicitada.")

        for rel in add_relations or []:
            validate_evidence_relation(source_card_id=card_id, target_card_id=rel.target_card_id)

        new_embedding: list[float] | None = None
        new_embedding_model: str | None = None
        if curated_text_es is not None or key_terms_en is not None or tags is not None:
            embed_input = _build_embedding_input(
                title=existing.title,
                curated_text_es=(
                    curated_text_es if curated_text_es is not None else existing.curated_text_es
                ),
                key_terms_en=(
                    key_terms_en if key_terms_en is not None else list(existing.key_terms_en)
                ),
                tags=tags if tags is not None else list(existing.tags),
            )
            embed_result = (await self._ai_provider.embed_texts([embed_input]))[0]
            new_embedding = embed_result.vector
            new_embedding_model = embed_result.model_id

        await self._repo.update_evidence_card(
            card_id=card_id,
            curator_notes=curator_notes,
            tags=tags,
            validity_status=validity_status,
            curated_text_es=curated_text_es,
            key_terms_en=key_terms_en,
            embedding=new_embedding,
            embedding_model=new_embedding_model,
        )

        for rel in add_relations or []:
            target = await self._repo.get_evidence_card_by_id(rel.target_card_id)
            if target is None:
                raise EvidenceCardNotFoundError(
                    f"La Ficha de Evidencia relacionada ({rel.target_card_id}) no existe."
                )
            await self._repo.create_relation(
                source_card_id=card_id,
                target_card_id=rel.target_card_id,
                relation_type=rel.relation_type,
                rationale=rel.rationale,
            )
            if rel.relation_type == RelationType.SUPERSEDES:
                await self._repo.update_evidence_card(
                    card_id=rel.target_card_id,
                    curator_notes=None,
                    tags=None,
                    validity_status=ValidityStatus.SUPERSEDED,
                    curated_text_es=None,
                    key_terms_en=None,
                    embedding=None,
                    embedding_model=None,
                )
            elif rel.relation_type == RelationType.NUANCES:
                if target.validity_status == ValidityStatus.ACTIVE:
                    await self._repo.update_evidence_card(
                        card_id=rel.target_card_id,
                        curator_notes=None,
                        tags=None,
                        validity_status=ValidityStatus.NUANCED,
                        curated_text_es=None,
                        key_terms_en=None,
                        embedding=None,
                        embedding_model=None,
                    )

        detail = await self._repo.get_evidence_card_detail(card_id)
        assert detail is not None
        return detail


class SearchKnowledgeBaseUseCase:
    def __init__(
        self,
        *,
        repo: KnowledgeRepositoryPort,
        ai_provider: AIProviderPort,
    ) -> None:
        self._repo = repo
        self._ai_provider = ai_provider

    async def execute(
        self,
        *,
        query: str | None = None,
        tags: list[str] | None = None,
        evidence_level: EvidenceLevel | None = None,
        validity_status: ValidityStatus | None = None,
        limit: int = 20,
    ) -> list[EvidenceSearchHit]:
        query_embedding: list[float] | None = None
        query_model: str | None = None
        if query and query.strip():
            embed_result = (await self._ai_provider.embed_texts([query.strip()]))[0]
            query_embedding = embed_result.vector
            query_model = embed_result.model_id
        return await self._repo.hybrid_search(
            query=query,
            query_embedding=query_embedding,
            query_embedding_model=query_model,
            tags=tags,
            evidence_level=evidence_level,
            validity_status=validity_status,
            limit=limit,
        )


class GetEvidenceCardDetailUseCase:
    def __init__(self, repo: KnowledgeRepositoryPort) -> None:
        self._repo = repo

    async def execute(self, *, card_id: UUID) -> EvidenceCardDetail:
        detail = await self._repo.get_evidence_card_detail(card_id)
        if detail is None:
            raise EvidenceCardNotFoundError("No se encontró la Ficha de Evidencia solicitada.")
        return detail


@dataclass(frozen=True, slots=True)
class ReindexSummary:
    reindexed_count: int
    skipped_count: int
    embedding_model: str


class ReindexKnowledgeBaseUseCase:
    """Controlled re-indexing of EvidenceCards from stored curated text on model change."""

    def __init__(
        self,
        *,
        repo: KnowledgeRepositoryPort,
        ai_provider: AIProviderPort,
    ) -> None:
        self._repo = repo
        self._ai_provider = ai_provider

    async def execute(self, *, auth: AuthContext, force: bool = False) -> ReindexSummary:
        auth.require_curator()
        cards = await self._repo.list_all_evidence_cards()
        if not cards:
            probe = (await self._ai_provider.embed_texts(["probe"]))[0]
            return ReindexSummary(
                reindexed_count=0, skipped_count=0, embedding_model=probe.model_id
            )

        # Probe current model id cleanly
        probe = (await self._ai_provider.embed_texts(["probe"]))[0]
        target_model = probe.model_id

        to_reindex: list[EvidenceCard] = [
            c for c in cards if force or c.embedding_model != target_model
        ]
        skipped = len(cards) - len(to_reindex)
        if not to_reindex:
            return ReindexSummary(
                reindexed_count=0, skipped_count=skipped, embedding_model=target_model
            )

        texts = [
            _build_embedding_input(
                title=c.title,
                curated_text_es=c.curated_text_es,
                key_terms_en=list(c.key_terms_en),
                tags=list(c.tags),
            )
            for c in to_reindex
        ]
        embeddings = await self._ai_provider.embed_texts(texts)
        for card, emb in zip(to_reindex, embeddings, strict=True):
            await self._repo.update_card_embedding(
                card_id=card.id, embedding=emb.vector, embedding_model=emb.model_id
            )

        return ReindexSummary(
            reindexed_count=len(to_reindex),
            skipped_count=skipped,
            embedding_model=target_model,
        )
