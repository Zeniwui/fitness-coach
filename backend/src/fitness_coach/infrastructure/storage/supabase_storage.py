"""Production Supabase Storage adapter implementing BinaryStoragePort (ADR-0003).

Uses private buckets (`athlete-private` and `curator-pdfs`) with strict `<athlete_id>/`
prefix enforcement so one Athlete can never read or delete another Athlete's files.
"""

from __future__ import annotations

from urllib.parse import quote
from uuid import UUID

import httpx

from fitness_coach.application.ports.identity_storage import BinaryStoragePort
from fitness_coach.domain.identity import ForbiddenError
from fitness_coach.infrastructure.config import Settings
from fitness_coach.infrastructure.storage.local_storage import InMemoryBinaryStorage


class SupabaseBinaryStorageAdapter:
    """Supabase Storage REST adapter with strict per-Athlete prefix isolation."""

    def __init__(
        self,
        *,
        supabase_url: str,
        service_role_key: str,
        athlete_bucket: str = "athlete-private",
        curator_bucket: str = "curator-pdfs",
        timeout_seconds: float = 30.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._base_url = supabase_url.rstrip("/")
        self._service_role_key = service_role_key
        self._athlete_bucket = athlete_bucket
        self._curator_bucket = curator_bucket
        self._timeout = timeout_seconds
        self._transport = transport

    def _headers(self, *, content_type: str | None = None) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self._service_role_key}",
            "apikey": self._service_role_key,
        }
        if content_type:
            headers["Content-Type"] = content_type
            headers["x-upsert"] = "true"
        return headers

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=self._timeout, transport=self._transport)

    @staticmethod
    def _ensure_athlete_prefix(athlete_id: UUID, storage_path: str) -> None:
        if not storage_path.startswith(f"{athlete_id}/") or ".." in storage_path:
            raise ForbiddenError("Acceso denegado al archivo de otro Atleta.")

    def _object_url(self, bucket: str, object_path: str) -> str:
        encoded = quote(object_path.lstrip("/"), safe="/")
        return f"{self._base_url}/storage/v1/object/{bucket}/{encoded}"

    async def put_athlete_object(
        self,
        *,
        athlete_id: UUID,
        relative_path: str,
        data: bytes,
        content_type: str,
    ) -> str:
        clean_rel = relative_path.lstrip("/")
        if ".." in clean_rel:
            raise ForbiddenError("Ruta de archivo inválida.")
        key = f"{athlete_id}/{clean_rel}"
        async with self._client() as client:
            resp = await client.post(
                self._object_url(self._athlete_bucket, key),
                headers=self._headers(content_type=content_type),
                content=data,
            )
        resp.raise_for_status()
        return key

    async def get_athlete_object(self, *, athlete_id: UUID, storage_path: str) -> bytes:
        self._ensure_athlete_prefix(athlete_id, storage_path)
        async with self._client() as client:
            resp = await client.get(
                self._object_url(self._athlete_bucket, storage_path),
                headers=self._headers(),
            )
        if resp.status_code == 404:
            raise FileNotFoundError(storage_path)
        resp.raise_for_status()
        return resp.content

    async def delete_athlete_object(self, *, athlete_id: UUID, storage_path: str) -> None:
        self._ensure_athlete_prefix(athlete_id, storage_path)
        async with self._client() as client:
            resp = await client.delete(
                self._object_url(self._athlete_bucket, storage_path),
                headers=self._headers(),
            )
        if resp.status_code != 404:
            resp.raise_for_status()

    async def put_curator_pdf(self, *, relative_path: str, data: bytes) -> str:
        clean_rel = relative_path.lstrip("/")
        if ".." in clean_rel:
            raise ForbiddenError("Ruta de PDF inválida.")
        key = f"curator-pdfs/{clean_rel}"
        async with self._client() as client:
            resp = await client.post(
                self._object_url(self._curator_bucket, key),
                headers=self._headers(content_type="application/pdf"),
                content=data,
            )
        resp.raise_for_status()
        return key

    async def get_curator_pdf(self, *, storage_path: str) -> bytes:
        if ".." in storage_path:
            raise ForbiddenError("Ruta de PDF inválida.")
        async with self._client() as client:
            resp = await client.get(
                self._object_url(self._curator_bucket, storage_path),
                headers=self._headers(),
            )
        if resp.status_code == 404:
            raise FileNotFoundError(storage_path)
        resp.raise_for_status()
        return resp.content


def build_binary_storage(settings: Settings) -> BinaryStoragePort:
    """Use Supabase Storage private buckets when configured; fallback to in-memory in dev/test."""
    if settings.supabase_url and settings.supabase_service_role_key:
        return SupabaseBinaryStorageAdapter(
            supabase_url=settings.supabase_url,
            service_role_key=settings.supabase_service_role_key,
            athlete_bucket=settings.supabase_athlete_bucket,
            curator_bucket=settings.supabase_curator_bucket,
        )
    return InMemoryBinaryStorage()
