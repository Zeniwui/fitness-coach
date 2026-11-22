"""Coach Chat domain model, policies, and pure rules (zero framework imports).

Canonical vocabulary follows GLOSSARY.md and ADR-0001 / ADR-0002 / ADR-0003:
- Coach, Atleta (Athlete), Curador (Curator)
- Base de Conocimiento (KnowledgeBase), Ficha de Evidencia (EvidenceCard)
- Estudio Candidato (CandidateStudy), Perfil Vivo (LivingProfile)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from fitness_coach.domain.profile import LivingProfile

LIVE_SEARCH_QUARANTINE_LABEL = "fuente externa aún no verificada en Base de Conocimiento"
CONVERSATION_TITLE_MAX_LENGTH = 200

GENERAL_KNOWLEDGE_DISCLOSURE_ES = (
    "Nota: No existen Fichas de Evidencia aprobadas aplicables en la Base de Conocimiento "
    "para esta consulta; respondo desde conocimiento general."
)

PEDS_BOUNDARY_NOTICE_ES = (
    "Por política de entrenamiento natural, no prescribo ciclos, dosis ni protocolos de "
    "farmacología deportiva o PEDs. Puedo ofrecerte contexto científico objetivo y principios "
    "generales de reducción de daños."
)

CLINICAL_BOUNDARY_NOTICE_ES = (
    "No puedo diagnosticar patologías médicas ni prescribir nutrición clínica. Puedo sugerir "
    "adaptaciones conservadoras de entrenamiento y te recomiendo consultar con un médico, "
    "fisioterapeuta o nutricionista clínico cualificado."
)


class MessageRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"


class ProposalStatus(StrEnum):
    PROPOSED = "proposed"
    ACCEPTED = "accepted"
    DISMISSED = "dismissed"


class BoundaryKind(StrEnum):
    NONE = "none"
    PEDS = "peds"
    CLINICAL = "clinical"


class CoachError(Exception):
    """Base domain error for Coach Chat."""


class CoachValidationError(CoachError):
    """Raised when chat input or proposal payload violates domain rules."""


class ConversationNotFoundError(CoachError):
    """Raised when a conversation does not exist or does not belong to the Athlete."""


class ProposalNotFoundError(CoachError):
    """Raised when a Living Profile update proposal does not exist for the Athlete."""


class InvalidProposalStateError(CoachError):
    """Raised when attempting to accept or dismiss an already resolved proposal."""


def validate_conversation_title(title: str) -> str:
    """Trim and validate a non-empty Coach conversation title within max length."""
    cleaned = title.strip()
    if not cleaned:
        raise CoachValidationError("El título de la conversación no puede estar vacío.")
    if len(cleaned) > CONVERSATION_TITLE_MAX_LENGTH:
        raise CoachValidationError(
            "El título de la conversación no puede superar los "
            f"{CONVERSATION_TITLE_MAX_LENGTH} caracteres."
        )
    return cleaned


@dataclass(frozen=True, slots=True)
class Citation:
    """Clickable citation to an approved EvidenceCard in the Knowledge Base."""

    card_id: UUID
    title: str
    evidence_level: str
    validity_status: str
    doi: str | None = None
    pmid: str | None = None
    source_url: str | None = None
    superseded_by_card_id: UUID | None = None
    superseded_by_title: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "card_id": str(self.card_id),
            "title": self.title,
            "evidence_level": self.evidence_level,
            "validity_status": self.validity_status,
            "doi": self.doi,
            "pmid": self.pmid,
            "source_url": self.source_url,
            "superseded_by_card_id": (
                str(self.superseded_by_card_id) if self.superseded_by_card_id else None
            ),
            "superseded_by_title": self.superseded_by_title,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Citation:
        sup_id = data.get("superseded_by_card_id")
        return cls(
            card_id=UUID(str(data["card_id"])),
            title=str(data["title"]),
            evidence_level=str(data["evidence_level"]),
            validity_status=str(data.get("validity_status", "active")),
            doi=data.get("doi"),
            pmid=data.get("pmid"),
            source_url=data.get("source_url"),
            superseded_by_card_id=UUID(str(sup_id)) if sup_id else None,
            superseded_by_title=data.get("superseded_by_title"),
        )


@dataclass(frozen=True, slots=True)
class QuarantinedLiveResult:
    """External live-search hit quarantined outside the approved Knowledge Base."""

    title: str
    url: str
    snippet: str
    doi: str | None = None
    pmid: str | None = None
    published_year: int | None = None
    quarantine_label: str = LIVE_SEARCH_QUARANTINE_LABEL

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "url": self.url,
            "snippet": self.snippet,
            "doi": self.doi,
            "pmid": self.pmid,
            "published_year": self.published_year,
            "quarantine_label": self.quarantine_label,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> QuarantinedLiveResult:
        return cls(
            title=str(data["title"]),
            url=str(data["url"]),
            snippet=str(data.get("snippet", "")),
            doi=data.get("doi"),
            pmid=data.get("pmid"),
            published_year=data.get("published_year"),
            quarantine_label=str(data.get("quarantine_label") or LIVE_SEARCH_QUARANTINE_LABEL),
        )


@dataclass(frozen=True, slots=True)
class ProfileUpdateProposal:
    """Structured Coach proposal to update an Athlete's Living Profile upon confirmation."""

    id: UUID
    athlete_id: UUID
    message_id: UUID | None
    proposed_changes: dict[str, Any]
    summary_es: str
    status: ProposalStatus
    created_at: datetime
    resolved_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class Conversation:
    """Longitudinal chat thread owned strictly by one Athlete."""

    id: UUID
    athlete_id: UUID
    title: str
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class ChatMessage:
    """Persisted turn in a Coach conversation."""

    id: UUID
    conversation_id: UUID
    athlete_id: UUID
    role: MessageRole
    content: str
    citations: tuple[Citation, ...] = field(default_factory=tuple)
    live_search_results: tuple[QuarantinedLiveResult, ...] = field(default_factory=tuple)
    used_general_knowledge: bool = False
    boundary_triggered: BoundaryKind = BoundaryKind.NONE
    created_at: datetime | None = None


