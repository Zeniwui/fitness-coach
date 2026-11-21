"""Local/in-memory binary storage adapter enforcing athlete_id prefix isolation."""

from __future__ import annotations

from uuid import UUID

from fitness_coach.domain.identity import ForbiddenError


class InMemoryBinaryStorage:
    """Default local binary storage adapter with strict <athlete_id>/ prefix isolation."""

    def __init__(self) -> None:
        self._athlete_objects: dict[str, tuple[bytes, str]] = {}
        self._curator_pdfs: dict[str, bytes] = {}

    def _ensure_athlete_prefix(self, athlete_id: UUID, storage_path: str) -> None:
        if not storage_path.startswith(f"{athlete_id}/") or ".." in storage_path:
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
        self._athlete_objects[key] = (data, content_type)
        return key

    async def get_athlete_object(self, *, athlete_id: UUID, storage_path: str) -> bytes:
        self._ensure_athlete_prefix(athlete_id, storage_path)
        if storage_path not in self._athlete_objects:
            raise FileNotFoundError(storage_path)
        return self._athlete_objects[storage_path][0]

    async def delete_athlete_object(self, *, athlete_id: UUID, storage_path: str) -> None:
        self._ensure_athlete_prefix(athlete_id, storage_path)
        self._athlete_objects.pop(storage_path, None)

    async def put_curator_pdf(self, *, relative_path: str, data: bytes) -> str:
        clean_rel = relative_path.lstrip("/")
        if ".." in clean_rel:
            raise ForbiddenError("Ruta de PDF inválida.")
        key = f"curator-pdfs/{clean_rel}"
        self._curator_pdfs[key] = data
        return key

    async def get_curator_pdf(self, *, storage_path: str) -> bytes:
        if storage_path not in self._curator_pdfs:
            raise FileNotFoundError(storage_path)
        return self._curator_pdfs[storage_path]
