"""Integration tests for ticket #2: Invitation-only auth, roles, and multi-Athlete isolation."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from fitness_coach.domain.identity import ForbiddenError
from tests.fakes.identity_storage import FakeBinaryStorage, FakeIdentityVerifier


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_health_and_postgres_pgvector_tsvector_extensions(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"

    # Verify real PostgreSQL has pgvector and tsvector available
    ext_result = await db_session.execute(
        text("SELECT extname FROM pg_extension WHERE extname = 'vector'")
    )
    assert ext_result.scalar_one() == "vector"

    tsv_result = await db_session.execute(
        text(
            "SELECT to_tsvector('spanish', 'hipertrofia RIR 1RM HMB ISSN') "
            "@@ plainto_tsquery('RIR')"
        )
    )
    assert tsv_result.scalar_one() is True


@pytest.mark.asyncio
async def test_unauthenticated_requests_rejected_401(client: AsyncClient) -> None:
    me_resp = await client.get("/api/v1/auth/me")
    assert me_resp.status_code == 401

    curator_resp = await client.get("/api/v1/curator/invitations")
    assert curator_resp.status_code == 401


@pytest.mark.asyncio
async def test_public_registration_disabled_without_valid_invitation(
    client: AsyncClient,
    fake_identity_verifier: FakeIdentityVerifier,
) -> None:
    stranger_token = fake_identity_verifier.register_token(
        "tok-stranger",
        auth_subject="sub-stranger",
        email="stranger@fitness.test",
        display_name="No Invitado",
    )

    # Valid external JWT but not registered in Fitness Coach -> 401
    me_resp = await client.get("/api/v1/auth/me", headers=_auth_headers(stranger_token))
    assert me_resp.status_code == 401

    # Attempting to redeem a fabricated invitation token -> 400
    redeem_resp = await client.post(
        "/api/v1/auth/invitations/redeem",
        headers=_auth_headers(stranger_token),
        json={"token": "invalid-token-123", "display_name": "No Invitado"},
    )
    assert redeem_resp.status_code == 400


@pytest.mark.asyncio
async def test_curator_issues_invitation_and_invited_athlete_redeems(
    client: AsyncClient,
    seed_accounts,
    fake_identity_verifier: FakeIdentityVerifier,
) -> None:
    _, curator_token = seed_accounts["curator"]

    # Curator creates invitation for new Athlete
    create_resp = await client.post(
        "/api/v1/curator/invitations",
        headers=_auth_headers(curator_token),
        json={"email": "nuevo.atleta@fitness.test", "roles": ["athlete"]},
    )
    assert create_resp.status_code == 201
    created = create_resp.json()
    assert created["email"] == "nuevo.atleta@fitness.test"
    assert created["roles"] == ["athlete"]
    assert created["invitation_token"]
    invite_token = created["invitation_token"]

    # Curator lists invitations
    list_resp = await client.get(
        "/api/v1/curator/invitations",
        headers=_auth_headers(curator_token),
    )
    assert list_resp.status_code == 200
    invitations = list_resp.json()["items"]
    assert len(invitations) == 1
    assert invitations[0]["email"] == "nuevo.atleta@fitness.test"
    assert invitations[0]["status"] == "pending"

    # Wrong email cannot redeem the invitation
    wrong_person_token = fake_identity_verifier.register_token(
        "tok-wrong-email",
        auth_subject="sub-wrong",
        email="otro@fitness.test",
    )
    wrong_redeem = await client.post(
        "/api/v1/auth/invitations/redeem",
        headers=_auth_headers(wrong_person_token),
        json={"token": invite_token, "display_name": "Intruso"},
    )
    assert wrong_redeem.status_code == 400

    # Matching invited person redeems invitation
    invited_token = fake_identity_verifier.register_token(
        "tok-invited",
        auth_subject="sub-nuevo-atleta",
        email="nuevo.atleta@fitness.test",
        display_name="Nuevo Atleta",
    )
    redeem_resp = await client.post(
        "/api/v1/auth/invitations/redeem",
        headers=_auth_headers(invited_token),
        json={"token": invite_token, "display_name": "Nuevo Atleta"},
    )
    assert redeem_resp.status_code == 201
    athlete_payload = redeem_resp.json()
    assert athlete_payload["email"] == "nuevo.atleta@fitness.test"
    assert athlete_payload["roles"] == ["athlete"]
    assert athlete_payload["is_curator"] is False

    # Reusing the same invitation fails
    reuse_resp = await client.post(
        "/api/v1/auth/invitations/redeem",
        headers=_auth_headers(invited_token),
        json={"token": invite_token, "display_name": "Nuevo Atleta"},
    )
    assert reuse_resp.status_code == 400

    # Newly onboarded Athlete can access /auth/me
    me_resp = await client.get("/api/v1/auth/me", headers=_auth_headers(invited_token))
    assert me_resp.status_code == 200
    assert me_resp.json()["athlete_id"] == athlete_payload["athlete_id"]


@pytest.mark.asyncio
async def test_dual_role_curator_and_athlete_operates_without_switching_account(
    client: AsyncClient,
    seed_accounts,
) -> None:
    _, dual_token = seed_accounts["dual"]

    me_resp = await client.get("/api/v1/auth/me", headers=_auth_headers(dual_token))
    assert me_resp.status_code == 200
    me = me_resp.json()
    assert me["is_curator"] is True
    assert me["is_athlete"] is True
    assert set(me["roles"]) == {"athlete", "curator"}

    inv_resp = await client.post(
        "/api/v1/curator/invitations",
        headers=_auth_headers(dual_token),
        json={"email": "dual.invited@fitness.test", "roles": ["athlete"]},
    )
    assert inv_resp.status_code == 201


@pytest.mark.asyncio
async def test_athlete_only_gets_403_on_curator_endpoints(
    client: AsyncClient,
    seed_accounts,
) -> None:
    _, athlete_a_token = seed_accounts["athlete_a"]

    list_resp = await client.get(
        "/api/v1/curator/invitations",
        headers=_auth_headers(athlete_a_token),
    )
    assert list_resp.status_code == 403

    create_resp = await client.post(
        "/api/v1/curator/invitations",
        headers=_auth_headers(athlete_a_token),
        json={"email": "hack@fitness.test", "roles": ["curator"]},
    )
    assert create_resp.status_code == 403


@pytest.mark.asyncio
async def test_bootstrap_curator_allowed_only_on_empty_database(
    client: AsyncClient,
    fake_identity_verifier: FakeIdentityVerifier,
) -> None:
    bootstrap_token = fake_identity_verifier.register_token(
        "tok-bootstrap",
        auth_subject="sub-bootstrap",
        email="bootstrap@fitness.test",
        display_name="Curador Fundador",
    )

    resp = await client.post(
        "/api/v1/auth/bootstrap-curator",
        headers=_auth_headers(bootstrap_token),
        json={"display_name": "Curador Fundador"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["is_curator"] is True
    assert body["is_athlete"] is True

    # Second attempt after DB is no longer empty must be rejected (403)
    second_resp = await client.post(
        "/api/v1/auth/bootstrap-curator",
        headers=_auth_headers(bootstrap_token),
        json={"display_name": "Curador Fundador"},
    )
    assert second_resp.status_code == 403


@pytest.mark.asyncio
async def test_multi_athlete_identity_and_storage_isolation(
    client: AsyncClient,
    seed_accounts,
    fake_binary_storage: FakeBinaryStorage,
) -> None:
    athlete_a, token_a = seed_accounts["athlete_a"]
    athlete_b, token_b = seed_accounts["athlete_b"]

    me_a = (await client.get("/api/v1/auth/me", headers=_auth_headers(token_a))).json()
    me_b = (await client.get("/api/v1/auth/me", headers=_auth_headers(token_b))).json()

    assert me_a["athlete_id"] == str(athlete_a.id)
    assert me_b["athlete_id"] == str(athlete_b.id)
    assert me_a["athlete_id"] != me_b["athlete_id"]

    # Binary storage prefix isolation: Athlete B cannot access Athlete A's object
    path_a = await fake_binary_storage.put_athlete_object(
        athlete_id=athlete_a.id,
        relative_path="meals/lunch.jpg",
        data=b"fake-image-bytes",
        content_type="image/jpeg",
    )
    assert path_a.startswith(f"{athlete_a.id}/")
    assert await fake_binary_storage.get_athlete_object(
        athlete_id=athlete_a.id, storage_path=path_a
    ) == b"fake-image-bytes"

    with pytest.raises(ForbiddenError):
        await fake_binary_storage.get_athlete_object(
            athlete_id=athlete_b.id, storage_path=path_a
        )


@pytest.mark.asyncio
async def test_supabase_jwt_verifier_validates_and_rejects_tokens() -> None:
    import jwt as pyjwt

    from fitness_coach.domain.identity import UnauthorizedError
    from fitness_coach.infrastructure.auth.supabase_jwt import SupabaseJWTVerifier

    secret = "test-super-secret-key-at-least-32-bytes"
    verifier = SupabaseJWTVerifier(jwt_secret=secret, audience="authenticated")

    valid_token = pyjwt.encode(
        {
            "sub": "user-uuid-123",
            "email": "Atleta@Example.com",
            "aud": "authenticated",
            "user_metadata": {"display_name": "Carlos"},
        },
        secret,
        algorithm="HS256",
    )
    identity = await verifier.verify_token(valid_token)
    assert identity.auth_subject == "user-uuid-123"
    assert identity.email == "atleta@example.com"
    assert identity.display_name == "Carlos"

    bad_token = pyjwt.encode(
        {"sub": "user-uuid-123", "email": "atleta@example.com", "aud": "authenticated"},
        "wrong-secret-key-32-bytes-minimum",
        algorithm="HS256",
    )
    with pytest.raises(UnauthorizedError):
        await verifier.verify_token(bad_token)


@pytest.mark.asyncio
async def test_production_rejects_default_insecure_jwt_secret() -> None:
    from fitness_coach.infrastructure.config import Settings

    with pytest.raises(ValueError, match="supabase_jwt_secret"):
        Settings(environment="production")

    # Explicit non-default secret is accepted in production
    prod_settings = Settings(
        environment="production",
        supabase_jwt_secret="real-production-secret-at-least-32-chars",
    )
    assert prod_settings.environment == "production"


@pytest.mark.asyncio
async def test_bootstrap_curator_refuses_open_bootstrap_when_unconfigured(
    db_session: AsyncSession,
) -> None:
    from fitness_coach.application.ports.identity_storage import VerifiedIdentity
    from fitness_coach.application.use_cases.identity import BootstrapCuratorUseCase
    from fitness_coach.infrastructure.db.repositories.identity import SqlAlchemyIdentityRepository

    repo = SqlAlchemyIdentityRepository(db_session)
    use_case = BootstrapCuratorUseCase(
        repo,
        bootstrap_email=None,
        bootstrap_subject=None,
    )
    with pytest.raises(ForbiddenError, match="deshabilitado|configur"):
        await use_case.execute(
            verified=VerifiedIdentity(
                auth_subject="sub-anyone",
                email="anyone@fitness.test",
                display_name="Intruso",
            )
        )
