"""ORM model barrel — Alembic imports this module to discover all tables.

Each vertical slice registers its models here additively (one line per slice).
"""

from fitness_coach.infrastructure.db.models.identity import AthleteModel, InvitationModel

__all__ = [
    "AthleteModel",
    "InvitationModel",
]
