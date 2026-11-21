"""Identity, Role, Invitation, and Multi-Athlete AuthContext domain model."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID


class Role(StrEnum):
    """Canonical roles in Fitness Coach (see GLOSSARY.md)."""

    ATHLETE = "athlete"
    CURATOR = "curator"


class IdentityError(Exception):
    """Base error for identity and access control invariants."""


class UnauthorizedError(IdentityError):
    """Raised when credentials are missing, invalid, or unregistered."""


class ForbiddenError(IdentityError):
    """Raised when an authenticated Athlete lacks required role or ownership."""


class InvalidInvitationError(IdentityError):
    """Raised when an invitation token is missing, unknown, expired, or already used."""


class AthleteAlreadyExistsError(IdentityError):
    """Raised when attempting to register an already registered auth_subject or email."""


@dataclass(frozen=True, slots=True)
class AuthContext:
    """Request-scoped authenticated Athlete identity and roles."""

    athlete_id: UUID
    auth_subject: str
    email: str
    display_name: str
    roles: frozenset[Role]

    @property
    def is_curator(self) -> bool:
        return Role.CURATOR in self.roles

    @property
    def is_athlete(self) -> bool:
        return Role.ATHLETE in self.roles

    def has_role(self, role: Role) -> bool:
        return role in self.roles

    def require_curator(self) -> None:
        if not self.is_curator:
            raise ForbiddenError("Se requiere el rol de Curador para realizar esta acción.")

    def require_same_athlete(self, target_athlete_id: UUID) -> None:
        if self.athlete_id != target_athlete_id:
            raise ForbiddenError("No tienes permiso para acceder a los datos de otro Atleta.")


@dataclass(frozen=True, slots=True)
class Athlete:
    """Registered Athlete account (may hold athlete, curator, or both roles)."""

    id: UUID
    auth_subject: str
    email: str
    display_name: str
    roles: frozenset[Role]
    created_at: datetime

    def to_auth_context(self) -> AuthContext:
        return AuthContext(
            athlete_id=self.id,
            auth_subject=self.auth_subject,
            email=self.email,
            display_name=self.display_name,
            roles=self.roles,
        )


@dataclass(frozen=True, slots=True)
class Invitation:
    """Closed-access invitation issued by a Curator to onboard a new Athlete."""

    id: UUID
    email: str
    token_hash: str
    roles: frozenset[Role]
    invited_by_athlete_id: UUID | None
    expires_at: datetime
    accepted_at: datetime | None
    created_at: datetime

    def is_expired(self, now: datetime) -> bool:
        return now >= self.expires_at

    @property
    def is_accepted(self) -> bool:
        return self.accepted_at is not None

    def ensure_redeemable(self, *, email: str, now: datetime) -> None:
        if self.is_accepted:
            raise InvalidInvitationError("La invitación ya ha sido utilizada.")
        if self.is_expired(now):
            raise InvalidInvitationError("La invitación ha caducado.")
        if self.email.strip().lower() != email.strip().lower():
            raise InvalidInvitationError(
                "El correo electrónico no coincide con la invitación."
            )
