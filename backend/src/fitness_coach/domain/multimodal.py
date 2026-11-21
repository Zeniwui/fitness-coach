"""Multimodal Gym Flows domain model (pure Python: zero framework/SDK imports)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from fitness_coach.domain.training import (
    LoadUnit,
    SessionOrigin,
    normalize_muscle_group,
)

ALLOWED_IMAGE_MIME_TYPES: frozenset[str] = frozenset(
    {"image/jpeg", "image/png", "image/webp"}
)
ALLOWED_AUDIO_MIME_TYPES: frozenset[str] = frozenset(
    {
        "audio/webm",
        "audio/mpeg",
        "audio/mp3",
        "audio/mp4",
        "audio/m4a",
        "audio/wav",
        "audio/x-wav",
        "audio/ogg",
    }
)
MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_AUDIO_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB

_MIME_TO_EXT: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "audio/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
}


class AttachmentMediaType(StrEnum):
    IMAGE = "image"
    AUDIO = "audio"


class ImageAnalysisCategory(StrEnum):
    MEAL = "meal"
    LABEL_SUPPLEMENT = "label_supplement"
    SCALE_TRACKER = "scale_tracker"
    GENERAL = "general"


class MultimodalError(Exception):
    """Base domain error for multimodal flows."""


class MultimodalValidationError(MultimodalError):
    """Raised when uploaded media or natural-language input fails domain validation."""


class AttachmentNotFoundError(MultimodalError):
    """Raised when an attachment does not exist or does not belong to the Athlete."""


@dataclass(frozen=True, slots=True)
class Attachment:
    """Persisted Athlete-scoped binary attachment metadata (ADR-0002)."""

    id: UUID
    athlete_id: UUID
    message_id: UUID | None
    media_type: AttachmentMediaType
    mime_type: str
    original_filename: str | None
    storage_path: str
    size_bytes: int
    category: ImageAnalysisCategory | None
    created_at: datetime


def _has_valid_image_signature(data: bytes, mime_type: str) -> bool:
    if mime_type == "image/png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if mime_type == "image/jpeg":
        return data.startswith(b"\xff\xd8\xff")
    if mime_type == "image/webp":
        return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    return False


def validate_attachment_upload(
    *,
    data: bytes,
    mime_type: str,
    category: ImageAnalysisCategory | None = None,
) -> tuple[AttachmentMediaType, str, str]:
    """Validate uploaded attachment bytes and MIME type.

    Returns (media_type, normalized_mime_type, file_extension).
    """
    normalized_mime = mime_type.split(";", 1)[0].strip().lower()
    if not data:
        raise MultimodalValidationError("El archivo adjunto está vacío.")

    if normalized_mime in ALLOWED_IMAGE_MIME_TYPES:
        if len(data) > MAX_IMAGE_SIZE_BYTES:
            raise MultimodalValidationError(
                "La imagen supera el tamaño máximo permitido de 10 MB."
            )
        if not _has_valid_image_signature(data, normalized_mime):
            raise MultimodalValidationError(
                "El archivo no corresponde a una imagen válida (JPEG, PNG o WebP)."
            )
        return AttachmentMediaType.IMAGE, normalized_mime, _MIME_TO_EXT[normalized_mime]

    if normalized_mime in ALLOWED_AUDIO_MIME_TYPES:
        if len(data) > MAX_AUDIO_SIZE_BYTES:
            raise MultimodalValidationError(
                "El archivo de audio supera el tamaño máximo permitido de 15 MB."
            )
        return AttachmentMediaType.AUDIO, normalized_mime, _MIME_TO_EXT[normalized_mime]

    raise MultimodalValidationError(
        "Formato de archivo no soportado. Usa imágenes (JPEG, PNG, WebP) o audio "
        "(WebM, MP3, WAV, OGG, M4A)."
    )


def validate_audio_upload(*, data: bytes, mime_type: str) -> str:
    """Validate audio payload for Spanish transcription and return normalized MIME type."""
    normalized_mime = mime_type.split(";", 1)[0].strip().lower()
    if not data:
        raise MultimodalValidationError("La grabación de audio está vacía.")
    if normalized_mime not in ALLOWED_AUDIO_MIME_TYPES:
        raise MultimodalValidationError(
            "Formato de audio no soportado. Usa WebM, MP3, WAV, OGG o M4A."
        )
    if len(data) > MAX_AUDIO_SIZE_BYTES:
        raise MultimodalValidationError(
            "El archivo de audio supera el tamaño máximo permitido de 15 MB."
        )
    return normalized_mime


@dataclass(frozen=True, slots=True)
class DraftSetEntry:
    """Single parsed set inside an unconfirmed TrainingSessionDraft."""

    exercise_name: str
    muscle_group: str
    set_order: int
    reps: int | None
    load: float | None
    unit: LoadUnit = LoadUnit.KG
    rir: float | None = None
    rpe: float | None = None
    notes: str | None = None
    missing_fields: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "exercise_name": self.exercise_name,
            "muscle_group": self.muscle_group,
            "set_order": self.set_order,
            "reps": self.reps,
            "load": self.load,
            "unit": self.unit.value,
            "rir": self.rir,
            "rpe": self.rpe,
            "notes": self.notes,
            "missing_fields": list(self.missing_fields),
        }


@dataclass(frozen=True, slots=True)
class AmbiguityFlag:
    """Explicit missing or ambiguous field surfaced to the Athlete before saving."""

    field: str
    set_index: int | None
    message_es: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "field": self.field,
            "set_index": self.set_index,
            "message_es": self.message_es,
        }


@dataclass(frozen=True, slots=True)
class TrainingSessionDraft:
    """Structured editable draft of a TrainingSession — NEVER persisted until confirmed."""

    session_date: date
    name: str
    origin: SessionOrigin
    raw_text: str
    fatigue_notes: str | None
    sets: tuple[DraftSetEntry, ...]
    ambiguities: tuple[AmbiguityFlag, ...]
    needs_confirmation: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "session_date": self.session_date.isoformat(),
            "name": self.name,
            "origin": self.origin.value,
            "raw_text": self.raw_text,
            "fatigue_notes": self.fatigue_notes,
            "sets": [s.to_dict() for s in self.sets],
            "ambiguities": [a.to_dict() for a in self.ambiguities],
            "needs_confirmation": self.needs_confirmation,
        }


_EXERCISE_MUSCLE_HINTS: tuple[tuple[str, str], ...] = (
    ("press banca", "pecho"),
    ("press inclinado", "pecho"),
    ("press declinado", "pecho"),
    ("aperturas", "pecho"),
    ("cruces", "pecho"),
    ("fondos", "pecho"),
    ("pecho", "pecho"),
    ("dominadas", "espalda"),
    ("jalon", "espalda"),
    ("jalón", "espalda"),
    ("remo", "espalda"),
    ("espalda", "espalda"),
    ("sentadilla", "cuadriceps"),
    ("prensa", "cuadriceps"),
    ("extension de cuadriceps", "cuadriceps"),
    ("extensión de cuádriceps", "cuadriceps"),
    ("zancada", "cuadriceps"),
    ("bulgara", "cuadriceps"),
    ("búlgara", "cuadriceps"),
    ("peso muerto", "isquios"),
    ("curl femoral", "isquios"),
    ("hip thrust", "gluteos"),
    ("press militar", "hombros"),
    ("elevaciones laterales", "hombros"),
    ("pajaros", "hombros"),
    ("pájaros", "hombros"),
    ("hombro", "hombros"),
    ("curl", "biceps"),
    ("biceps", "biceps"),
    ("bíceps", "biceps"),
    ("triceps", "triceps"),
    ("tríceps", "triceps"),
    ("press frances", "triceps"),
    ("press francés", "triceps"),
    ("gemelo", "gemelos"),
    ("plancha", "core"),
    ("abdomen", "core"),
)

_FATIGUE_PHRASES: tuple[str, ...] = (
    "costó mucho",
    "costo mucho",
    "muy pesado",
    "fatiga",
    "cansado",
    "agotado",
    "al fallo",
    "molestia",
    "dolor",
)

_SETS_BY_REPS_RE = re.compile(r"\b(\d{1,2})\s*[x×]\s*(\d{1,3})\b", re.IGNORECASE)
_SERIES_DE_RE = re.compile(
    r"\b(?:hice\s+)?(\d{1,2})\s*series?\s*(?:de\s+)?(.+?)(?=\s+(?:con|a|de)\s+\d|\s*$|[,;.])",
    re.IGNORECASE,
)
_REPS_WORD_RE = re.compile(r"\b(?:a\s+)?(\d{1,3})\s*(?:repes?|reps?|repeticiones)\b", re.IGNORECASE)
_LOAD_RE = re.compile(r"\b(\d+(?:[.,]\d+)?)\s*(kg|kilos?|lb|lbs|libras?)\b", re.IGNORECASE)
_RIR_RE = re.compile(r"\brir\s*[:=]?\s*(\d+(?:[.,]\d+)?)\b", re.IGNORECASE)
_RPE_RE = re.compile(r"\brpe\s*[:=]?\s*(\d+(?:[.,]\d+)?)\b", re.IGNORECASE)
_SESSION_CUE_RE = re.compile(
    r"(\b\d{1,2}\s*[x×]\s*\d{1,3}\b|\b\d{1,2}\s*series?\s+de\b|\b\d+\s*(?:kg|kilos?|lb|lbs)\b.{0,25}\b(?:repes?|reps?|rir|rpe)\b)",
    re.IGNORECASE,
)


def infer_muscle_group(exercise_name: str, fallback: str | None = None) -> str:
    lowered = exercise_name.strip().lower()
    for keyword, muscle in _EXERCISE_MUSCLE_HINTS:
        if keyword in lowered:
            return muscle
    if fallback and fallback.strip():
        return normalize_muscle_group(fallback)
    return "pecho"


def detect_training_session_description(text: str) -> bool:
    """Return True when free-form Spanish text looks like a completed TrainingSession log."""
    cleaned = text.strip()
    if len(cleaned) < 8:
        return False
    return bool(_SESSION_CUE_RE.search(cleaned))


def _finalize_draft_sets(
    raw_sets: list[DraftSetEntry],
) -> tuple[tuple[DraftSetEntry, ...], tuple[AmbiguityFlag, ...]]:
    finalized: list[DraftSetEntry] = []
    ambiguities: list[AmbiguityFlag] = []
    seen_exercise_missing: set[tuple[str, str]] = set()

    for idx, entry in enumerate(raw_sets):
        missing: list[str] = []
        if not entry.exercise_name.strip():
            missing.append("exercise_name")
        if entry.reps is None:
            missing.append("reps")
        if entry.load is None:
            missing.append("load")
        if entry.rir is None and entry.rpe is None:
            missing.append("rir")

        clean_entry = DraftSetEntry(
            exercise_name=entry.exercise_name.strip() or "Ejercicio sin especificar",
            muscle_group=infer_muscle_group(entry.exercise_name, entry.muscle_group),
            set_order=idx + 1,
            reps=entry.reps,
            load=entry.load,
            unit=entry.unit,
            rir=entry.rir,
            rpe=entry.rpe,
            notes=entry.notes,
            missing_fields=tuple(missing),
        )
        finalized.append(clean_entry)

        ex_key = clean_entry.exercise_name.lower()
        for field in missing:
            dedup_key = (ex_key, field)
            if dedup_key in seen_exercise_missing:
                continue
            seen_exercise_missing.add(dedup_key)
            if field == "load":
                msg = (
                    f"Falta la carga (kg/lb) en '{clean_entry.exercise_name}'. "
                    "Indica el peso antes de guardar."
                )
            elif field == "rir":
                msg = (
                    f"No se indicó RIR ni RPE en '{clean_entry.exercise_name}'. "
                    "Puedes añadirlo o confirmarlo así."
                )
            elif field == "reps":
                msg = (
                    f"Faltan las repeticiones en '{clean_entry.exercise_name}'. "
                    "Complétalas antes de guardar."
                )
            else:
                msg = "Falta el nombre del ejercicio en una serie del borrador."
            ambiguities.append(AmbiguityFlag(field=field, set_index=idx, message_es=msg))

    return tuple(finalized), tuple(ambiguities)


def parse_natural_training_session_fallback(
    *,
    raw_text: str,
    origin: SessionOrigin,
    session_date: date,
) -> TrainingSessionDraft:
    """Deterministic Spanish natural-language parser for TrainingSession drafts.

    NEVER invents missing load, reps, or RIR/RPE; flags them explicitly as ambiguities.
    """
    cleaned = raw_text.strip()
    if not cleaned:
        raise MultimodalValidationError(
            "Describe al menos un ejercicio para generar el borrador de Sesión de Entrenamiento."
        )

    lowered_full = cleaned.lower()
    fatigue_notes: str | None = None
    for phrase in _FATIGUE_PHRASES:
        if phrase in lowered_full:
            fatigue_notes = cleaned
            break

    # Split into exercise clauses on ';' or '\n' or ' y ' when followed by an exercise cue
    raw_clauses = re.split(r"[;\n]+|\s+y\s+(?=[a-záéíóúñ])", cleaned, flags=re.IGNORECASE)
    parsed_sets: list[DraftSetEntry] = []

    for clause in raw_clauses:
        part = clause.strip()
        if not part:
            continue
        # Strip trailing commentary after comma if the comma part has no numbers
        main_part = part
        clause_note: str | None = None
        if "," in part:
            head, tail = part.split(",", 1)
            if not re.search(r"\d", tail):
                main_part = head.strip()
                clause_note = tail.strip() or None

        set_count = 1
        reps: int | None = None
        exercise_name = ""

        mx = _SETS_BY_REPS_RE.search(main_part)
        if mx:
            set_count = max(1, min(12, int(mx.group(1))))
            reps = int(mx.group(2))
            before = main_part[: mx.start()].strip(" -:,.")
            before = re.sub(r"^(?:hice|realice|realicé|hoy|entren[eé])\s+", "", before, flags=re.I)
            exercise_name = before.strip()
        else:
            ms = _SERIES_DE_RE.search(main_part)
            if ms:
                set_count = max(1, min(12, int(ms.group(1))))
                exercise_name = ms.group(2).strip(" -:,.")
            mr = _REPS_WORD_RE.search(main_part)
            if mr:
                reps = int(mr.group(1))

        if not exercise_name:
            # Take leading words before load/reps/rir tokens
            cut = re.split(
                r"\b(?:\d+\s*[x×]\s*\d+|\d+\s*series?|con\s+\d+|a\s+\d+|rir|rpe)\b",
                main_part,
                maxsplit=1,
                flags=re.IGNORECASE,
            )[0]
            cut = re.sub(
                r"^(?:hice|realice|realicé|hoy|entren[eé])\s+", "", cut.strip(), flags=re.I
            )
            exercise_name = cut.strip(" -:,.")

        load: float | None = None
        unit = LoadUnit.KG
        ml = _LOAD_RE.search(main_part)
        if ml:
            load = float(ml.group(1).replace(",", "."))
            unit_raw = ml.group(2).lower()
            unit = LoadUnit.LB if unit_raw.startswith("l") else LoadUnit.KG

        rir: float | None = None
        m_rir = _RIR_RE.search(main_part)
        if m_rir:
            rir = float(m_rir.group(1).replace(",", "."))

        rpe: float | None = None
        m_rpe = _RPE_RE.search(main_part)
        if m_rpe:
            rpe = float(m_rpe.group(1).replace(",", "."))

        if not exercise_name and reps is None and load is None:
            continue

        display_exercise = (
            exercise_name[0].upper() + exercise_name[1:] if exercise_name else ""
        )
        muscle = infer_muscle_group(display_exercise)
        for s_idx in range(set_count):
            parsed_sets.append(
                DraftSetEntry(
                    exercise_name=display_exercise,
                    muscle_group=muscle,
                    set_order=len(parsed_sets) + 1,
                    reps=reps,
                    load=load,
                    unit=unit,
                    rir=rir,
                    rpe=rpe,
                    notes=clause_note if s_idx == set_count - 1 else None,
                )
            )

    if not parsed_sets:
        parsed_sets.append(
            DraftSetEntry(
                exercise_name=cleaned[:80],
                muscle_group=infer_muscle_group(cleaned),
                set_order=1,
                reps=None,
                load=None,
                unit=LoadUnit.KG,
                rir=None,
                rpe=None,
                notes=None,
            )
        )

    final_sets, ambiguities = _finalize_draft_sets(parsed_sets)
    primary_muscles = sorted({s.muscle_group for s in final_sets})
    default_name = (
        f"Sesión de {', '.join(primary_muscles[:2]).capitalize()}"
        if primary_muscles
        else "Sesión de Entrenamiento"
    )
    return TrainingSessionDraft(
        session_date=session_date,
        name=default_name,
        origin=origin,
        raw_text=cleaned,
        fatigue_notes=fatigue_notes,
        sets=final_sets,
        ambiguities=ambiguities,
        needs_confirmation=True,
    )


def build_session_draft_from_structured(
    *,
    structured: dict[str, Any],
    raw_text: str,
    origin: SessionOrigin,
    session_date: date,
) -> TrainingSessionDraft | None:
    """Validate LLM-returned structured JSON into a safe TrainingSessionDraft."""
    raw_sets = structured.get("sets")
    if not isinstance(raw_sets, list) or not raw_sets:
        return None

    entries: list[DraftSetEntry] = []
    for item in raw_sets:
        if not isinstance(item, dict):
            continue
        ex_name = str(item.get("exercise_name") or "").strip()
        mg = str(item.get("muscle_group") or "").strip()
        raw_reps = item.get("reps")
        reps = int(raw_reps) if isinstance(raw_reps, (int, float)) and raw_reps > 0 else None
        raw_load = item.get("load")
        load = float(raw_load) if isinstance(raw_load, (int, float)) and raw_load >= 0 else None
        raw_unit = str(item.get("unit") or "kg").lower()
        unit = LoadUnit.LB if raw_unit == "lb" else LoadUnit.KG
        raw_rir = item.get("rir")
        rir = float(raw_rir) if isinstance(raw_rir, (int, float)) and 0 <= raw_rir <= 10 else None
        raw_rpe = item.get("rpe")
        rpe = float(raw_rpe) if isinstance(raw_rpe, (int, float)) and 1 <= raw_rpe <= 10 else None
        notes = str(item["notes"]).strip() if item.get("notes") else None
        entries.append(
            DraftSetEntry(
                exercise_name=ex_name,
                muscle_group=infer_muscle_group(ex_name, mg),
                set_order=len(entries) + 1,
                reps=reps,
                load=load,
                unit=unit,
                rir=rir,
                rpe=rpe,
                notes=notes,
            )
        )

    if not entries:
        return None

    final_sets, ambiguities = _finalize_draft_sets(entries)
    name = str(structured.get("name") or "").strip() or "Sesión de Entrenamiento"
    fatigue_notes = (
        str(structured["fatigue_notes"]).strip() if structured.get("fatigue_notes") else None
    )
    return TrainingSessionDraft(
        session_date=session_date,
        name=name,
        origin=origin,
        raw_text=raw_text.strip(),
        fatigue_notes=fatigue_notes,
        sets=final_sets,
        ambiguities=ambiguities,
        needs_confirmation=True,
    )


def build_multimodal_image_prompt_block(
    *,
    attachments: tuple[Attachment, ...] | list[Attachment],
    user_text: str,
) -> str:
    """Build Spanish multimodal Coach instructions for attached images.

    Enforces honest ranges/uncertainty for unweighed meals, KB cross-check for labels,
    metric extraction for scale/tracker screenshots, and explicit uncertainty on blurry images.
    """
    categories = {a.category for a in attachments if a.category is not None}
    lowered = user_text.lower()
    if not categories:
        if any(kw in lowered for kw in ("comida", "plato", "calor", "macro", "cena", "desayuno")):
            categories.add(ImageAnalysisCategory.MEAL)
        elif any(kw in lowered for kw in ("etiqueta", "suplemento", "ingrediente", "dosis")):
            categories.add(ImageAnalysisCategory.LABEL_SUPPLEMENT)
        elif any(
            kw in lowered for kw in ("báscula", "bascula", "peso", "captura", "app", "check-in")
        ):
            categories.add(ImageAnalysisCategory.SCALE_TRACKER)
        else:
            categories.add(ImageAnalysisCategory.GENERAL)

    rules: list[str] = [
        (
            "ANÁLISIS MULTIMODAL DE IMÁGENES ADJUNTAS "
            f"({len(attachments)} imagen/es proporcionada/s por el Atleta):"
        ),
        (
            "- REGLA DE HONESTIDAD E INCERTIDUMBRE: Si alguna imagen es borrosa, ilegible, "
            "está recortada o no permite identificar los datos con fiabilidad, declara "
            "explícitamente la incertidumbre y pide aclaración o una foto más nítida; NUNCA "
            "inventes valores exactos."
        ),
    ]

    if ImageAnalysisCategory.MEAL in categories:
        rules.append(
            "- FOTO DE COMIDA: Estima calorías y macronutrientes (proteína, carbohidratos, grasa) "
            "en forma de RANGOS aproximados (no cifras exactas inventadas), indicando el margen de "
            "incertidumbre propio de comidas no pesadas (aceites, salsas, tamaño de porción) y "
            "contextualízalo frente a la Fase Nutricional activa del Atleta."
        )
    if ImageAnalysisCategory.LABEL_SUPPLEMENT in categories:
        rules.append(
            "- ETIQUETA NUTRICIONAL O SUPLEMENTO: Identifica ingredientes activos, tabla "
            "nutricional y dosis por toma, y evalúalos frente a las Fichas de Evidencia aprobadas "
            "de la Base de Conocimiento."
        )
    if ImageAnalysisCategory.SCALE_TRACKER in categories:
        rules.append(
            "- CAPTURA DE BÁSCULA O APP DE SEGUIMIENTO: Extrae las métricas visibles (peso, pasos, "
            "calorías o medidas) indicando qué lecturas son claras y sugiere cómo incorporarlas "
            "al progreso o al Check-in semanal."
        )

    return "\n".join(rules)
