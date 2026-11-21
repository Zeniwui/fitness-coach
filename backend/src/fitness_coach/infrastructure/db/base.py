"""SQLAlchemy 2 DeclarativeBase for all Fitness Coach ORM models."""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base imported by Alembic env.py."""
