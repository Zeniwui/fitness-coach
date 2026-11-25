"""SQLAlchemy 2 async repository for Athletes and Invitations."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from fitness_coach.domain.identity import Athlete, Invitation, Role
from fitness_coach.infrastructure.db.models.identity import AthleteModel, InvitationModel


def _to_athlete(model: AthleteModel) -> Athlete:
    return Athlete(
        id=model.id,
        auth_subject=model.auth_subject,
        email=model.email,
        display_name=model.display_name,
        roles=frozenset(Role(r) for r in model.roles),
        created_at=model.created_at,
    )


def _to_invitation(model: InvitationModel) -> Invitation:
    return Invitation(
        id=model.id,
        email=model.email,
        token_hash=model.token_hash,
        roles=frozenset(Role(r) for r in model.roles),
        invited_by_athlete_id=model.invited_by_athlete_id,
        expires_at=model.expires_at,
        accepted_at=model.accepted_at,
        created_at=model.created_at,
    )


class SqlAlchemyIdentityRepository:
    """Async PostgreSQL implementation of IdentityRepositoryPort."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_athlete_by_id(self, athlete_id: UUID) -> Athlete | None:
        stmt = select(AthleteModel).where(AthleteModel.id == athlete_id)
        model = (await self._session.execute(stmt)).scalar_one_or_none()
        return _to_athlete(model) if model else None

    async def get_athlete_by_subject(self, auth_subject: str) -> Athlete | None:
        stmt = select(AthleteModel).where(AthleteModel.auth_subject == auth_subject)
        model = (await self._session.execute(stmt)).scalar_one_or_none()
        return _to_athlete(model) if model else None

    async def get_athlete_by_email(self, email: str) -> Athlete | None:
        stmt = select(AthleteModel).where(func.lower(AthleteModel.email) == email.strip().lower())
        model = (await self._session.execute(stmt)).scalar_one_or_none()
        return _to_athlete(model) if model else None

    async def count_athletes(self) -> int:
        stmt = select(func.count()).select_from(AthleteModel)
        return int((await self._session.execute(stmt)).scalar_one())

    async def create_athlete(
        self,
        *,
        auth_subject: str,
        email: str,
        display_name: str,
        roles: frozenset[Role],
    ) -> Athlete:
        model = AthleteModel(
            auth_subject=auth_subject,
            email=email.strip().lower(),
            display_name=display_name.strip(),
            roles=sorted(r.value for r in roles),
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _to_athlete(model)

    async def create_invitation(
        self,
        *,
        email: str,
        token_hash: str,
        roles: frozenset[Role],
        invited_by_athlete_id: UUID | None,
        expires_at: datetime,
    ) -> Invitation:
        model = InvitationModel(
            email=email.strip().lower(),
            token_hash=token_hash,
            roles=sorted(r.value for r in roles),
            invited_by_athlete_id=invited_by_athlete_id,
            expires_at=expires_at,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return _to_invitation(model)

    async def get_invitation_by_id(self, invitation_id: UUID) -> Invitation | None:
        stmt = select(InvitationModel).where(InvitationModel.id == invitation_id)
        model = (await self._session.execute(stmt)).scalar_one_or_none()
        return _to_invitation(model) if model else None

    async def get_invitation_by_token_hash(self, token_hash: str) -> Invitation | None:
        stmt = select(InvitationModel).where(InvitationModel.token_hash == token_hash)
        model = (await self._session.execute(stmt)).scalar_one_or_none()
        return _to_invitation(model) if model else None

    async def list_invitations(self) -> list[Invitation]:
        stmt = select(InvitationModel).order_by(InvitationModel.created_at.desc())
        rows = (await self._session.execute(stmt)).scalars().all()
        return [_to_invitation(row) for row in rows]

    async def delete_invitation(self, invitation_id: UUID) -> bool:
        stmt = delete(InvitationModel).where(InvitationModel.id == invitation_id)
        result = await self._session.execute(stmt)
        await self._session.flush()
        return (result.rowcount or 0) > 0

    async def delete_pending_invitations_for_email(self, email: str) -> int:
        normalized_email = email.strip().lower()
        stmt = delete(InvitationModel).where(
            func.lower(InvitationModel.email) == normalized_email,
            InvitationModel.accepted_at.is_(None),
        )
        result = await self._session.execute(stmt)
        await self._session.flush()
        return int(result.rowcount or 0)

    async def mark_invitation_accepted(
        self,
        *,
        invitation_id: UUID,
        accepted_at: datetime,
    ) -> Invitation:
        stmt = select(InvitationModel).where(InvitationModel.id == invitation_id)
        model = (await self._session.execute(stmt)).scalar_one()
        model.accepted_at = accepted_at
        await self._session.flush()
        await self._session.refresh(model)
        return _to_invitation(model)
