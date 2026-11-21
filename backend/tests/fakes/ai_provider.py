"""Seam 1 Fake: Deterministic AI Provider (LLM, Embeddings, Transcription, 429 simulation)."""

from __future__ import annotations

import hashlib
import math
from collections.abc import AsyncIterator
from typing import Any

from fitness_coach.application.ports.ai_provider import (
    EmbeddingResult,
    LLMResponse,
    ModelTier,
    RateLimitError,
)

_CONCEPT_GROUPS: tuple[tuple[str, ...], ...] = (
    (
        "hipertrofia",
        "hypertrophy",
        "crecimiento muscular",
        "muscle growth",
        "masa muscular",
        "lean mass",
    ),
    ("volumen", "volume", "series semanales", "weekly sets", "set volume"),
    ("fuerza", "strength", "1rm", "fuerza maxima", "maximal strength"),
    ("fallo", "failure", "rir", "rpe", "proximidad al fallo", "proximity to failure"),
    ("creatina", "creatine", "monohidrato", "monohydrate", "fosfocreatina"),
    (
        "proteina",
        "protein",
        "sintesis proteica",
        "mps",
        "mtor",
        "aminoacidos",
        "leucina",
        "leucine",
    ),
    ("suplemento", "supplement", "hmb", "cafeina", "caffeine", "beta-alanina", "issn"),
    ("descanso", "rest", "intervalo", "inter-set", "recuperacion", "recovery"),
    ("frecuencia", "frequency", "dias por semana", "training frequency"),
    ("deficit", "cut", "definicion", "perdida de grasa", "fat loss", "caloric deficit"),
    ("lesion", "injury", "tendon", "rehabilitacion", "dolor", "pain"),
    ("sueno", "sleep", "fatiga", "fatigue", "descarga", "deload"),
)


class FakeAIProvider:
    """Deterministic offline fake for AIProviderPort."""

    def __init__(
        self,
        *,
        embedding_dim: int = 16,
        embedding_model_id: str = "fake-embedding-v1",
        simulate_rate_limit_after: int | None = None,
        simulate_embed_rate_limit_after: int | None = None,
    ) -> None:
        self.embedding_dim = embedding_dim
        self.embedding_model_id = embedding_model_id
        self.simulate_rate_limit_after = simulate_rate_limit_after
        self.simulate_embed_rate_limit_after = simulate_embed_rate_limit_after
        self.generate_calls: list[dict[str, Any]] = []
        self.embed_calls: list[list[str]] = []
        self.transcribe_calls: list[str] = []
        self.canned_responses: list[LLMResponse] = []
        self.canned_transcript: str = "Press inclinado mancuernas 3x8 con 32 kg a RIR 1"

    def _check_rate_limit(self) -> None:
        if (
            self.simulate_rate_limit_after is not None
            and len(self.generate_calls) >= self.simulate_rate_limit_after
        ):
            raise RateLimitError("HTTP 429: simulated AI provider quota exhausted")

    async def generate(
        self,
        *,
        tier: ModelTier,
        system_prompt: str,
        user_prompt: str,
        json_schema: dict[str, Any] | None = None,
        images: list[tuple[bytes, str]] | None = None,
    ) -> LLMResponse:
        self._check_rate_limit()
        self.generate_calls.append(
            {
                "tier": tier,
                "system_prompt": system_prompt,
                "user_prompt": user_prompt,
                "json_schema": json_schema,
                "image_count": len(images) if images else 0,
            }
        )
        if self.canned_responses:
            return self.canned_responses.pop(0)
        return LLMResponse(text=f"[{tier}] Respuesta determinista para: {user_prompt[:80]}")

    async def stream_text(
        self,
        *,
        tier: ModelTier,
        system_prompt: str,
        user_prompt: str,
        images: list[tuple[bytes, str]] | None = None,
    ) -> AsyncIterator[str]:
        response = await self.generate(
            tier=tier,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            images=images,
        )
        for token in response.text.split(" "):
            yield token + " "

    async def embed_texts(self, texts: list[str]) -> list[EmbeddingResult]:
        if (
            self.simulate_embed_rate_limit_after is not None
            and len(self.embed_calls) >= self.simulate_embed_rate_limit_after
        ):
            raise RateLimitError("HTTP 429: simulated embedding quota exhausted")
        self.embed_calls.append(list(texts))
        results: list[EmbeddingResult] = []
        for text in texts:
            lowered = text.strip().lower()
            digest = hashlib.sha256(lowered.encode("utf-8")).digest()
            raw = [
                (((digest[i % len(digest)] / 255.0) * 2.0) - 1.0) * 0.12
                for i in range(self.embedding_dim)
            ]
            for idx, keywords in enumerate(_CONCEPT_GROUPS):
                if idx < self.embedding_dim and any(kw in lowered for kw in keywords):
                    raw[idx] += 2.5
            norm = math.sqrt(sum(v * v for v in raw)) or 1.0
            vec = [round(v / norm, 6) for v in raw]
            results.append(EmbeddingResult(vector=vec, model_id=self.embedding_model_id))
        return results

    async def transcribe_audio(self, audio_bytes: bytes, mime_type: str) -> str:
        self.transcribe_calls.append(mime_type)
        return self.canned_transcript
