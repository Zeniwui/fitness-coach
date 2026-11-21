"""Identity & Invitation use cases (closed invite-only access + bootstrap Curator)."""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from fitness_coach.application.ports.identity_storage import VerifiedIdentity
from fitness_coach.application.ports.repositories.identity import IdentityRepositoryPort
from fitness_coach.domain.identity import (
    Athlete,
    AthleteAlreadyExistsError,
    AuthContext,
    ForbiddenError,
    InvalidInvitationError,
    Invitation,
    Role,
)


def hash_invitation_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()


class CreateInvitationUseCase:
    """Allows a Curator to issue a single-use invitation for a new Athlete/Curator."""

    def __init__(self, repo: IdentityRepositoryPort, *, ttl_hours: int = 72) -> None:
        self._repo = repo
        self._ttl_hours = ttl_hours

    async def execute(
        self,
        *,
        auth: AuthContext,
        email: str,
        roles: frozenset[Role],
    ) -> tuple[Invitation, str]:
        auth.require_curator()
        if not roles:
            raise InvalidInvitationError("La invitación debe incluir al menos un rol.")

        normalized_email = email.strip().lower()
        existing = await self._repo.get_athlete_by_email(normalized_email)
        if existing is not None:
            raise AthleteAlreadyExistsError("Ya existe una cuenta registrada con ese correo.")

        raw_token = secrets.token_urlsafe(32)
        token_hash = hash_invitation_token(raw_token)
        expires_at = datetime.now(UTC) + timedelta(hours=self._ttl_hours)

        invitation = await self._repo.create_invitation(
            email=normalized_email,
            token_hash=token_hash,
            roles=roles,
            invited_by_athlete_id=auth.athlete_id,
            expires_at=expires_at,
        )
        return invitation, raw_token


class ListInvitationsUseCase:
    """Allows a Curator to inspect issued invitations and their status."""

    def __init__(self, repo: IdentityRepositoryPort) -> None:
        self._repo = repo

    async def execute(self, *, auth: AuthContext) -> list[Invitation]:
        auth.require_curator()
        return await self._repo.list_invitations()


class RedeemInvitationUseCase:
    """Redeems a valid single-use invitation for an authenticated external identity."""

    def __init__(self, repo: IdentityRepositoryPort) -> None:
        self._repo = repo

    async def execute(
        self,
        *,
        verified: VerifiedIdentity,
        raw_token: str,
        display_name: str | None = None,
    ) -> Athlete:
        now = datetime.now(UTC)
        token_hash = hash_invitation_token(raw_token)
        invitation = await self._repo.get_invitation_by_token_hash(token_hash)
        if invitation is None:
            raise InvalidInvitationError("El código de invitación no es válido.")

        invitation.ensure_redeemable(email=verified.email, now=now)

        if await self._repo.get_athlete_by_subject(verified.auth_subject) is not None:
            raise AthleteAlreadyExistsError("Esta identidad ya está registrada en el sistema.")
        if await self._repo.get_athlete_by_email(verified.email) is not None:
            raise AthleteAlreadyExistsError("Ya existe una cuenta con ese correo electrónico.")

        resolved_name = (
            (display_name or "").strip()
            or (verified.display_name or "").strip()
            or verified.email.split("@")[0]
        )

        athlete = await self._repo.create_athlete(
            auth_subject=verified.auth_subject,
            email=verified.email,
            display_name=resolved_name,
            roles=invitation.roles,
        )
        await self._repo.mark_invitation_accepted(
            invitation_id=invitation.id,
            accepted_at=now,
        )
        return athlete


class BootstrapCuratorUseCase:
    """Creates the initial dual-role (Curator + Athlete) account ONLY on an empty database."""

    def __init__(
        self,
        repo: IdentityRepositoryPort,
        *,
        bootstrap_email: str | None,
        bootstrap_subject: str | None,
    ) -> None:
        self._repo = repo
        self._bootstrap_email = bootstrap_email.strip().lower() if bootstrap_email else None
        self._bootstrap_subject = bootstrap_subject.strip() if bootstrap_subject else None

    async def execute(
        self,
        *,
        verified: VerifiedIdentity,
        display_name: str | None = None,
    ) -> Athlete:
        if await self._repo.count_athletes() > 0:
            raise ForbiddenError(
                "El alta inicial del Curador está deshabilitada porque el sistema ya tiene cuentas."
            )

        if self._bootstrap_subject and verified.auth_subject != self._bootstrap_subject:
            raise ForbiddenError("Esta identidad no está autorizada para el arranque inicial.")
        if self._bootstrap_email and verified.email.strip().lower() != self._bootstrap_email:
            raise ForbiddenError("Este correo no está autorizado para el arranque inicial.")

        resolved_name = (
            (display_name or "").strip()
            or (verified.display_name or "").strip()
            or verified.email.split("@")[0]
        )
        return await self._repo.create_athlete(
            auth_subject=verified.auth_subject,
            email=verified.email,
            display_name=resolved_name,
            roles=frozenset({Role.CURATOR, Role.ATHLETE}),
        )
