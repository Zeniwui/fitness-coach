"""Monthly Cut, Quota Checkpointing, Seed Batch & Trending Topics domain model (Pure Python).

Zero FastAPI, SQLAlchemy, or AI SDK imports.
Canonical vocabulary follows GLOSSARY.md and ADR-0001 / ADR-0003:
- MonthlyCutRun (Corte Mensual)
- TrendingTopic (Tema de Actualidad — strictly separated from EvidenceCard)
- Deterministic pre-filter & deduplication (0 LLM calls)
- Foundational Seed Batch (~16 meta-analyses & ISSN Position Stands)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from fitness_coach.domain.knowledge import (
    AccessLevel,
    CriticalSheet6Blocks,
    EvidenceLevel,
    normalize_doi,
    normalize_pmid,
)

DEFAULT_MAX_CANDIDATES = 12
MIN_MAX_CANDIDATES = 1
MAX_ALLOWED_CANDIDATES = 50
DEFAULT_MONTHLY_CUT_QUERY = (
    "(hypertrophy OR resistance training OR bodybuilding OR sports nutrition OR creatine OR "
    "protein)"
)

TARGET_JOURNALS: frozenset[str] = frozenset(
    {
        "sports medicine",
        "journal of strength and conditioning research",
        "medicine & science in sports & exercise",
        "medicine and science in sports and exercise",
        "journal of the international society of sports nutrition",
        "european journal of sport science",
        "british journal of sports medicine",
        "international journal of sports physiology and performance",
        "journal of sports sciences",
        "strength and conditioning journal",
        "sportrxiv",
        "nutrients",
        "frontiers in sports and active living",
        "scandinavian journal of medicine & science in sports",
        "journal of applied physiology",
        "american journal of clinical nutrition",
        "sports medicine - open",
    }
)

DOMAIN_KEYWORDS: tuple[str, ...] = (
    "hypertrophy",
    "hipertrofia",
    "muscle growth",
    "muscle mass",
    "lean mass",
    "resistance training",
    "strength training",
    "entrenamiento de fuerza",
    "bodybuilding",
    "fisioculturismo",
    "protein",
    "proteina",
    "creatine",
    "creatina",
    "leucine",
    "mtor",
    "muscle protein synthesis",
    "proximity to failure",
    "repetitions in reserve",
    "rir",
    "rpe",
    "1rm",
    "training volume",
    "weekly sets",
    "training frequency",
    "deload",
    "periodization",
    "mesocycle",
    "lengthened partials",
    "range of motion",
    "rom",
    "caloric deficit",
    "fat loss",
    "body composition",
    "ergogenic",
    "beta-alanine",
    "caffeine",
    "hmb",
    "issn",
    "sports nutrition",
    "nutricion deportiva",
    "sarcopenia",
    "inter-set rest",
)

OFF_TOPIC_KEYWORDS: tuple[str, ...] = (
    "pediatric asthma",
    "inhaler",
    "oncology",
    "chemotherapy",
    "alzheimer",
    "dementia",
    "dental caries",
    "veterinary",
    "covid-19 vaccine",
    "neonatal",
    "obstetric",
)


class MonthlyCutRunType(StrEnum):
    SCHEDULED = "scheduled"
    MANUAL = "manual"
    SEED = "seed"


class MonthlyCutStatus(StrEnum):
    QUEUED = "queued"
    COLLECTING = "collecting"
    FILTERING = "filtering"
    ANALYZING = "analyzing"
    COMPLETED = "completed"
    PAUSED_RATE_LIMIT = "paused_rate_limit"
    FAILED = "failed"


class TrendingTopicStatus(StrEnum):
    PENDING = "pending"
    APPROVED_CONTEXT = "approved_context"
    DISMISSED = "dismissed"


class MonthlyCutError(Exception):
    """Base error for Monthly Cut & Trending Topics invariants."""


class MonthlyCutNotFoundError(MonthlyCutError):
    """Raised when a MonthlyCutRun does not exist."""


class MonthlyCutValidationError(MonthlyCutError):
    """Raised when Monthly Cut parameters or inputs are invalid."""


class MonthlyCutStateError(MonthlyCutError):
    """Raised when attempting an invalid transition on a MonthlyCutRun."""


class TrendingTopicNotFoundError(MonthlyCutError):
    """Raised when a TrendingTopic does not exist."""


@dataclass(frozen=True, slots=True)
class MonthlyCutRun:
    """Execution record of a Corte Mensual with durable checkpoint cursor."""

    id: UUID
    run_type: MonthlyCutRunType
    date_from: date | None
    date_to: date | None
    query_override: str | None
    max_candidates: int
    sources: tuple[str, ...]
    status: MonthlyCutStatus
    collected_count: int
    filtered_count: int
    analyzed_count: int
    checkpoint_cursor: dict[str, Any]
    pause_reason: str | None
    error_message: str | None
    started_at: datetime
    finished_at: datetime | None


@dataclass(frozen=True, slots=True)
class TrendingTopic:
    """Tema de Actualidad contrasted against KnowledgeBase; never enters EvidenceCard index."""

    id: UUID
    monthly_cut_run_id: UUID | None
    title: str
    summary: str
    critical_evaluation: str
    cited_card_ids: tuple[UUID, ...]
    status: TrendingTopicStatus
    created_at: datetime


@dataclass(frozen=True, slots=True)
class QueuedArticle:
    """Deterministic pre-filtered article persisted in checkpoint_cursor for resilient resume."""

    key: str
    title: str
    source_name: str
    source_url: str
    doi: str | None
    pmid: str | None
    pmcid: str | None
    authors: tuple[str, ...]
    journal: str | None
    published_year: int | None
    abstract: str | None
    full_text: str | None
    is_open_access: bool
    priority_score: float

    @property
    def access_level(self) -> AccessLevel:
        return classify_access_level(
            is_open_access=self.is_open_access,
            full_text=self.full_text,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "title": self.title,
            "source_name": self.source_name,
            "source_url": self.source_url,
            "doi": self.doi,
            "pmid": self.pmid,
            "pmcid": self.pmcid,
            "authors": list(self.authors),
            "journal": self.journal,
            "published_year": self.published_year,
            "abstract": self.abstract,
            "full_text": self.full_text,
            "is_open_access": self.is_open_access,
            "priority_score": self.priority_score,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> QueuedArticle:
        return cls(
            key=str(data["key"]),
            title=str(data["title"]),
            source_name=str(data.get("source_name") or "unknown"),
            source_url=str(data.get("source_url") or ""),
            doi=normalize_doi(data.get("doi")),
            pmid=normalize_pmid(data.get("pmid")),
            pmcid=str(data["pmcid"]) if data.get("pmcid") else None,
            authors=tuple(str(a) for a in (data.get("authors") or [])),
            journal=str(data["journal"]) if data.get("journal") else None,
            published_year=int(data["published_year"]) if data.get("published_year") else None,
            abstract=str(data["abstract"]) if data.get("abstract") else None,
            full_text=str(data["full_text"]) if data.get("full_text") else None,
            is_open_access=bool(data.get("is_open_access", False)),
            priority_score=float(data.get("priority_score", 0.0)),
        )


def validate_max_candidates(max_candidates: int) -> int:
    if max_candidates < MIN_MAX_CANDIDATES or max_candidates > MAX_ALLOWED_CANDIDATES:
        raise MonthlyCutValidationError(
            f"El tope de Estudios Candidatos debe estar entre "
            f"{MIN_MAX_CANDIDATES} y {MAX_ALLOWED_CANDIDATES}."
        )
    return max_candidates


def classify_access_level(*, is_open_access: bool, full_text: str | None) -> AccessLevel:
    """Distinguish Open Access full-text vs abstract-only paywall."""
    if is_open_access and full_text and full_text.strip():
        return AccessLevel.FULL_TEXT_OPEN_ACCESS
    return AccessLevel.ABSTRACT_ONLY_PAYWALL


def is_relevant_article(*, title: str, abstract: str | None, journal: str | None) -> bool:
    """Deterministic 0-LLM relevance check for sports science, hypertrophy & sports nutrition."""
    combined = f"{title} {abstract or ''}".lower()
    if any(off in combined for off in OFF_TOPIC_KEYWORDS):
        return False
    has_domain_keyword = any(kw in combined for kw in DOMAIN_KEYWORDS)
    if has_domain_keyword:
        return True
    if journal and journal.strip().lower() in TARGET_JOURNALS:
        # Even in target journals, require at least a minimal fitness/sport signal
        return any(
            term in combined for term in ("training", "muscle", "exercise", "athlete", "diet")
        )
    return False


def score_article_priority(
    *,
    title: str,
    abstract: str | None,
    journal: str | None,
    is_open_access: bool,
    has_full_text: bool,
    published_year: int | None,
) -> float:
    """Deterministic priority score favoring high-level evidence, target journals & Open Access."""
    combined = f"{title} {abstract or ''}".lower()
    score = 0.0

    if "meta-analysis" in combined or "meta-análisis" in combined:
        score += 40.0
    elif "position stand" in combined:
        score += 38.0
    elif "systematic review" in combined or "revisión sistemática" in combined:
        score += 34.0
    elif (
        "randomized controlled" in combined
        or "randomised controlled" in combined
        or "rct" in combined
    ):
        score += 26.0
    elif "controlled trial" in combined:
        score += 20.0
    elif "observational" in combined or "survey" in combined or "cross-sectional" in combined:
        score += 8.0
    else:
        score += 12.0

    if journal and journal.strip().lower() in TARGET_JOURNALS:
        score += 15.0

    if is_open_access and has_full_text:
        score += 10.0

    if published_year and published_year >= 2024:
        score += 5.0

    return score


def build_article_dedup_key(*, doi: str | None, pmid: str | None, title: str) -> str:
    if doi:
        return f"doi:{doi}"
    if pmid:
        return f"pmid:{pmid}"
    return f"title:{' '.join(title.strip().lower().split())}"


def filter_and_prioritize_articles(
    *,
    raw_articles: list[dict[str, Any]],
    existing_dois: set[str],
    existing_pmids: set[str],
    max_candidates: int,
) -> list[QueuedArticle]:
    """Deterministic 0-LLM pre-filtering, deduplication, priority sorting, and cap enforcement."""
    seen_dois: set[str] = {d.lower() for d in existing_dois}
    seen_pmids: set[str] = set(existing_pmids)
    seen_titles: set[str] = set()

    filtered: list[QueuedArticle] = []
    for raw in raw_articles:
        title = str(raw.get("title") or "").strip()
        if not title:
            continue
        abstract = str(raw["abstract"]) if raw.get("abstract") else None
        journal = str(raw["journal"]) if raw.get("journal") else None

        if not is_relevant_article(title=title, abstract=abstract, journal=journal):
            continue

        norm_doi = normalize_doi(raw.get("doi"))
        norm_pmid = normalize_pmid(raw.get("pmid"))
        norm_title = " ".join(title.lower().split())

        if norm_doi and norm_doi in seen_dois:
            continue
        if norm_pmid and norm_pmid in seen_pmids:
            continue
        if norm_title in seen_titles:
            continue

        if norm_doi:
            seen_dois.add(norm_doi)
        if norm_pmid:
            seen_pmids.add(norm_pmid)
        seen_titles.add(norm_title)

        full_text = str(raw["full_text"]) if raw.get("full_text") else None
        is_oa = bool(raw.get("is_open_access", False))
        published_year = int(raw["published_year"]) if raw.get("published_year") else None

        score = score_article_priority(
            title=title,
            abstract=abstract,
            journal=journal,
            is_open_access=is_oa,
            has_full_text=bool(full_text and full_text.strip()),
            published_year=published_year,
        )

        filtered.append(
            QueuedArticle(
                key=build_article_dedup_key(doi=norm_doi, pmid=norm_pmid, title=title),
                title=title,
                source_name=str(raw.get("source_name") or "unknown"),
                source_url=str(raw.get("source_url") or ""),
                doi=norm_doi,
                pmid=norm_pmid,
                pmcid=str(raw["pmcid"]) if raw.get("pmcid") else None,
                authors=tuple(str(a) for a in (raw.get("authors") or [])),
                journal=journal,
                published_year=published_year,
                abstract=abstract,
                full_text=full_text,
                is_open_access=is_oa,
                priority_score=score,
            )
        )

    filtered.sort(key=lambda a: (-a.priority_score, a.title.lower()))
    return filtered[:max_candidates]


@dataclass(frozen=True, slots=True)
class SeedStudySpec:
    """Foundational meta-analysis or Position Stand for the initial idempotent seed batch."""

    doi: str
    pmid: str
    title: str
    authors: tuple[str, ...]
    journal: str
    published_year: int
    source_url: str
    evidence_level: EvidenceLevel
    access_level: AccessLevel
    tags: tuple[str, ...]
    key_terms_en: tuple[str, ...]
    summary_es: str
    population_protocol_es: str
    findings_es: str
    limitations_es: str

    def to_critical_sheet(self) -> CriticalSheet6Blocks:
        return CriticalSheet6Blocks(
            block_1_identification=(
                f"{self.title} | Autores: {', '.join(self.authors)} | "
                f"{self.journal} ({self.published_year}) | "
                f"DOI: {self.doi} (https://doi.org/{self.doi}) | "
                f"PubMed: https://pubmed.ncbi.nlm.nih.gov/{self.pmid}/"
            ),
            block_2_design_and_evidence_level=(
                f"Estudio fundacional del lote semilla. Nivel de evidencia: "
                f"{self.evidence_level.value}."
            ),
            block_3_population_and_protocol=self.population_protocol_es,
            block_4_key_findings_and_applicability=self.findings_es,
            block_5_limitations_and_conflicts=self.limitations_es,
            block_6_impact_vs_existing_kb=(
                "Estudio base fundacional destinado a establecer consensos iniciales en la "
                "Base de Conocimiento tras revisión y aprobación del Curador."
            ),
            suggested_evidence_level=self.evidence_level,
            suggested_tags=self.tags,
            key_terms_en=self.key_terms_en,
            curated_summary_es=self.summary_es,
        )


FOUNDATIONAL_SEED_BATCH: tuple[SeedStudySpec, ...] = (
    SeedStudySpec(
        doi="10.1080/02640414.2016.1210197",
        pmid="27433992",
        title=(
            "Dose-response relationship between weekly resistance training volume and "
            "increases in muscle mass: A systematic review and meta-analysis"
        ),
        authors=("Schoenfeld BJ", "Ogborn D", "Krieger JW"),
        journal="Journal of Sports Sciences",
        published_year=2017,
        source_url="https://doi.org/10.1080/02640414.2016.1210197",
        evidence_level=EvidenceLevel.META_ANALYSIS,
        access_level=AccessLevel.FULL_TEXT_OPEN_ACCESS,
        tags=("hipertrofia", "volumen", "programacion"),
        key_terms_en=("hypertrophy", "weekly volume", "dose-response", "resistance training"),
        summary_es=(
            "Meta-análisis que demuestra una relación dosis-respuesta positiva entre series "
            "semanales y ganancia de masa muscular, con ventaja significativa para >=10 series "
            "por grupo muscular."
        ),
        population_protocol_es=(
            "15 estudios de entrenamiento de fuerza en adultos sanos comparando <5, 5-9 y >=10 "
            "series semanales por grupo muscular."
        ),
        findings_es=(
            "Cada serie semanal adicional se asocia a mayor hipertrofia; >=10 series/semana "
            "superan consistentemente volúmenes bajos."
        ),
        limitations_es=(
            "Heterogeneidad en el conteo de series indirectas y duración media de 6-12 semanas."
        ),
    ),
    SeedStudySpec(
        doi="10.1007/s40279-016-0543-8",
        pmid="27102172",
        title=(
            "Effects of Resistance Training Frequency on Measures of Muscle Hypertrophy: A "
            "Systematic Review and Meta-Analysis"
        ),
        authors=("Schoenfeld BJ", "Ogborn D", "Krieger JW"),
        journal="Sports Medicine",
        published_year=2016,
        source_url="https://doi.org/10.1007/s40279-016-0543-8",
        evidence_level=EvidenceLevel.META_ANALYSIS,
        access_level=AccessLevel.FULL_TEXT_OPEN_ACCESS,
        tags=("hipertrofia", "frecuencia", "programacion"),
        key_terms_en=("training frequency", "hypertrophy", "resistance training"),
        summary_es=(
            "Entrenar un grupo muscular al menos 2 veces por semana produce mayor hipertrofia "
            "que 1 vez por semana cuando el volumen es moderado-alto."
        ),
        population_protocol_es=(
            "10 estudios comparando frecuencia 1 vs 2-3 días semanales por grupo muscular en "
            "adultos."
        ),
        findings_es=(
            "Frecuencia >=2/semana facilita distribuir volumen efectivo con mejor calidad de serie."
        ),
        limitations_es=(
            "Con volumen estrictamente igualado las diferencias son pequeñas; falta evidencia "
            "en frecuencias >3/semana."
        ),
    ),
    SeedStudySpec(
        doi="10.1519/jsc.0000000000002200",
        pmid="28834797",
        title=(
            "Strength and Hypertrophy Adaptations Between Low- vs. High-Load Resistance "
            "Training: A Systematic Review and Meta-Analysis"
        ),
        authors=("Schoenfeld BJ", "Grgic J", "Ogborn D", "Krieger JW"),
        journal="Journal of Strength and Conditioning Research",
        published_year=2017,
        source_url="https://doi.org/10.1519/JSC.0000000000002200",
        evidence_level=EvidenceLevel.META_ANALYSIS,
        access_level=AccessLevel.FULL_TEXT_OPEN_ACCESS,
        tags=("hipertrofia", "fuerza", "carga"),
        key_terms_en=("high-load", "low-load", "1RM", "hypertrophy", "strength"),
        summary_es=(
            "Cargas bajas (<=60% 1RM) y altas (>60% 1RM) producen hipertrofia similar si las "
            "series se llevan cerca del fallo, pero cargas altas son superiores para fuerza "
            "máxima 1RM."
        ),
        population_protocol_es=(
            "21 estudios comparando entrenamiento con cargas bajas vs altas hasta fallo volitivo."
        ),
        findings_es=(
            "Amplio espectro de repeticiones (6-30) válido para hipertrofia; >80% 1RM superior "
            "para ganancias de fuerza máxima."
        ),
        limitations_es=(
            "La mayoría de estudios con cargas bajas llevaron todas las series al fallo "
            "absoluto, aumentando fatiga percibida."
        ),
    ),
    SeedStudySpec(
        doi="10.1007/s40279-022-01784-y",
        pmid="36334240",
        title=(
            "Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle "
            "Hypertrophy: A Systematic Review with Meta-Analysis"
        ),
        authors=("Refalo MC", "Helms ER", "Trexler ET", "Hamilton DL", "Fyfe JJ"),
        journal="Sports Medicine",
        published_year=2023,
        source_url="https://doi.org/10.1007/s40279-022-01784-y",
        evidence_level=EvidenceLevel.META_ANALYSIS,
        access_level=AccessLevel.FULL_TEXT_OPEN_ACCESS,
        tags=("hipertrofia", "rir", "fallo"),
        key_terms_en=("proximity to failure", "RIR", "RPE", "hypertrophy"),
        summary_es=(
            "Entrenar cerca del fallo (RIR 0-2) maximiza la hipertrofia sin necesidad de "
            "llegar siempre al fallo absoluto, controlando mejor la fatiga neuromuscular."
        ),
        population_protocol_es=(
            "15 estudios comparando entrenamiento al fallo vs no-fallo con volumen igualado."
        ),
        findings_es=(
            "RIR 0-2 ofrece el mejor equilibrio estímulo-fatiga; alejarse mucho del fallo (RIR "
            ">=4) reduce el estímulo hipertrófico."
        ),
        limitations_es=(
            "La estimación de RIR varía según experiencia del Atleta y tipo de ejercicio."
        ),
    ),
    SeedStudySpec(
        doi="10.1007/s40279-024-02069-2",
        pmid="38970765",
        title=(
            "Exploring the Dose-Response Relationship Between Estimated Resistance Training "
            "Proximity to Failure, Strength Gain, and Muscle Hypertrophy: A Series of Meta- "
            "Regressions"
        ),
        authors=("Robinson ZP", "Pelland JC", "Remmert JF", "Refalo MC", "Zourdos MC"),
        journal="Sports Medicine",
        published_year=2024,
        source_url="https://doi.org/10.1007/s40279-024-02069-2",
        evidence_level=EvidenceLevel.META_ANALYSIS,
        access_level=AccessLevel.FULL_TEXT_OPEN_ACCESS,
        tags=("hipertrofia", "fuerza", "rir"),
        key_terms_en=("RIR", "proximity to failure", "meta-regression", "hypertrophy", "strength"),
        summary_es=(
            "Meta-regresión que muestra mayor hipertrofia al acercarse al fallo (RIR bajo), "
            "mientras la fuerza máxima progresa de forma robusta incluso a RIR moderados "
            "(2-4)."
        ),
        population_protocol_es=(
            "55 estudios modelados mediante meta-regresión bayesiana de RIR estimado."
        ),
        findings_es=(
            "Hipertrofia responde de forma creciente a menor RIR; fuerza máxima tolera mayor "
            "margen de repeticiones en reserva."
        ),
        limitations_es=(
            "El RIR fue estimado retrospectivamente en estudios que no lo reportaron directamente."
        ),
    ),
    SeedStudySpec(
        doi="10.1186/s12970-017-0177-8",
        pmid="28642676",
        title="International Society of Sports Nutrition Position Stand: protein and exercise",
        authors=("Jager R", "Kerksick CM", "Campbell BI", "Cribb PJ", "Antonio J"),
        journal="Journal of the International Society of Sports Nutrition",
        published_year=2017,
        source_url="https://doi.org/10.1186/s12970-017-0177-8",
        evidence_level=EvidenceLevel.POSITION_STAND,
        access_level=AccessLevel.FULL_TEXT_OPEN_ACCESS,
        tags=("nutricion", "proteina", "issn"),
        key_terms_en=("ISSN", "protein", "MPS", "leucine", "hypertrophy"),
        summary_es=(
            "Consenso ISSN: 1.4-2.0 g/kg/día de proteína para la mayoría de atletas de fuerza "
            "(hasta 2.3-3.1 g/kg de masa libre de grasa en déficit calórico)."
        ),
        population_protocol_es=(
            "Revisión de consenso de la ISSN sobre síntesis proteica muscular (MPS), dosis por "
            "toma y distribución diaria."
        ),
        findings_es=(
            "Tomas de 0.25-0.40 g/kg con 2-3 g de leucina cada 3-4 horas optimizan la MPS diaria."
        ),
        limitations_es=(
            "Necesidades individuales varían según porcentaje graso, edad y magnitud del "
            "déficit energético."
        ),
    ),
    SeedStudySpec(
        doi="10.1136/bjsports-2017-097608",
        pmid="28698222",
        title=(
            "A systematic review, meta-analysis and meta-regression of the effect of protein "
            "supplementation on resistance training-induced gains in muscle mass and strength "
            "in healthy adults"
        ),
        authors=("Morton RW", "Murphy KT", "McKellar SR", "Schoenfeld BJ", "Phillips SM"),
        journal="British Journal of Sports Medicine",
        published_year=2018,
        source_url="https://doi.org/10.1136/bjsports-2017-097608",
        evidence_level=EvidenceLevel.META_ANALYSIS,
        access_level=AccessLevel.FULL_TEXT_OPEN_ACCESS,
        tags=("nutricion", "proteina", "hipertrofia"),
        key_terms_en=("protein", "fat-free mass", "1RM", "resistance training"),
        summary_es=(
            "Meta-análisis de 49 ECA: la ingesta total de proteína maximiza ganancias de masa "
            "libre de grasa alrededor de 1.6 g/kg/día (IC superior ~2.2 g/kg/día)."
        ),
        population_protocol_es=(
            "49 ensayos clínicos aleatorizados (n=1863) en adultos realizando entrenamiento de "
            "fuerza >=6 semanas."
        ),
        findings_es=(
            "Beneficio significativo en fuerza y masa magra hasta ~1.62 g/kg/día en superávit "
            "o mantenimiento."
        ),
        limitations_es=(
            "Menor representación de atletas en déficit calórico severo o fisioculturistas "
            "avanzados."
        ),
    ),
    SeedStudySpec(
        doi="10.1186/s12970-017-0173-z",
        pmid="28615996",
        title=(
            "International Society of Sports Nutrition position stand: safety and efficacy of "
            "creatine supplementation in exercise, sport, and medicine"
        ),
        authors=("Kreider RB", "Kalman DS", "Antonio J", "Ziegenfuss TN", "Wildman R"),
        journal="Journal of the International Society of Sports Nutrition",
        published_year=2017,
        source_url="https://doi.org/10.1186/s12970-017-0173-z",
        evidence_level=EvidenceLevel.POSITION_STAND,
        access_level=AccessLevel.FULL_TEXT_OPEN_ACCESS,
        tags=("suplementacion", "creatina", "issn"),
        key_terms_en=("ISSN", "creatine monohydrate", "phosphocreatine", "ergogenic"),
        summary_es=(
            "Consenso ISSN: el monohidrato de creatina (3-5 g/día) es el suplemento ergogénico "
            "más efectivo y seguro para fuerza, potencia e hipertrofia."
        ),
        population_protocol_es=(
            "Revisión exhaustiva de ensayos clínicos sobre eficacia, dosificación y seguridad "
            "renal/metabólica."
        ),
        findings_es=(
            "Dosis diaria de 3-5 g (0.03-0.05 g/kg) satura depósitos musculares en 3-4 semanas "
            "sin necesidad de fase de carga obligatoria."
        ),
        limitations_es=(
            "Aumento inicial de peso corporal de 1-2 kg por retención intracelular de agua."
        ),
    ),
    SeedStudySpec(
        doi="10.1186/s12970-020-00383-4",
        pmid="33388079",
        title=(
            "International society of sports nutrition position stand: caffeine and exercise "
            "performance"
        ),
        authors=("Guest NS", "VanDusseldorp TA", "Nelson MT", "Grgic J", "Campbell BI"),
        journal="Journal of the International Society of Sports Nutrition",
        published_year=2021,
        source_url="https://doi.org/10.1186/s12970-020-00383-4",
        evidence_level=EvidenceLevel.POSITION_STAND,
        access_level=AccessLevel.FULL_TEXT_OPEN_ACCESS,
        tags=("suplementacion", "cafeina", "issn"),
        key_terms_en=("ISSN", "caffeine", "ergogenic", "strength", "RPE"),
        summary_es=(
            "Consenso ISSN: 3-6 mg/kg de cafeína 45-60 min pre-entreno mejoran rendimiento "
            "muscular, fuerza y reducen percepción de esfuerzo."
        ),
        population_protocol_es=(
            "Revisión de evidencia sobre dosis, momento de ingesta, tolerancia y variabilidad "
            "genética."
        ),
        findings_es=(
            "Efecto ergogénico consistente; evitar consumo tardío para no comprometer "
            "arquitectura del sueño."
        ),
        limitations_es=(
            "Respuesta individual variable (polimorfismo CYP1A2) y riesgo de ansiedad o "
            "insomnio en dosis altas."
        ),
    ),
    SeedStudySpec(
        doi="10.1186/s12970-017-0189-4",
        pmid="28919842",
        title="International society of sports nutrition position stand: nutrient timing",
        authors=("Kerksick CM", "Arent S", "Schoenfeld BJ", "Stout JR", "Campbell B"),
        journal="Journal of the International Society of Sports Nutrition",
        published_year=2017,
        source_url="https://doi.org/10.1186/s12970-017-0189-4",
        evidence_level=EvidenceLevel.POSITION_STAND,
        access_level=AccessLevel.FULL_TEXT_OPEN_ACCESS,
        tags=("nutricion", "timing", "issn"),
        key_terms_en=("ISSN", "nutrient timing", "glycogen", "protein", "carbohydrates"),
        summary_es=(
            "Consenso ISSN: el total diario de calorías y macros es prioritario, pero "
            "distribuir proteína y carbohidratos alrededor del entreno optimiza rendimiento y "
            "recuperación."
        ),
        population_protocol_es=(
            "Revisión de consenso sobre ingesta pre, intra y post-entrenamiento."
        ),
        findings_es=(
            "Aporte de proteína de alta calidad en ventana de 2-4 horas alrededor de la sesión "
            "y carbohidratos suficientes en alto volumen."
        ),
        limitations_es=(
            "La ventana anabólica aguda es más amplia de lo tradicionalmente creído cuando se "
            "entrena alimentado."
        ),
    ),
    SeedStudySpec(
        doi="10.1186/s12970-017-0174-y",
        pmid="28630601",
        title=(
            "International society of sports nutrition position stand: diets and body composition"
        ),
        authors=("Aragon AA", "Schoenfeld BJ", "Wildman R", "Kleiner S", "Antonio J"),
        journal="Journal of the International Society of Sports Nutrition",
        published_year=2017,
        source_url="https://doi.org/10.1186/s12970-017-0174-y",
        evidence_level=EvidenceLevel.POSITION_STAND,
        access_level=AccessLevel.FULL_TEXT_OPEN_ACCESS,
        tags=("nutricion", "composicion_corporal", "issn"),
        key_terms_en=("ISSN", "body composition", "caloric deficit", "fat loss", "adherence"),
        summary_es=(
            "Consenso ISSN: el balance energético determina cambios de peso, mientras proteína "
            "elevada y entrenamiento de fuerza preservan masa magra en definición."
        ),
        population_protocol_es=(
            "Revisión comparativa de estrategias dietéticas (baja en grasa, baja en "
            "carbohidratos, ayuno intermitente, alta en proteína)."
        ),
        findings_es=(
            "Ningún enfoque dietético supera a otro a igualdad calórica y proteica; la "
            "adherencia a largo plazo es determinante."
        ),
        limitations_es=(
            "Datos a largo plazo (>12 meses) muestran alta tasa de reganancia sin hábitos "
            "sostenibles."
        ),
    ),
    SeedStudySpec(
        doi="10.1186/s12970-015-0090-y",
        pmid="26175657",
        title="International society of sports nutrition position stand: Beta-Alanine",
        authors=("Trexler ET", "Smith-Ryan AE", "Stout JR", "Hoffman JR", "Antonio J"),
        journal="Journal of the International Society of Sports Nutrition",
        published_year=2015,
        source_url="https://doi.org/10.1186/s12970-015-0090-y",
        evidence_level=EvidenceLevel.POSITION_STAND,
        access_level=AccessLevel.FULL_TEXT_OPEN_ACCESS,
        tags=("suplementacion", "beta_alanina", "issn"),
        key_terms_en=("ISSN", "beta-alanine", "carnosine", "ergogenic"),
        summary_es=(
            "Consenso ISSN: 4-6 g/día de beta-alanina durante >=4 semanas elevan carnosina "
            "muscular y mejoran esfuerzos de alta intensidad de 1-4 minutos."
        ),
        population_protocol_es=(
            "Revisión de ensayos clínicos sobre dosificación crónica y rendimiento anaeróbico."
        ),
        findings_es=(
            "Beneficio principalmente en series de muy alta duración o densidad metabólica; "
            "menor impacto en esfuerzos <60s."
        ),
        limitations_es=(
            "Parestesia transitoria mitigada con dosis divididas o liberación sostenida."
        ),
    ),
    SeedStudySpec(
        doi="10.1007/s40279-017-0765-4",
        pmid="28726172",
        title=(
            "The effects of short versus long inter-set rest intervals in resistance training "
            "on measures of muscle hypertrophy: A systematic review"
        ),
        authors=("Grgic J", "Lazinica B", "Mikulic P", "Krieger JW", "Schoenfeld BJ"),
        journal="European Journal of Sport Science",
        published_year=2017,
        source_url="https://doi.org/10.1007/s40279-017-0765-4",
        evidence_level=EvidenceLevel.SYSTEMATIC_REVIEW,
        access_level=AccessLevel.FULL_TEXT_OPEN_ACCESS,
        tags=("hipertrofia", "descanso", "programacion"),
        key_terms_en=("inter-set rest", "hypertrophy", "resistance training"),
        summary_es=(
            "Descansos >=2 minutos en ejercicios multiarticulares favorecen mayor volumen de "
            "carga e hipertrofia frente a descansos <=60 segundos."
        ),
        population_protocol_es=(
            "Revisión sistemática de 6 ensayos comparando descansos cortos (<=60s) vs largos "
            "(>60s-180s)."
        ),
        findings_es=(
            "Descansos de 2-3 min recomendados en compuestos pesados; 60-90s aceptables en "
            "analíticos si el volumen se mantiene."
        ),
        limitations_es="Número limitado de estudios longitudinales en sujetos avanzados.",
    ),
    SeedStudySpec(
        doi="10.1007/s40279-023-01815-2",
        pmid="36802057",
        title=(
            "Partial vs Full Range of Motion Resistance Training: A Systematic Review and "
            "Meta-Analysis"
        ),
        authors=("Wolf M", "Androulakis-Korakakis P", "Fisher J", "Schoenfeld BJ", "Steele J"),
        journal="International Journal of Strength and Conditioning",
        published_year=2023,
        source_url="https://doi.org/10.1007/s40279-023-01815-2",
        evidence_level=EvidenceLevel.META_ANALYSIS,
        access_level=AccessLevel.FULL_TEXT_OPEN_ACCESS,
        tags=("hipertrofia", "rom", "parciales"),
        key_terms_en=("range of motion", "lengthened partials", "ROM", "hypertrophy"),
        summary_es=(
            "El entrenamiento en longitudes musculares largas (ROM completo o parciales en "
            "estiramiento) produce mayor hipertrofia que parciales en acortamiento."
        ),
        population_protocol_es=(
            "23 estudios comparando ROM completo, parciales en estiramiento y parciales en "
            "acortamiento."
        ),
        findings_es=(
            "Priorizar rango completo controlado y tensión en estiramiento; las parciales en "
            "estiramiento son una herramienta útil adicional."
        ),
        limitations_es=(
            "Resultados varían según arquitectura muscular y curva de resistencia del ejercicio."
        ),
    ),
    SeedStudySpec(
        doi="10.1186/1550-2783-11-20",
        pmid="24864135",
        title=(
            "Evidence-based recommendations for natural bodybuilding contest preparation: "
            "nutrition and supplementation"
        ),
        authors=("Helms ER", "Aragon AA", "Fitschen PJ"),
        journal="Journal of the International Society of Sports Nutrition",
        published_year=2014,
        source_url="https://doi.org/10.1186/1550-2783-11-20",
        evidence_level=EvidenceLevel.SYSTEMATIC_REVIEW,
        access_level=AccessLevel.FULL_TEXT_OPEN_ACCESS,
        tags=("fisioculturismo", "definicion", "nutricion"),
        key_terms_en=("natural bodybuilding", "caloric deficit", "protein", "fat loss"),
        summary_es=(
            "Guía basada en evidencia para definición natural: ritmo de pérdida de 0.5-1% del "
            "peso corporal/semana, proteína de 2.3-3.1 g/kg de masa libre de grasa y grasas "
            ">=15-30%."
        ),
        population_protocol_es=(
            "Revisión enfocada específicamente en atletas naturales en fase de déficit "
            "calórico y preparación."
        ),
        findings_es=(
            "Ritmos moderados de pérdida reducen el riesgo de pérdida de masa muscular y "
            "fatiga endocrina."
        ),
        limitations_es=(
            "Basada en integración de estudios de atletas de fuerza y casos de fisioculturismo "
            "natural."
        ),
    ),
    SeedStudySpec(
        doi="10.5114/biolsport.2022.105332",
        pmid="35173366",
        title=(
            "A Systematic Review of the Effects of Different Resistance Training Volumes on "
            "Muscle Hypertrophy"
        ),
        authors=("Baz-Valle E", "Balsalobre-Fernandez C", "Alix-Fages C", "Santos-Concejero J"),
        journal="Journal of Human Kinetics",
        published_year=2022,
        source_url="https://doi.org/10.5114/biolsport.2022.105332",
        evidence_level=EvidenceLevel.SYSTEMATIC_REVIEW,
        access_level=AccessLevel.FULL_TEXT_OPEN_ACCESS,
        tags=("hipertrofia", "volumen", "mesociclo"),
        key_terms_en=("weekly sets", "hypertrophy", "training volume", "trained subjects"),
        summary_es=(
            "En sujetos entrenados, un rango práctico de 12-20 series semanales por grupo "
            "muscular maximiza la hipertrofia sin evidencia clara de beneficio adicional por "
            "encima de 20 series."
        ),
        population_protocol_es=(
            "7 estudios en sujetos con experiencia previa en fuerza comparando volúmenes "
            "moderados vs altos."
        ),
        findings_es=(
            "Rango de 12-20 series semanales directas por grupo muscular como referencia "
            "práctica para mesociclos."
        ),
        limitations_es="Alta variabilidad interindividual en volumen máximo recuperable (MRV).",
    ),
)
