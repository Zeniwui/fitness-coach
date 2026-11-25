"""Knowledge Base & Curator domain model (Pure Python — zero framework imports).

Canonical vocabulary follows GLOSSARY.md and ADR-0001 / ADR-0002 / ADR-0003:
- CandidateStudy (Estudio Candidato)
- CriticalSheet6Blocks (ficha crítica obligatoria de 6 bloques)
- EvidenceCard (Ficha de Evidencia)
- EvidenceRelation (evolución de evidencia: confirms, nuances, supersedes)
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from urllib.parse import urlsplit
from uuid import UUID

PAYWALL_WARNING_LABEL = "Evaluado solo con abstract (texto completo de pago)"
MAX_PDF_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB


class CandidateOrigin(StrEnum):
    MONTHLY_CUT = "monthly_cut"
    LIVE_SEARCH_PROMOTED = "live_search_promoted"
    MANUAL_UPLOAD = "manual_upload"
    SEED_BATCH = "seed_batch"


class AccessLevel(StrEnum):
    FULL_TEXT_OPEN_ACCESS = "full_text_open_access"
    FULL_TEXT_UPLOADED_PDF = "full_text_uploaded_pdf"
    ABSTRACT_ONLY_PAYWALL = "abstract_only_paywall"


class CandidateStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class EvidenceLevel(StrEnum):
    META_ANALYSIS = "meta_analysis"
    SYSTEMATIC_REVIEW = "systematic_review"
    POSITION_STAND = "position_stand"
    RCT = "rct"
    CONTROLLED_TRIAL = "controlled_trial"
    OBSERVATIONAL = "observational"
    MECHANISTIC = "mechanistic"
    PREPRINT = "preprint"


class EvidenceCoverage(StrEnum):
    FULL_TEXT = "full_text"
    ABSTRACT_ONLY = "abstract_only"


class ValidityStatus(StrEnum):
    ACTIVE = "active"
    NUANCED = "nuanced"
    SUPERSEDED = "superseded"
    ARCHIVED = "archived"


class RelationType(StrEnum):
    CONFIRMS = "confirms"
    NUANCES = "nuances"
    SUPERSEDES = "supersedes"


EVIDENCE_HIERARCHY_WEIGHTS: dict[EvidenceLevel, float] = {
    EvidenceLevel.META_ANALYSIS: 1.00,
    EvidenceLevel.SYSTEMATIC_REVIEW: 0.95,
    EvidenceLevel.POSITION_STAND: 0.92,
    EvidenceLevel.RCT: 0.85,
    EvidenceLevel.CONTROLLED_TRIAL: 0.75,
    EvidenceLevel.OBSERVATIONAL: 0.55,
    EvidenceLevel.MECHANISTIC: 0.45,
    EvidenceLevel.PREPRINT: 0.35,
}

VALIDITY_PRIORITY_MULTIPLIER: dict[ValidityStatus, float] = {
    ValidityStatus.ACTIVE: 1.00,
    ValidityStatus.NUANCED: 0.65,
    ValidityStatus.SUPERSEDED: 0.25,
    ValidityStatus.ARCHIVED: 0.05,
}


class KnowledgeError(Exception):
    """Base error for Knowledge Base and curation invariants."""


class KnowledgeValidationError(KnowledgeError):
    """Raised when domain validation fails (empty 6-block field, empty rejection reason, etc.)."""


class CandidateNotFoundError(KnowledgeError):
    """Raised when a CandidateStudy does not exist."""


class EvidenceCardNotFoundError(KnowledgeError):
    """Raised when an EvidenceCard does not exist."""


class InvalidCandidateStateError(KnowledgeError):
    """Raised when attempting an invalid state transition on a CandidateStudy."""


class InvalidPdfError(KnowledgeError):
    """Raised when a PDF is corrupt, lacks a text layer, or exceeds the size limit."""


class ScientificSourceNotFoundError(KnowledgeError):
    """Raised when a DOI/URL cannot be resolved via scientific sources."""


class DuplicateActiveStudyError(KnowledgeError):
    """Raised when a study with the same DOI/PMID/hash is already pending or approved."""


class DuplicateRejectedStudyError(KnowledgeError):
    """Raised when a study matches a previously rejected CandidateStudy."""

    def __init__(self, *, prior_candidate: CandidateStudy) -> None:
        self.prior_candidate = prior_candidate
        reason = prior_candidate.rejection_reason or "Sin motivo registrado"
        super().__init__(f"Este estudio ya fue rechazado anteriormente. Motivo previo: {reason}")


_DOI_PREFIX_RE = re.compile(
    r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)",
    re.IGNORECASE,
)
_DOI_EXTRACT_RE = re.compile(r"(10\.\d{4,9}/[^\s\"<>]+)", re.IGNORECASE)
_PMID_DIGITS_RE = re.compile(r"(\d{4,12})")


def normalize_doi(raw: str | None) -> str | None:
    """Normalize a DOI or DOI URL into canonical lowercase form (e.g. '10.1007/...')."""
    if not raw:
        return None
    cleaned = _DOI_PREFIX_RE.sub("", raw.strip()).strip().rstrip(".")
    match = _DOI_EXTRACT_RE.search(cleaned)
    if match:
        return match.group(1).lower().rstrip(".,;)")
    return cleaned.lower() if cleaned else None


def normalize_pmid(raw: str | None) -> str | None:
    """Normalize a PubMed ID or PubMed URL into numeric digits."""
    if not raw:
        return None
    match = _PMID_DIGITS_RE.search(raw.strip())
    return match.group(1) if match else None


def compute_content_hash(text: str) -> str:
    """Deterministic SHA-256 fingerprint of normalized study text for PDF deduplication."""
    normalized = " ".join(text.strip().lower().split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def validate_safe_http_url(url: str | None) -> str | None:
    """Ensure optional external URLs use http(s) with a valid netloc; reject javascript:/data:."""
    if url is None:
        return None
    cleaned = url.strip()
    if not cleaned:
        return None
    parts = urlsplit(cleaned)
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc:
        raise KnowledgeValidationError(
            "El enlace de la fuente debe usar un esquema http:// o https:// válido."
        )
    return cleaned


def validate_evidence_relation(*, source_card_id: UUID, target_card_id: UUID) -> None:
    """Reject self-referential EvidenceCard relations."""
    if source_card_id == target_card_id:
        raise KnowledgeValidationError(
            "Una Ficha de Evidencia no puede relacionarse consigo misma."
        )


@dataclass(frozen=True, slots=True)
class CriticalSheet6Blocks:
    """Mandatory 6-block critical analysis sheet for every CandidateStudy."""

    block_1_identification: str
    block_2_design_and_evidence_level: str
    block_3_population_and_protocol: str
    block_4_key_findings_and_applicability: str
    block_5_limitations_and_conflicts: str
    block_6_impact_vs_existing_kb: str
    suggested_evidence_level: EvidenceLevel = EvidenceLevel.RCT
    suggested_tags: tuple[str, ...] = ()
    key_terms_en: tuple[str, ...] = ()
    curated_summary_es: str = ""

    def __post_init__(self) -> None:
        required_blocks = {
            "block_1_identification": self.block_1_identification,
            "block_2_design_and_evidence_level": self.block_2_design_and_evidence_level,
            "block_3_population_and_protocol": self.block_3_population_and_protocol,
            "block_4_key_findings_and_applicability": self.block_4_key_findings_and_applicability,
            "block_5_limitations_and_conflicts": self.block_5_limitations_and_conflicts,
            "block_6_impact_vs_existing_kb": self.block_6_impact_vs_existing_kb,
        }
        for name, value in required_blocks.items():
            if not isinstance(value, str) or not value.strip():
                raise KnowledgeValidationError(
                    f"La ficha crítica de 6 bloques requiere contenido en '{name}'."
                )

    def to_dict(self) -> dict[str, object]:
        return {
            "block_1_identification": self.block_1_identification,
            "block_2_design_and_evidence_level": self.block_2_design_and_evidence_level,
            "block_3_population_and_protocol": self.block_3_population_and_protocol,
            "block_4_key_findings_and_applicability": self.block_4_key_findings_and_applicability,
            "block_5_limitations_and_conflicts": self.block_5_limitations_and_conflicts,
            "block_6_impact_vs_existing_kb": self.block_6_impact_vs_existing_kb,
            "suggested_evidence_level": self.suggested_evidence_level.value,
            "suggested_tags": list(self.suggested_tags),
            "key_terms_en": list(self.key_terms_en),
            "curated_summary_es": self.curated_summary_es,
        }

    @classmethod
    def from_dict(cls, data: dict[str, object]) -> CriticalSheet6Blocks:
        raw_level = str(data.get("suggested_evidence_level", EvidenceLevel.RCT.value))
        try:
            level = EvidenceLevel(raw_level)
        except ValueError:
            level = EvidenceLevel.RCT
        tags = tuple(str(t) for t in (data.get("suggested_tags") or []))
        terms = tuple(str(t) for t in (data.get("key_terms_en") or []))
        return cls(
            block_1_identification=str(data["block_1_identification"]),
            block_2_design_and_evidence_level=str(data["block_2_design_and_evidence_level"]),
            block_3_population_and_protocol=str(data["block_3_population_and_protocol"]),
            block_4_key_findings_and_applicability=str(
                data["block_4_key_findings_and_applicability"]
            ),
            block_5_limitations_and_conflicts=str(data["block_5_limitations_and_conflicts"]),
            block_6_impact_vs_existing_kb=str(data["block_6_impact_vs_existing_kb"]),
            suggested_evidence_level=level,
            suggested_tags=tags,
            key_terms_en=terms,
            curated_summary_es=str(data.get("curated_summary_es") or ""),
        )


@dataclass(frozen=True, slots=True)
class CandidateStudy:
    """Estudio Candidato awaiting or resolved by Curator review (ADR-0001)."""

    id: UUID
    doi: str | None
    pmid: str | None
    pmcid: str | None
    content_hash: str | None
    source_url: str | None
    title: str
    authors: tuple[str, ...]
    journal: str | None
    published_year: int | None
    origin: CandidateOrigin
    access_level: AccessLevel
    critical_sheet: CriticalSheet6Blocks
    previous_critical_sheet: CriticalSheet6Blocks | None
    status: CandidateStatus
    rejection_reason: str | None
    curator_notes: str | None
    pdf_storage_path: str | None
    monthly_cut_run_id: UUID | None
    created_at: datetime
    updated_at: datetime

    @property
    def paywall_warning(self) -> str | None:
        if self.access_level == AccessLevel.ABSTRACT_ONLY_PAYWALL:
            return PAYWALL_WARNING_LABEL
        return None

    def ensure_pending(self) -> None:
        if self.status != CandidateStatus.PENDING:
            raise InvalidCandidateStateError(
                f"El Estudio Candidato ya fue resuelto con estado '{self.status.value}'."
            )


@dataclass(frozen=True, slots=True)
class EvidenceCard:
    """Ficha de Evidencia approved by Curator and indexed in the shared KnowledgeBase."""

    id: UUID
    candidate_study_id: UUID
    doi: str | None
    pmid: str | None
    source_url: str | None
    title: str
    evidence_level: EvidenceLevel
    coverage: EvidenceCoverage
    curated_text_es: str
    key_terms_en: tuple[str, ...]
    tags: tuple[str, ...]
    curator_notes: str | None
    validity_status: ValidityStatus
    embedding_model: str
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class EvidenceRelation:
    """Directed evolution link between two EvidenceCards (confirms, nuances, supersedes)."""

    id: UUID
    source_card_id: UUID
    target_card_id: UUID
    relation_type: RelationType
    rationale: str | None
    created_at: datetime


@dataclass(frozen=True, slots=True)
class EvidenceCardDetail:
    """EvidenceCard with its evolution graph (outgoing, incoming, and updating cards)."""

    card: EvidenceCard
    outgoing_relations: tuple[EvidenceRelation, ...] = field(default_factory=tuple)
    incoming_relations: tuple[EvidenceRelation, ...] = field(default_factory=tuple)
    updated_by_cards: tuple[EvidenceCard, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class EvidenceSearchHit:
    """Hybrid search result with RRF score and updating-card pointers for nuanced/superseded."""

    card: EvidenceCard
    score: float
    vector_rank: int | None
    lexical_rank: int | None
    updated_by_cards: tuple[EvidenceCard, ...] = field(default_factory=tuple)
