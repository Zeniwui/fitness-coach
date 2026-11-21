"""Shared pytest fixtures: real PostgreSQL + pgvector + Alembic + 3 backend seam fakes."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from alembic.config import Config
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from alembic import command
from fitness_coach.domain.identity import Athlete, Role
from fitness_coach.infrastructure.api.main import create_app
from fitness_coach.infrastructure.config import Settings
from fitness_coach.infrastructure.db.base import Base
from fitness_coach.infrastructure.db.repositories.identity import SqlAlchemyIdentityRepository
from fitness_coach.infrastructure.db.session import create_engine, create_session_factory
from tests.fakes.ai_provider import FakeAIProvider
from tests.fakes.identity_storage import FakeBinaryStorage, FakeIdentityVerifier
from tests.fakes.scientific_sources import FakeScientificSources

DEFAULT_TEST_DATABASE_URL = (
    "postgresql+asyncpg://fitness_coach:fitness_coach@localhost:5432/fitness_coach"
)


def _get_test_database_url() -> str:
    return os.environ.get("TEST_DATABASE_URL") or os.environ.get(
        "DATABASE_URL", DEFAULT_TEST_DATABASE_URL
    )


@pytest.fixture(scope="session")
def test_database_url() -> str:
    return _get_test_database_url()


@pytest.fixture(scope="session", autouse=True)
def apply_migrations(test_database_url: str) -> None:
    """Run real Alembic migrations once per test session against PostgreSQL + pgvector."""
    backend_dir = Path(__file__).resolve().parents[1]
    alembic_cfg = Config(str(backend_dir / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    prev_db_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = test_database_url
    try:
        command.upgrade(alembic_cfg, "head")
    finally:
        if prev_db_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = prev_db_url


@pytest.fixture
async def db_session(test_database_url: str) -> AsyncIterator[AsyncSession]:
    """Provide a clean PostgreSQL database per test by truncating all tables before each test."""
    engine = create_engine(test_database_url)
    session_factory = create_session_factory(engine)

    table_names = [table.name for table in reversed(Base.metadata.sorted_tables)]
    async with engine.begin() as conn:
        if table_names:
            quoted = ", ".join(f'"{name}"' for name in table_names)
            await conn.execute(text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE"))

    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest.fixture
def fake_ai() -> FakeAIProvider:
    return FakeAIProvider()


@pytest.fixture
def fake_scientific_sources() -> FakeScientificSources:
    return FakeScientificSources()


@pytest.fixture
def fake_identity_verifier() -> FakeIdentityVerifier:
    return FakeIdentityVerifier()


@pytest.fixture
def fake_binary_storage() -> FakeBinaryStorage:
    return FakeBinaryStorage()


@pytest.fixture
async def app(
    test_database_url: str,
    db_session: AsyncSession,  # ensures clean DB before app boots
    fake_ai: FakeAIProvider,
    fake_scientific_sources: FakeScientificSources,
    fake_identity_verifier: FakeIdentityVerifier,
    fake_binary_storage: FakeBinaryStorage,
):
    settings = Settings(
        database_url=test_database_url,
        bootstrap_curator_email="bootstrap@fitness.test",
        bootstrap_curator_subject="sub-bootstrap",
    )
    application = create_app(
        settings=settings,
        identity_verifier=fake_identity_verifier,
        binary_storage=fake_binary_storage,
        ai_provider=fake_ai,
        scientific_sources=fake_scientific_sources,
    )
    async with LifespanManager(application):
        yield application


@pytest.fixture
async def client(app) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        yield async_client


@pytest.fixture
async def seed_accounts(
    db_session: AsyncSession,
    fake_identity_verifier: FakeIdentityVerifier,
) -> dict[str, tuple[Athlete, str]]:
    """Create standard test identities: dual (curator+athlete), athlete_a, athlete_b, curator."""
    repo = SqlAlchemyIdentityRepository(db_session)

    dual = await repo.create_athlete(
        auth_subject="sub-dual-curator",
        email="dual@fitness.test",
        display_name="Curador Atleta",
        roles=frozenset({Role.CURATOR, Role.ATHLETE}),
    )
    athlete_a = await repo.create_athlete(
        auth_subject="sub-athlete-a",
        email="athlete.a@fitness.test",
        display_name="Atleta A",
        roles=frozenset({Role.ATHLETE}),
    )
    athlete_b = await repo.create_athlete(
        auth_subject="sub-athlete-b",
        email="athlete.b@fitness.test",
        display_name="Atleta B",
        roles=frozenset({Role.ATHLETE}),
    )
    curator_only = await repo.create_athlete(
        auth_subject="sub-curator-only",
        email="curator@fitness.test",
        display_name="Solo Curador",
        roles=frozenset({Role.CURATOR}),
    )
    await db_session.commit()

    tokens = {
        "dual": (
            dual,
            fake_identity_verifier.register_token(
                "tok-dual",
                auth_subject=dual.auth_subject,
                email=dual.email,
                display_name=dual.display_name,
            ),
        ),
        "athlete_a": (
            athlete_a,
            fake_identity_verifier.register_token(
                "tok-athlete-a",
                auth_subject=athlete_a.auth_subject,
                email=athlete_a.email,
                display_name=athlete_a.display_name,
            ),
        ),
        "athlete_b": (
            athlete_b,
            fake_identity_verifier.register_token(
                "tok-athlete-b",
                auth_subject=athlete_b.auth_subject,
                email=athlete_b.email,
                display_name=athlete_b.display_name,
            ),
        ),
        "curator": (
            curator_only,
            fake_identity_verifier.register_token(
                "tok-curator",
                auth_subject=curator_only.auth_subject,
                email=curator_only.email,
                display_name=curator_only.display_name,
            ),
        ),
    }
    return tokens