_PEDS_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"\b(ciclo|ciclos)\b.{0,40}\b(esteroides|testosterona|quimica|química|anabol|"
        r"peds?|sarms?|trembolona|oxandrolona|anavar|winstrol|dianabol|boldenona|"
        r"clenbuterol|deca)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(dosis|protocolo|pauta|inyectar|pinchar|mg/semana)\b.{0,40}\b(testosterona|"
        r"esteroides|sarms?|trembolona|oxandrolona|anavar|clenbuterol|hgh|"
        r"hormona de crecimiento|peds?|farmacolog|anabólic|anabolic)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(esteroides anab|trembolona|oxandrolona|anavar|dianabol|winstrol|"
        r"clenbuterol|sarms|ostarine|rad-?140|mk-?677|trt sin receta|peds)\b",
        re.IGNORECASE,
    ),
)

_CLINICAL_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"\b(diagn[oó]stic[oa]|diagnosticar|diagnostícame|qué enfermedad tengo|"
        r"que enfermedad tengo|patolog[ií]a)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(nutrici[oó]n cl[ií]nica|dieta para diabetes|diabetes tipo 1|"
        r"insuficiencia renal|enfermedad renal|celiaqu[ií]a cl[ií]nica|"
        r"trastorno de la conducta alimentaria|anorexia|bulimia)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(rotura de ligamento|desgarro completo|hernia discal aguda|"
        r"p[eé]rdida de fuerza en la pierna|hormigueo constante|dolor en el pecho|"
        r"receta m[eé]dica|qu[eé] medicamento|que medicamento|antiinflamatorio recetado)\b",
        re.IGNORECASE,
    ),
)

