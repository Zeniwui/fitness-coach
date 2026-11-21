"""ORM model barrel — Alembic imports this module to discover all tables.

Each vertical slice registers its models here additively (one line per slice).
"""

from fitness_coach.infrastructure.db.models.coach import (
    ConversationModel,
    MessageModel,
    ProfileUpdateProposalModel,
)
from fitness_coach.infrastructure.db.models.identity import AthleteModel, InvitationModel
from fitness_coach.infrastructure.db.models.knowledge import (
    CandidateStudyModel,
    EvidenceCardModel,
    EvidenceRelationModel,
)
from fitness_coach.infrastructure.db.models.monthly_cut import (
    MonthlyCutRunModel,
    TrendingTopicModel,
)
from fitness_coach.infrastructure.db.models.profile import (
    InjuryRestrictionModel,
    LivingProfileModel,
)

__all__ = [
    "AthleteModel",
    "CandidateStudyModel",
    "ConversationModel",
    "EvidenceCardModel",
    "EvidenceRelationModel",
    "InjuryRestrictionModel",
    "InvitationModel",
    "LivingProfileModel",
    "MessageModel",
    "MonthlyCutRunModel",
    "ProfileUpdateProposalModel",
    "TrendingTopicModel",
]
