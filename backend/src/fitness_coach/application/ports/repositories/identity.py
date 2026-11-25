"""Identity repository port for Athletes and Invitations."""

from __future__ import annotations

from datetime import datetime
from typing import Protocol
from uuid import UUID

from fitness_coach.domain.identity import Athlete, Invitation, Role


class IdentityRepositoryPort(Protocol):
    """Persistence contract for Athletes and Invitations."""

    async def get_athlete_by_id(self, athlete_id: UUID) -> Athlete | None: ...

    async def get_athlete_by_subject(self, auth_subject: str) -> Athlete | None: ...

    async def get_athlete_by_email(self, email: str) -> Athlete | None: ...

    async def count_athletes(self) -> int: ...

    async def create_athlete(
        self,
        *,
        auth_subject: str,
        email: str,
        display_name: str,
        roles: frozenset[Role],
    ) -> Athlete: ...

    async def create_invitation(
        self,
        *,
        email: str,
        token_hash: str,
        roles: frozenset[Role],
        invited_by_athlete_id: UUID | None,
        expires_at: datetime,
    ) -> Invitation: ...

    async def get_invitation_by_id(self, invitation_id: UUID) -> Invitation | None: ...

    async def get_invitation_by_token_hash(self, token_hash: str) -> Invitation | None: ...

    async def list_invitations(self) -> list[Invitation]: ...

    async def delete_invitation(self, invitation_id: UUID) -> bool: ...

    async def delete_pending_invitations_for_email(self, email: str) -> int: ...

    async def mark_invitation_accepted(
        self,
        *,
        invitation_id: UUID,
        accepted_at: datetime,
    ) -> Invitation: ...