_LIVE_SEARCH_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"\b(busca|buscar|b[uú]squeda en vivo|investiga en internet|internet|en vivo)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(estudio reciente|nuevo estudio|[uú]ltimo estudio|paper reciente|"
        r"investigaci[oó]n reciente|evidencia reciente|estudio de 202[4-9])\b",
        re.IGNORECASE,
    ),
)

_INJURY_CUE = r"\b(me duele|dolor|molestia|lesi[oó]n|pinchazo).{0,25}"
_INJURY_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("Hombro", re.compile(_INJURY_CUE + r"\b(hombro[s]?)\b", re.IGNORECASE)),
    ("Rodilla", re.compile(_INJURY_CUE + r"\b(rodilla[s]?)\b", re.IGNORECASE)),
    ("Zona lumbar", re.compile(_INJURY_CUE + r"\b(lumbar|espalda baja)\b", re.IGNORECASE)),
    ("Codo", re.compile(_INJURY_CUE + r"\b(codo[s]?)\b", re.IGNORECASE)),
    ("Muñeca", re.compile(_INJURY_CUE + r"\b(mu[nñ]eca[s]?)\b", re.IGNORECASE)),
    ("Cadera", re.compile(_INJURY_CUE + r"\b(cadera[s]?)\b", re.IGNORECASE)),
    ("Tobillo", re.compile(_INJURY_CUE + r"\b(tobillo[s]?)\b", re.IGNORECASE)),
)

_DAYS_RE = re.compile(
    r"\b(?:ahora|solo|solamente|puedo|voy a|entrenar[eé]?|entreno)\b.{0,25}\b([1-7])\s*d[ií]as?\b",
    re.IGNORECASE,
)
_DURATION_RE = re.compile(
    r"\b(?:sesiones? de|solo tengo|tengo)\s*(\d{2,3})\s*(?:min|minutos)\b",
    re.IGNORECASE,
)
_EQUIPMENT_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("mancuernas", "Mancuernas"),
    ("barra", "Barra"),
    ("rack", "Rack"),
    ("bandas", "Bandas elásticas"),
    ("kettlebell", "Kettlebell"),
    ("polea", "Polea"),
    ("gimnasio en casa", "Gimnasio en casa"),
)
_ALLERGY_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("lactosa", "Lactosa"),
    ("gluten", "Gluten"),
    ("frutos secos", "Frutos secos"),
    ("huevo", "Huevo"),
    ("marisco", "Marisco"),
)
_FOOD_PREF_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("vegetariano", "Vegetariano"),
    ("vegetariana", "Vegetariano"),
    ("vegano", "Vegano"),
    ("vegana", "Vegano"),
)


