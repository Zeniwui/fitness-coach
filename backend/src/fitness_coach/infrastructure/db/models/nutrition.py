"""ORM models for Nutrition slice (#8): nutrition_phases and weekly_checkins."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from fitness_coach.infrastructure.db.base import Base


class NutritionPhaseModel(Base):
    """Athlete's Nutrition Phase (Fase Nutricional) with single-active partial unique index."""

    __tablename__ = "nutrition_phases"
    __table_args__ = (
        Index("ix_nutrition_phases_athlete_start", "athlete_id", "start_date"),
        Index(
            "uq_nutrition_phases_athlete_active",
            "athlete_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    athlete_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("athletes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    phase_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="active", server_default="active"
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_calories: Mapped[int] = mapped_column(Integer, nullable=False)
    protein_g: Mapped[int] = mapped_column(Integer, nullable=False)
    fat_g: Mapped[int] = mapped_column(Integer, nullable=False)
    carbs_g: Mapped[int] = mapped_column(Integer, nullable=False)
    target_weekly_weight_change_kg: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class WeeklyCheckInModel(Base):
    """Guided weekly Check-in strictly scoped by athlete_id with idempotency_key protection."""

    __tablename__ = "weekly_checkins"
    __table_args__ = (
        UniqueConstraint(
            "athlete_id",
            "idempotency_key",
            name="uq_weekly_checkins_athlete_idempotency",
        ),
        Index("ix_weekly_checkins_athlete_date", "athlete_id", "checkin_date"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    athlete_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("athletes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nutrition_phase_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("nutrition_phases.id", ondelete="SET NULL"),
        nullable=True,
    )
    checkin_date: Mapped[date] = mapped_column(Date, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    average_weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    daily_weights: Mapped[list[float]] = mapped_column(JSONB, nullable=False, default=list)
    body_measurements: Mapped[dict[str, float]] = mapped_column(JSONB, nullable=False, default=dict)
    adherence_score: Mapped[int] = mapped_column(Integer, nullable=False)
    sleep_quality: Mapped[int] = mapped_column(Integer, nullable=False)
    energy_level: Mapped[int] = mapped_column(Integer, nullable=False)
    hunger_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recovery_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    perceived_fatigue: Mapped[int] = mapped_column(Integer, nullable=False)
    performance_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimated_tdee_delta_kcal: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight_trend: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    coach_recommendations: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    adjustment_status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="none", server_default="none"
    )
    adjustment_resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
