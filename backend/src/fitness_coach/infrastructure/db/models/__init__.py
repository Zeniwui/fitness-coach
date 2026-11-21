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
from fitness_coach.infrastructure.db.models.multimodal import AttachmentModel
from fitness_coach.infrastructure.db.models.nutrition import (
    NutritionPhaseModel,
    WeeklyCheckInModel,
)
from fitness_coach.infrastructure.db.models.profile import (
    InjuryRestrictionModel,
    LivingProfileModel,
)
from fitness_coach.infrastructure.db.models.training import (
    MesocycleModel,
    PlannedSessionModel,
    SessionSetModel,
    TrainingSessionModel,
)

__all__ = [
    "AthleteModel",
    "AttachmentModel",
    "CandidateStudyModel",
    "ConversationModel",
    "EvidenceCardModel",
    "EvidenceRelationModel",
    "InjuryRestrictionModel",
    "InvitationModel",
    "LivingProfileModel",
    "MesocycleModel",
    "MessageModel",
    "MonthlyCutRunModel",
    "NutritionPhaseModel",
    "PlannedSessionModel",
    "ProfileUpdateProposalModel",
    "SessionSetModel",
    "TrainingSessionModel",
    "TrendingTopicModel",
    "WeeklyCheckInModel",
]
