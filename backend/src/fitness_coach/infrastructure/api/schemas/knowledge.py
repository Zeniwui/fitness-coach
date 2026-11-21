"""Pydantic v2 API schemas for Knowledge Base & Curator Inbox (#4)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

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


class CriticalSheet6BlocksSchema(BaseModel):
    block_1_identification: str
    block_2_design_and_evidence_level: str
    block_3_population_and_protocol: str
    block_4_key_findings_and_applicability: str
    block_5_limitations_and_conflicts: str
    block_6_impact_vs_existing_kb: str
    suggested_evidence_level: EvidenceLevel
    suggested_tags: list[str]
    key_terms_en: list[str]
    curated_summary_es: str

    @classmethod
    def from_domain(cls, sheet: CriticalSheet6Blocks) -> CriticalSheet6BlocksSchema:
        return cls(
            block_1_identification=sheet.block_1_identification,
            block_2_design_and_evidence_level=sheet.block_2_design_and_evidence_level,
            block_3_population_and_protocol=sheet.block_3_population_and_protocol,
            block_4_key_findings_and_applicability=sheet.block_4_key_findings_and_applicability,
            block_5_limitations_and_conflicts=sheet.block_5_limitations_and_conflicts,
            block_6_impact_vs_existing_kb=sheet.block_6_impact_vs_existing_kb,
            suggested_evidence_level=sheet.suggested_evidence_level,
            suggested_tags=list(sheet.suggested_tags),
            key_terms_en=list(sheet.key_terms_en),
            curated_summary_es=sheet.curated_summary_es,
        )


class CandidateStudyResponse(BaseModel):
    id: UUID
    doi: str | None
    pmid: str | None
    pmcid: str | None
    source_url: str | None
    title: str
    authors: list[str]
    journal: str | None
    published_year: int | None
    origin: CandidateOrigin
    access_level: AccessLevel
    paywall_warning: str | None
    critical_sheet: CriticalSheet6BlocksSchema
    previous_critical_sheet: CriticalSheet6BlocksSchema | None
    status: CandidateStatus
    rejection_reason: str | None
    curator_notes: str | None
    pdf_storage_path: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_domain(cls, candidate: CandidateStudy) -> CandidateStudyResponse:
        return cls(
            id=candidate.id,
            doi=candidate.doi,
            pmid=candidate.pmid,
            pmcid=candidate.pmcid,
            source_url=candidate.source_url,
            title=candidate.title,
            authors=list(candidate.authors),
            journal=candidate.journal,
            published_year=candidate.published_year,
            origin=candidate.origin,
            access_level=candidate.access_level,
            paywall_warning=candidate.paywall_warning,
            critical_sheet=CriticalSheet6BlocksSchema.from_domain(candidate.critical_sheet),
            previous_critical_sheet=(
                CriticalSheet6BlocksSchema.from_domain(candidate.previous_critical_sheet)
                if candidate.previous_critical_sheet
                else None
            ),
            status=candidate.status,
            rejection_reason=candidate.rejection_reason,
            curator_notes=candidate.curator_notes,
            pdf_storage_path=candidate.pdf_storage_path,
            created_at=candidate.created_at,
            updated_at=candidate.updated_at,
        )


class CandidateStudyListResponse(BaseModel):
    items: list[CandidateStudyResponse]


class ProposeCandidateFromDoiRequest(BaseModel):
    doi_or_url: str = Field(min_length=3, max_length=500)
    allow_reopen: bool = False


class EvidenceRelationInputSchema(BaseModel):
    target_card_id: UUID
    relation_type: RelationType
    rationale: str | None = Field(default=None, max_length=1000)


class ApproveCandidateRequest(BaseModel):
    evidence_level: EvidenceLevel | None = None
    curated_text_es: str | None = None
    key_terms_en: list[str] | None = None
    tags: list[str] | None = None
    curator_notes: str | None = Field(default=None, max_length=4000)
    relations: list[EvidenceRelationInputSchema] = Field(default_factory=list)


class RejectCandidateRequest(BaseModel):
    rejection_reason: str = Field(min_length=1, max_length=2000)


class UpdateEvidenceCardRequest(BaseModel):
    curator_notes: str | None = Field(default=None, max_length=4000)
    tags: list[str] | None = None
    validity_status: ValidityStatus | None = None
    curated_text_es: str | None = None
    key_terms_en: list[str] | None = None
    add_relations: list[EvidenceRelationInputSchema] = Field(default_factory=list)


class EvidenceRelationResponse(BaseModel):
    id: UUID
    source_card_id: UUID
    target_card_id: UUID
    relation_type: RelationType
    rationale: str | None
    created_at: datetime

    @classmethod
    def from_domain(cls, rel: EvidenceRelation) -> EvidenceRelationResponse:
        return cls(
            id=rel.id,
            source_card_id=rel.source_card_id,
            target_card_id=rel.target_card_id,
            relation_type=rel.relation_type,
            rationale=rel.rationale,
            created_at=rel.created_at,
        )


class EvidenceCardSummaryResponse(BaseModel):
    id: UUID
    candidate_study_id: UUID
    doi: str | None
    pmid: str | None
    source_url: str | None
    title: str
    evidence_level: EvidenceLevel
    coverage: EvidenceCoverage
    curated_text_es: str
    key_terms_en: list[str]
    tags: list[str]
    curator_notes: str | None
    validity_status: ValidityStatus
    embedding_model: str
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_domain(cls, card: EvidenceCard) -> EvidenceCardSummaryResponse:
        return cls(
            id=card.id,
            candidate_study_id=card.candidate_study_id,
            doi=card.doi,
            pmid=card.pmid,
            source_url=card.source_url,
            title=card.title,
            evidence_level=card.evidence_level,
            coverage=card.coverage,
            curated_text_es=card.curated_text_es,
            key_terms_en=list(card.key_terms_en),
            tags=list(card.tags),
            curator_notes=card.curator_notes,
            validity_status=card.validity_status,
            embedding_model=card.embedding_model,
            created_at=card.created_at,
            updated_at=card.updated_at,
        )


class EvidenceCardDetailResponse(EvidenceCardSummaryResponse):
    outgoing_relations: list[EvidenceRelationResponse]
    incoming_relations: list[EvidenceRelationResponse]
    updated_by_cards: list[EvidenceCardSummaryResponse]

    @classmethod
    def from_detail(cls, detail: EvidenceCardDetail) -> EvidenceCardDetailResponse:
        base = EvidenceCardSummaryResponse.from_domain(detail.card)
        return cls(
            **base.model_dump(),
            outgoing_relations=[
                EvidenceRelationResponse.from_domain(r) for r in detail.outgoing_relations
            ],
            incoming_relations=[
                EvidenceRelationResponse.from_domain(r) for r in detail.incoming_relations
            ],
            updated_by_cards=[
                EvidenceCardSummaryResponse.from_domain(c) for c in detail.updated_by_cards
            ],
        )


class EvidenceSearchHitResponse(BaseModel):
    card: EvidenceCardSummaryResponse
    score: float
    vector_rank: int | None
    lexical_rank: int | None
    updated_by_cards: list[EvidenceCardSummaryResponse]

    @classmethod
    def from_domain(cls, hit: EvidenceSearchHit) -> EvidenceSearchHitResponse:
        return cls(
            card=EvidenceCardSummaryResponse.from_domain(hit.card),
            score=hit.score,
            vector_rank=hit.vector_rank,
            lexical_rank=hit.lexical_rank,
            updated_by_cards=[
                EvidenceCardSummaryResponse.from_domain(c) for c in hit.updated_by_cards
            ],
        )


class KnowledgeSearchResponse(BaseModel):
    items: list[EvidenceSearchHitResponse]
    total: int


class ReindexRequest(BaseModel):
    force: bool = False


class ReindexResponse(BaseModel):
    reindexed_count: int
    skipped_count: int
    embedding_model: str
