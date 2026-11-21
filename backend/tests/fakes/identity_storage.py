"""Seam 3 Fake: In-memory Identity (JWT) Verifier & Isolated Binary Storage."""

from __future__ import annotations

from uuid import UUID

from fitness_coach.application.ports.identity_storage import VerifiedIdentity
from fitness_coach.domain.identity import ForbiddenError, UnauthorizedError


class FakeIdentityVerifier:
    """Deterministic token verifier mapping test tokens to VerifiedIdentity."""

    def __init__(self) -> None:
        self._tokens: dict[str, VerifiedIdentity] = {}

    def register_token(
        self,
        token: str,
        *,
        auth_subject: str,
        email: str,
        display_name: str | None = None,
    ) -> str:
        self._tokens[token] = VerifiedIdentity(
            auth_subject=auth_subject,
            email=email,
            display_name=display_name,
        )
        return token

    async def verify_token(self, token: str) -> VerifiedIdentity:
        identity = self._tokens.get(token)
        if identity is None:
            raise UnauthorizedError("Token de autenticación inválido o expirado.")
        return identity


class FakeBinaryStorage:
    """In-memory binary store enforcing strict <athlete_id>/ prefix isolation."""

    def __init__(self) -> None:
        self.athlete_objects: dict[str, tuple[bytes, str]] = {}
        self.curator_pdfs: dict[str, bytes] = {}

    def _validate_athlete_key(self, athlete_id: UUID, storage_path: str) -> None:
        expected_prefix = f"{athlete_id}/"
        if not storage_path.startswith(expected_prefix) or ".." in storage_path:
            raise ForbiddenError("Acceso denegado al archivo de otro Atleta.")

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
        self.athlete_objects[key] = (data, content_type)
        return key

    async def get_athlete_object(self, *, athlete_id: UUID, storage_path: str) -> bytes:
        self._validate_athlete_key(athlete_id, storage_path)
        if storage_path not in self.athlete_objects:
            raise FileNotFoundError(storage_path)
        return self.athlete_objects[storage_path][0]

    async def delete_athlete_object(self, *, athlete_id: UUID, storage_path: str) -> None:
        self._validate_athlete_key(athlete_id, storage_path)
        self.athlete_objects.pop(storage_path, None)

    async def put_curator_pdf(self, *, relative_path: str, data: bytes) -> str:
        clean_rel = relative_path.lstrip("/")
        if ".." in clean_rel:
            raise ForbiddenError("Ruta de PDF inválida.")
        key = f"curator-pdfs/{clean_rel}"
        self.curator_pdfs[key] = data
        return key

    async def get_curator_pdf(self, *, storage_path: str) -> bytes:
        if storage_path not in self.curator_pdfs:
            raise FileNotFoundError(storage_path)
        return self.curator_pdfs[storage_path]
