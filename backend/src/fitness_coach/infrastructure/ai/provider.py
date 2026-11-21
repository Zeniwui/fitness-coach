"""Provider-agnostic AIProviderPort implementation (ADR-0003).

Supports Google AI Studio (Gemini), OpenAI, Anthropic, and OpenAI-compatible endpoints
configurable purely through environment variables (`Settings`) without touching domain rules
or invalidating stored Knowledge Base embeddings.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from fitness_coach.application.ports.ai_provider import (
    EmbeddingResult,
    LLMResponse,
    ModelTier,
    RateLimitError,
)
from fitness_coach.infrastructure.config import Settings

SUPPORTED_AI_PROVIDERS: frozenset[str] = frozenset(
    {"google_ai_studio", "openai", "anthropic", "openai_compatible"}
)


class UnsupportedAIProviderError(ValueError):
    """Raised when Settings.ai_provider is not a supported provider identifier."""


class ConfigurableAIProvider:
    """Multi-provider LLM & decoupled embeddings adapter conforming to AIProviderPort."""

    def __init__(
        self,
        *,
        provider_name: str,
        fast_model: str,
        reasoning_model: str,
        embedding_provider: str,
        embedding_model: str,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout_seconds: float = 45.0,
    ) -> None:
        normalized = provider_name.strip().lower()
        if normalized not in SUPPORTED_AI_PROVIDERS:
            supported = ", ".join(sorted(SUPPORTED_AI_PROVIDERS))
            raise UnsupportedAIProviderError(
                f"Proveedor de IA no soportado: '{provider_name}'. Opciones válidas: {supported}."
            )
        self.provider_name = normalized
        self.fast_model = fast_model
        self.reasoning_model = reasoning_model
        self.embedding_provider = embedding_provider.strip().lower()
        self.embedding_model = embedding_model
        self._api_key = api_key
        self._base_url = base_url.rstrip("/") if base_url else None
        self._timeout = timeout_seconds

    def resolve_model(self, tier: ModelTier) -> str:
        """Return the configured model identifier for fast_tier or reasoning_tier."""
        if tier == ModelTier.FAST:
            return self.fast_model
        return self.reasoning_model

    async def generate(
        self,
        *,
        tier: ModelTier,
        system_prompt: str,
        user_prompt: str,
        json_schema: dict[str, Any] | None = None,
        images: list[tuple[bytes, str]] | None = None,
    ) -> LLMResponse:
        model = self.resolve_model(tier)
        if not self._api_key:
            raise RuntimeError(
                f"Falta la clave API para el proveedor '{self.provider_name}' (modelo {model})."
            )

        if self.provider_name == "google_ai_studio":
            return await self._generate_google(
                model=model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                json_schema=json_schema,
            )
        if self.provider_name == "anthropic":
            return await self._generate_anthropic(
                model=model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
            )
        return await self._generate_openai_compatible(
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=json_schema,
        )

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
        words = response.text.split(" ")
        for idx, word in enumerate(words):
            suffix = " " if idx < len(words) - 1 else ""
            yield f"{word}{suffix}"

    async def embed_texts(self, texts: list[str]) -> list[EmbeddingResult]:
        if not texts:
            return []
        if not self._api_key:
            raise RuntimeError(
                f"Falta la clave API para generar embeddings con '{self.embedding_model}'."
            )
        if self.embedding_provider == "google_ai_studio":
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{self.embedding_model}:batchEmbedContents?key={self._api_key}"
            )
            payload = {
                "requests": [
                    {
                        "model": f"models/{self.embedding_model}",
                        "content": {"parts": [{"text": text}]},
                    }
                    for text in texts
                ]
            }
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(url, json=payload)
            self._raise_for_status(resp)
            data = resp.json()
            return [
                EmbeddingResult(vector=item["values"], model_id=self.embedding_model)
                for item in data.get("embeddings", [])
            ]

        base = self._base_url or "https://api.openai.com/v1"
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{base}/embeddings",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={"model": self.embedding_model, "input": texts},
            )
        self._raise_for_status(resp)
        data = resp.json()
        return [
            EmbeddingResult(vector=item["embedding"], model_id=self.embedding_model)
            for item in data.get("data", [])
        ]

    async def transcribe_audio(self, audio_bytes: bytes, mime_type: str) -> str:
        raise NotImplementedError("Audio transcription is wired in ticket #9.")

    def _raise_for_status(self, response: httpx.Response) -> None:
        if response.status_code == 429:
            raise RateLimitError("HTTP 429: cuota del proveedor de IA agotada temporalmente.")
        response.raise_for_status()

    async def _generate_google(
        self,
        *,
        model: str,
        system_prompt: str,
        user_prompt: str,
        json_schema: dict[str, Any] | None,
    ) -> LLMResponse:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent?key={self._api_key}"
        )
        body: dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        }
        if json_schema is not None:
            body["generationConfig"] = {"responseMimeType": "application/json"}
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(url, json=body)
        self._raise_for_status(resp)
        data = resp.json()
        parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        text = "".join(str(p.get("text", "")) for p in parts).strip()
        structured = _try_parse_json(text) if json_schema is not None else {}
        return LLMResponse(text=text, structured_data=structured)

    async def _generate_openai_compatible(
        self,
        *,
        model: str,
        system_prompt: str,
        user_prompt: str,
        json_schema: dict[str, Any] | None,
    ) -> LLMResponse:
        base = self._base_url or "https://api.openai.com/v1"
        body: dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        if json_schema is not None:
            body["response_format"] = {"type": "json_object"}
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json=body,
            )
        self._raise_for_status(resp)
        data = resp.json()
        text = str(data["choices"][0]["message"]["content"]).strip()
        structured = _try_parse_json(text) if json_schema is not None else {}
        return LLMResponse(text=text, structured_data=structured)

    async def _generate_anthropic(
        self,
        *,
        model: str,
        system_prompt: str,
        user_prompt: str,
    ) -> LLMResponse:
        base = self._base_url or "https://api.anthropic.com/v1"
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{base}/messages",
                headers={
                    "x-api-key": self._api_key or "",
                    "anthropic-version": "2023-06-01",
                },
                json={
                    "model": model,
                    "max_tokens": 2048,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_prompt}],
                },
            )
        self._raise_for_status(resp)
        data = resp.json()
        blocks = data.get("content", [])
        text = "".join(
            str(b.get("text", "")) for b in blocks if b.get("type") == "text"
        ).strip()
        return LLMResponse(text=text)


def _try_parse_json(raw: str) -> dict[str, Any]:
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def build_ai_provider(settings: Settings) -> ConfigurableAIProvider:
    """Instantiate the configured AI provider from Settings without changing domain rules."""
    provider = settings.ai_provider.strip().lower()
    api_key_map = {
        "google_ai_studio": settings.google_api_key,
        "openai": settings.openai_api_key,
        "anthropic": settings.anthropic_api_key,
        "openai_compatible": settings.openai_api_key,
    }
    return ConfigurableAIProvider(
        provider_name=provider,
        fast_model=settings.ai_fast_model,
        reasoning_model=settings.ai_reasoning_model,
        embedding_provider=settings.embedding_provider,
        embedding_model=settings.embedding_model,
        api_key=api_key_map.get(provider),
        base_url=settings.ai_base_url,
    )
