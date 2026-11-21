"""ORM models for Living Profile slice: living_profiles and injury_restrictions."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from fitness_coach.infrastructure.db.base import Base


class LivingProfileModel(Base):
    """Structured Living Profile owned 1-to-1 by an Athlete (ADR-0002)."""

    __tablename__ = "living_profiles"

    athlete_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("athletes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sex: Mapped[str | None] = mapped_column(String(32), nullable=True)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    base_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    experience_level: Mapped[str | None] = mapped_column(String(32), nullable=True)
    primary_goal: Mapped[str | None] = mapped_column(String(64), nullable=True)
    training_days_per_week: Mapped[int | None] = mapped_column(Integer, nullable=True)
    session_duration_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    equipment: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    allergies: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    food_preferences: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    training_approach: Mapped[str] = mapped_column(
        String(32), nullable=False, default="natural", server_default="natural"
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class InjuryRestrictionModel(Base):
    """Physical injury or movement restriction strictly scoped by athlete_id."""

    __tablename__ = "injury_restrictions"
    __table_args__ = (
        Index("ix_injury_restrictions_athlete_status", "athlete_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    athlete_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("athletes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    body_part: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(
        String(32), nullable=False, default="moderate", server_default="moderate"
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="active", server_default="active"
    )
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
