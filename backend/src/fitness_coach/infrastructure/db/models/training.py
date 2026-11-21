"""SQLAlchemy 2 ORM models for Training (#7): mesocycles, planned & training sessions, sets."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from fitness_coach.infrastructure.db.base import Base


class MesocycleModel(Base):
    __tablename__ = "mesocycles"
    __table_args__ = (
        Index("ix_mesocycles_athlete_id", "athlete_id"),
        Index(
            "uq_mesocycles_single_active_per_athlete",
            "athlete_id",
            unique=True,
            postgresql_where=text("status IN ('active', 'deload')"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    athlete_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("athletes.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    goal: Mapped[str] = mapped_column(String(160), nullable=False)
    duration_weeks: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="draft")
    progression_criteria: Mapped[str | None] = mapped_column(Text, nullable=True)
    deload_criteria: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    planned_sessions: Mapped[list[PlannedSessionModel]] = relationship(
        "PlannedSessionModel",
        back_populates="mesocycle",
        cascade="all, delete-orphan",
        order_by="PlannedSessionModel.day_order",
    )


class PlannedSessionModel(Base):
    __tablename__ = "planned_sessions"
    __table_args__ = (Index("ix_planned_sessions_mesocycle_id", "mesocycle_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mesocycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("mesocycles.id", ondelete="CASCADE"),
        nullable=False,
    )
    day_order: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    exercises: Mapped[list[dict]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )

    mesocycle: Mapped[MesocycleModel] = relationship(
        "MesocycleModel", back_populates="planned_sessions"
    )


class TrainingSessionModel(Base):
    __tablename__ = "training_sessions"
    __table_args__ = (Index("ix_training_sessions_athlete_date", "athlete_id", "session_date"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    athlete_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("athletes.id", ondelete="CASCADE"),
        nullable=False,
    )
    mesocycle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("mesocycles.id", ondelete="SET NULL"),
        nullable=True,
    )
    planned_session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("planned_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    origin: Mapped[str] = mapped_column(String(24), nullable=False, default="manual_form")
    fatigue_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )

    sets: Mapped[list[SessionSetModel]] = relationship(
        "SessionSetModel",
        back_populates="training_session",
        cascade="all, delete-orphan",
        order_by="SessionSetModel.set_order",
    )


class SessionSetModel(Base):
    __tablename__ = "session_sets"
    __table_args__ = (Index("ix_session_sets_training_session_id", "training_session_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    training_session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("training_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    exercise_name: Mapped[str] = mapped_column(String(160), nullable=False)
    muscle_group: Mapped[str] = mapped_column(String(64), nullable=False)
    secondary_muscle_groups: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    set_order: Mapped[int] = mapped_column(Integer, nullable=False)
    reps: Mapped[int] = mapped_column(Integer, nullable=False)
    load: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(8), nullable=False, default="kg")
    rir: Mapped[float | None] = mapped_column(Float, nullable=True)
    rpe: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    training_session: Mapped[TrainingSessionModel] = relationship(
        "TrainingSessionModel", back_populates="sets"
    )
