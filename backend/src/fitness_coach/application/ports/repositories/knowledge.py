"""Repository protocol for Knowledge Base & Curator Inbox slice."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from fitness_coach.domain.knowledge import (
    AccessLevel,
    CandidateOrigin,
    CandidateStatus,
    CandidateStudy,
    CriticalSheet6Blocks,
    EvidenceCard,
    EvidenceCardDetail,
    EvidenceCoverage,
    EvidenceLevel,
    EvidenceRelation,
    EvidenceSearchHit,
    RelationType,
    ValidityStatus,
)


class KnowledgeRepositoryPort(Protocol):
    """Persistence and hybrid-search contract for CandidateStudy and EvidenceCard."""

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
    ) -> CandidateStudy: ...

    async def get_candidate_by_id(self, candidate_id: UUID) -> CandidateStudy | None: ...

    async def find_candidate_by_identifiers(
        self,
        *,
        doi: str | None = None,
        pmid: str | None = None,
        content_hash: str | None = None,
    ) -> CandidateStudy | None: ...

    async def list_candidates(
        self, *, status: CandidateStatus | None = None
    ) -> list[CandidateStudy]: ...

    async def update_candidate_pdf_analysis(
        self,
        *,
        candidate_id: UUID,
        access_level: AccessLevel,
        critical_sheet: CriticalSheet6Blocks,
        previous_critical_sheet: CriticalSheet6Blocks,
        pdf_storage_path: str,
        content_hash: str,
    ) -> CandidateStudy: ...

    async def reopen_rejected_candidate(
        self,
        *,
        candidate_id: UUID,
        access_level: AccessLevel,
        critical_sheet: CriticalSheet6Blocks,
        pdf_storage_path: str | None,
        content_hash: str | None,
    ) -> CandidateStudy: ...

    async def mark_candidate_rejected(
        self, *, candidate_id: UUID, rejection_reason: str
    ) -> CandidateStudy: ...

    async def mark_candidate_approved(
        self, *, candidate_id: UUID, curator_notes: str | None
    ) -> CandidateStudy: ...

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
    ) -> EvidenceCard: ...

    async def get_evidence_card_by_id(self, card_id: UUID) -> EvidenceCard | None: ...

    async def get_evidence_card_detail(self, card_id: UUID) -> EvidenceCardDetail | None: ...

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
    ) -> EvidenceCard: ...

    async def create_relation(
        self,
        *,
        source_card_id: UUID,
        target_card_id: UUID,
        relation_type: RelationType,
        rationale: str | None,
    ) -> EvidenceRelation: ...

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
    ) -> list[EvidenceSearchHit]: ...

    async def list_all_evidence_cards(self) -> list[EvidenceCard]: ...

    async def update_card_embedding(
        self, *, card_id: UUID, embedding: list[float], embedding_model: str
    ) -> None: ...
