"""Unit tests for Coach conversation management (rename & delete) and validation rules."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from fitness_coach.application.use_cases.coach import (
    DeleteConversationUseCase,
    RenameConversationUseCase,
)
from fitness_coach.domain.coach import (
    CONVERSATION_TITLE_MAX_LENGTH,
    CoachValidationError,
    Conversation,
    ConversationNotFoundError,
    InvalidProposalStateError,
    ProposalNotFoundError,
    validate_conversation_title,
)
from fitness_coach.domain.identity import AuthContext, Role
from fitness_coach.infrastructure.api.exception_handlers import register_exception_handlers


class InMemoryCoachConversationRepo:
    """Minimal in-memory fake of conversation methods on CoachRepositoryPort."""

    def __init__(self) -> None:
        self.conversations: dict[UUID, Conversation] = {}

    def seed(self, *, athlete_id: UUID, title: str = "Nueva conversación") -> Conversation:
        now = datetime.now(UTC)
        conv = Conversation(
            id=uuid4(),
            athlete_id=athlete_id,
            title=title,
            created_at=now,
            updated_at=now,
        )
        self.conversations[conv.id] = conv
        return conv

    async def update_conversation_title(
        self, *, athlete_id: UUID, conversation_id: UUID, title: str
    ) -> Conversation | None:
        conv = self.conversations.get(conversation_id)
        if conv is None or conv.athlete_id != athlete_id:
            return None
        updated = Conversation(
            id=conv.id,
            athlete_id=conv.athlete_id,
            title=title,
            created_at=conv.created_at,
            updated_at=datetime.now(UTC),
        )
        self.conversations[conv.id] = updated
        return updated

    async def get_conversation(
        self, *, athlete_id: UUID, conversation_id: UUID
    ) -> Conversation | None:
        conv = self.conversations.get(conversation_id)
        if conv is None or conv.athlete_id != athlete_id:
            return None
        return conv

    async def delete_conversation(
        self, *, athlete_id: UUID, conversation_id: UUID
    ) -> bool:
        conv = self.conversations.get(conversation_id)
        if conv is None or conv.athlete_id != athlete_id:
            return False
        del self.conversations[conversation_id]
        return True


def _auth(athlete_id: UUID) -> AuthContext:
    return AuthContext(
        athlete_id=athlete_id,
        auth_subject=f"sub-{athlete_id}",
        email=f"{athlete_id}@fitness.test",
        display_name="Atleta",
        roles=frozenset({Role.ATHLETE}),
    )


class TestConversationTitleValidationAndRename:
    @pytest.mark.parametrize("raw", ["", "   ", "\t\n"])
    def test_validate_conversation_title_rejects_empty_or_whitespace(self, raw: str) -> None:
        with pytest.raises(CoachValidationError):
            validate_conversation_title(raw)

    def test_validate_conversation_title_rejects_over_max_length(self) -> None:
        with pytest.raises(CoachValidationError):
            validate_conversation_title("a" * (CONVERSATION_TITLE_MAX_LENGTH + 1))

    def test_validate_conversation_title_trims_valid_title(self) -> None:
        assert validate_conversation_title("  Plan de torso  ") == "Plan de torso"
        exact_max = "b" * CONVERSATION_TITLE_MAX_LENGTH
        assert validate_conversation_title(f"  {exact_max}  ") == exact_max

    @pytest.mark.asyncio
    async def test_rename_conversation_updates_owned_and_isolates_other_athlete(self) -> None:
        repo = InMemoryCoachConversationRepo()
        athlete_a = _auth(uuid4())
        athlete_b = _auth(uuid4())
        conv = repo.seed(athlete_id=athlete_a.athlete_id, title="Original")

        use_case = RenameConversationUseCase(repo)  # type: ignore[arg-type]

        updated = await use_case.execute(
            auth=athlete_a,
            conversation_id=conv.id,
            title="  Nuevo título  ",
        )
        assert updated.id == conv.id
        assert updated.title == "Nuevo título"

        with pytest.raises(ConversationNotFoundError):
            await use_case.execute(
                auth=athlete_b,
                conversation_id=conv.id,
                title="Intento ajeno",
            )

        with pytest.raises(ConversationNotFoundError):
            await use_case.execute(
                auth=athlete_a,
                conversation_id=uuid4(),
                title="Inexistente",
            )


class TestConversationDeleteAndErrorTranslation:
    @pytest.mark.asyncio
    async def test_delete_conversation_enforces_ownership_and_missing_id(self) -> None:
        repo = InMemoryCoachConversationRepo()
        athlete_a = _auth(uuid4())
        athlete_b = _auth(uuid4())
        conv = repo.seed(athlete_id=athlete_a.athlete_id, title="Hilo propio")

        use_case = DeleteConversationUseCase(repo)  # type: ignore[arg-type]

        with pytest.raises(ConversationNotFoundError):
            await use_case.execute(auth=athlete_b, conversation_id=conv.id)
        assert conv.id in repo.conversations

        with pytest.raises(ConversationNotFoundError):
            await use_case.execute(auth=athlete_a, conversation_id=uuid4())

        await use_case.execute(auth=athlete_a, conversation_id=conv.id)
        assert conv.id not in repo.conversations

        with pytest.raises(ConversationNotFoundError):
            await use_case.execute(auth=athlete_a, conversation_id=conv.id)

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("exc", "expected_status"),
        [
            (ConversationNotFoundError("No encontrada"), 404),
            (ProposalNotFoundError("Propuesta no encontrada"), 404),
            (InvalidProposalStateError("Ya resuelta"), 409),
            (CoachValidationError("Título vacío"), 422),
        ],
    )
    async def test_centralized_coach_exception_handlers_map_status_codes(
        self,
        exc: Exception,
        expected_status: int,
    ) -> None:
        test_app = FastAPI()
        register_exception_handlers(test_app)

        @test_app.get("/boom")
        async def boom() -> None:
            raise exc

        async with AsyncClient(
            transport=ASGITransport(app=test_app), base_url="http://testserver"
        ) as client:
            resp = await client.get("/boom")

        assert resp.status_code == expected_status
        assert resp.json() == {"detail": str(exc)}
