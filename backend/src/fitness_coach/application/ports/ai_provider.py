"""Seam 1: Provider-agnostic AI Provider port (LLM, Embeddings, Audio Transcription)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Protocol


class ModelTier(StrEnum):
    """Two-tier model profile per ADR-0003 & spec."""

    FAST = "fast_tier"
    REASONING = "reasoning_tier"


class RateLimitError(Exception):
    """Raised when the upstream AI provider returns HTTP 429 / quota exhausted."""


@dataclass(frozen=True, slots=True)
class EmbeddingResult:
    """Vector embedding plus model identifier for controlled re-indexation."""

    vector: list[float]
    model_id: str


@dataclass(frozen=True, slots=True)
class LLMResponse:
    """Structured or free-text LLM output."""

    text: str
    structured_data: dict[str, Any] = field(default_factory=dict)
    tool_calls: list[dict[str, Any]] = field(default_factory=list)


class AIProviderPort(Protocol):
    """Single backend seam for LLM, decoupled embeddings, and audio transcription."""

    async def generate(
        self,
        *,
        tier: ModelTier,
        system_prompt: str,
        user_prompt: str,
        json_schema: dict[str, Any] | None = None,
        images: list[tuple[bytes, str]] | None = None,
    ) -> LLMResponse: ...

    def stream_text(
        self,
        *,
        tier: ModelTier,
        system_prompt: str,
        user_prompt: str,
        images: list[tuple[bytes, str]] | None = None,
    ) -> AsyncIterator[str]: ...

    async def embed_texts(self, texts: list[str]) -> list[EmbeddingResult]: ...

    async def transcribe_audio(self, audio_bytes: bytes, mime_type: str) -> str: ...
