"""Pydantic v2 request/response DTOs for Identity & Invitations."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from fitness_coach.domain.identity import Athlete, AuthContext, Invitation, Role


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ok"]
    service: str


class AuthMeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    athlete_id: UUID
    email: str
    display_name: str
    roles: list[Role]
    is_curator: bool
    is_athlete: bool

    @classmethod
    def from_auth_context(cls, auth: AuthContext) -> AuthMeResponse:
        return cls(
            athlete_id=auth.athlete_id,
            email=auth.email,
            display_name=auth.display_name,
            roles=sorted(auth.roles, key=lambda r: r.value),
            is_curator=auth.is_curator,
            is_athlete=auth.is_athlete,
        )

    @classmethod
    def from_athlete(cls, athlete: Athlete) -> AuthMeResponse:
        return cls.from_auth_context(athlete.to_auth_context())


class CreateInvitationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=5, max_length=320)
    roles: list[Role] = Field(default_factory=lambda: [Role.ATHLETE], min_length=1)


InvitationStatus = Literal["pending", "accepted", "expired"]


def _invitation_status(invitation: Invitation, now: datetime) -> InvitationStatus:
    if invitation.is_accepted:
        return "accepted"
    if invitation.is_expired(now):
        return "expired"
    return "pending"


class InvitationSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    email: str
    roles: list[Role]
    status: InvitationStatus
    expires_at: datetime
    accepted_at: datetime | None
    created_at: datetime

    @classmethod
    def from_domain(cls, invitation: Invitation) -> InvitationSummaryResponse:
        now = datetime.now(UTC)
        return cls(
            id=invitation.id,
            email=invitation.email,
            roles=sorted(invitation.roles, key=lambda r: r.value),
            status=_invitation_status(invitation, now),
            expires_at=invitation.expires_at,
            accepted_at=invitation.accepted_at,
            created_at=invitation.created_at,
        )


class CreateInvitationResponse(InvitationSummaryResponse):
    invitation_token: str


class InvitationListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[InvitationSummaryResponse]


class RedeemInvitationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=8, max_length=256)
    display_name: str | None = Field(default=None, max_length=120)


class BootstrapCuratorRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, max_length=120)