class CoachPolicy:
    """Pure domain policy enforcing safety boundaries, quarantine, and context detection."""

    @staticmethod
    def classify_boundary(user_text: str) -> BoundaryKind:
        text = user_text.strip()
        if any(pattern.search(text) for pattern in _PEDS_PATTERNS):
            return BoundaryKind.PEDS
        if any(pattern.search(text) for pattern in _CLINICAL_PATTERNS):
            return BoundaryKind.CLINICAL
        return BoundaryKind.NONE

    @staticmethod
    def should_trigger_live_search(
        *,
        user_text: str,
        explicit_request: bool,
        kb_hits_count: int,
    ) -> bool:
        if explicit_request:
            return True
        if kb_hits_count > 0:
            return False
        return any(pattern.search(user_text) for pattern in _LIVE_SEARCH_PATTERNS)

    @staticmethod
    def detect_profile_change(
        *,
        user_text: str,
        current_profile: LivingProfile | None,
    ) -> tuple[dict[str, Any], str] | None:
        """Detect explicit Athlete context updates mentioned in conversation."""
        changes: dict[str, Any] = {}
        summary_parts: list[str] = []
        lowered = user_text.lower()

        for body_part, pattern in _INJURY_PATTERNS:
            if pattern.search(user_text):
                changes["new_injury"] = {
                    "body_part": body_part,
                    "description": user_text.strip()[:220],
                    "severity": "moderate",
                }
                summary_parts.append(f"Registrar molestia/lesión activa en {body_part}")
                break

        days_match = _DAYS_RE.search(user_text)
        if days_match:
            days = int(days_match.group(1))
            if current_profile is None or current_profile.training_days_per_week != days:
                changes["training_days_per_week"] = days
                summary_parts.append(f"Actualizar disponibilidad a {days} días/semana")

        duration_match = _DURATION_RE.search(user_text)
        if duration_match:
            minutes = int(duration_match.group(1))
            if 15 <= minutes <= 240 and (
                current_profile is None or current_profile.session_duration_min != minutes
            ):
                changes["session_duration_min"] = minutes
                summary_parts.append(f"Actualizar duración de sesión a {minutes} min")

        eq_cues = (
            "ahora tengo",
            "entreno en casa",
            "solo tengo",
            "cambié de equipo",
            "cambie de equipo",
        )
        if any(cue in lowered for cue in eq_cues):
            eq_items = current_profile.equipment if current_profile else ()
            existing_eq = {e.lower() for e in eq_items}
            new_eq = [
                label
                for kw, label in _EQUIPMENT_KEYWORDS
                if kw in lowered and label.lower() not in existing_eq
            ]
            if new_eq:
                changes["equipment_add"] = new_eq
                summary_parts.append(f"Añadir equipo disponible: {', '.join(new_eq)}")

        al_cues = ("alergia", "alérgico", "alergico", "intolerante", "intolerancia")
        if any(cue in lowered for cue in al_cues):
            al_items = current_profile.allergies if current_profile else ()
            existing_al = {a.lower() for a in al_items}
            new_al = [
                label
                for kw, label in _ALLERGY_KEYWORDS
                if kw in lowered and label.lower() not in existing_al
            ]
            if new_al:
                changes["allergies_add"] = new_al
                summary_parts.append(f"Añadir alergia/intolerancia: {', '.join(new_al)}")

        if any(cue in lowered for cue in ("soy ", "ahora soy ", "prefiero dieta ", "preferencia")):
            existing_fp = {
                f.lower() for f in (current_profile.food_preferences if current_profile else ())
            }
            new_fp = [
                label
                for kw, label in _FOOD_PREF_KEYWORDS
                if kw in lowered and label.lower() not in existing_fp
            ]
            if new_fp:
                changes["food_preferences_add"] = new_fp
                summary_parts.append(f"Añadir preferencia alimentaria: {', '.join(new_fp)}")

        if not changes:
            return None
        return changes, "; ".join(summary_parts) + "."

    @staticmethod
    def ensure_policy_disclosures(
        *,
        text: str,
        used_general_knowledge: bool,
        boundary: BoundaryKind,
        has_live_search: bool,
    ) -> str:
        """Guarantee mandatory Spanish disclosures appear in the persisted Coach response."""
        parts: list[str] = []
        lowered = text.lower()

        if boundary == BoundaryKind.PEDS and "no prescribo" not in lowered:
            parts.append(PEDS_BOUNDARY_NOTICE_ES)
        elif boundary == BoundaryKind.CLINICAL and "no puedo diagnosticar" not in lowered:
            parts.append(CLINICAL_BOUNDARY_NOTICE_ES)

        parts.append(text.strip())

        if used_general_knowledge and "conocimiento general" not in lowered:
            parts.append(GENERAL_KNOWLEDGE_DISCLOSURE_ES)

        if has_live_search and LIVE_SEARCH_QUARANTINE_LABEL.lower() not in lowered:
            parts.append(
                f"Aviso de cuarentena: los resultados externos mostrados corresponden a "
                f"{LIVE_SEARCH_QUARANTINE_LABEL}."
            )

        return "\n\n".join(p for p in parts if p)
