"""Seam 3: Identity (JWT verification) & Binary Storage (isolated athlete/curator buckets)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol
from uuid import UUID


@dataclass(frozen=True, slots=True)
class VerifiedIdentity:
    """Identity claims extracted from a verified Supabase Auth JWT."""

    auth_subject: str
    email: str
    display_name: str | None = None


class IdentityVerifierPort(Protocol):
    """Verifies bearer tokens at the auth boundary (Supabase Auth in prod, fake in tests)."""

    async def verify_token(self, token: str) -> VerifiedIdentity: ...


class BinaryStoragePort(Protocol):
    """Isolated binary storage for Athlete attachments and Curator scientific PDFs."""

    async def put_athlete_object(
        self,
        *,
        athlete_id: UUID,
        relative_path: str,
        data: bytes,
        content_type: str,
    ) -> str: ...

    async def get_athlete_object(self, *, athlete_id: UUID, storage_path: str) -> bytes: ...

    async def delete_athlete_object(self, *, athlete_id: UUID, storage_path: str) -> None: ...

    async def put_curator_pdf(
        self,
        *,
        relative_path: str,
        data: bytes,
    ) -> str: ...

    async def get_curator_pdf(self, *, storage_path: str) -> bytes: ...
