"""Tests for SupabaseJWTVerifier supporting both asymmetric JWKS (ES256) and legacy HS256."""

from __future__ import annotations

import json

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from fitness_coach.domain.identity import UnauthorizedError
from fitness_coach.infrastructure.auth.supabase_jwt import SupabaseJWTVerifier


@pytest.mark.asyncio
async def test_verifies_es256_jwt_via_supabase_jwks_and_caches_keys() -> None:
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(private_key.public_key()))
    public_jwk["kid"] = "supabase-ec-key-1"
    public_jwk["alg"] = "ES256"
    public_jwk["use"] = "sig"

    jwks_calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal jwks_calls
        assert str(request.url) == "https://example.supabase.co/auth/v1/.well-known/jwks.json"
        jwks_calls += 1
        return httpx.Response(200, json={"keys": [public_jwk]})

    verifier = SupabaseJWTVerifier(
        supabase_url="https://example.supabase.co/rest/v1/",
        transport=httpx.MockTransport(handler),
    )

    token = jwt.encode(
        {
            "sub": "user-ec-123",
            "email": "Curador@Example.com",
            "aud": "authenticated",
            "iss": "https://example.supabase.co/auth/v1",
            "user_metadata": {"display_name": "Alex"},
        },
        private_key,
        algorithm="ES256",
        headers={"kid": "supabase-ec-key-1"},
    )

    verified = await verifier.verify_token(token)
    assert verified.auth_subject == "user-ec-123"
    assert verified.email == "curador@example.com"
    assert verified.display_name == "Alex"

    # Second call should hit the in-memory JWKS cache
    await verifier.verify_token(token)
    assert jwks_calls == 1


@pytest.mark.asyncio
async def test_verifies_legacy_hs256_jwt() -> None:
    secret = "test-legacy-hs256-secret-32-bytes-long!"
    verifier = SupabaseJWTVerifier(jwt_secret=secret)

    token = jwt.encode(
        {
            "sub": "user-hs-456",
            "email": "atleta@example.com",
            "aud": "authenticated",
        },
        secret,
        algorithm="HS256",
    )

    verified = await verifier.verify_token(token)
    assert verified.auth_subject == "user-hs-456"
    assert verified.email == "atleta@example.com"
    assert verified.display_name is None


@pytest.mark.asyncio
async def test_rejects_es256_jwt_signed_with_wrong_key() -> None:
    trusted_key = ec.generate_private_key(ec.SECP256R1())
    attacker_key = ec.generate_private_key(ec.SECP256R1())
    public_jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(trusted_key.public_key()))
    public_jwk["kid"] = "supabase-ec-key-1"

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"keys": [public_jwk]})

    verifier = SupabaseJWTVerifier(
        supabase_url="https://example.supabase.co",
        transport=httpx.MockTransport(handler),
    )

    forged = jwt.encode(
        {
            "sub": "user-ec-123",
            "email": "curador@example.com",
            "aud": "authenticated",
            "iss": "https://example.supabase.co/auth/v1",
        },
        attacker_key,
        algorithm="ES256",
        headers={"kid": "supabase-ec-key-1"},
    )

    with pytest.raises(UnauthorizedError):
        await verifier.verify_token(forged)


def test_settings_rejects_insecure_or_missing_jwt_configuration() -> None:
    from fitness_coach.infrastructure.config import DEFAULT_INSECURE_JWT_SECRET, Settings

    # Test environment allows omitted secret/url
    test_settings = Settings(environment="test", _env_file=None)
    assert test_settings.supabase_jwt_secret is None

    # Forbidden legacy literal is rejected in every environment, including test
    for env in ("test", "development", "production"):
        with pytest.raises(ValueError, match="supabase_jwt_secret"):
            Settings(
                environment=env,
                supabase_jwt_secret=DEFAULT_INSECURE_JWT_SECRET,
                _env_file=None,
            )

    # Empty or whitespace-only secret is rejected when provided
    with pytest.raises(ValueError, match="supabase_jwt_secret"):
        Settings(environment="test", supabase_jwt_secret="   ", _env_file=None)

    # Outside test, require supabase_url or an explicit >= 16-char secret
    for env in ("development", "production"):
        with pytest.raises(ValueError, match="supabase_jwt_secret"):
            Settings(environment=env, _env_file=None)
        with pytest.raises(ValueError, match="supabase_jwt_secret"):
            Settings(environment=env, supabase_jwt_secret="too-short", _env_file=None)

        # Valid with supabase_url only (JWKS mode)
        jwks_only = Settings(
            environment=env,
            supabase_url="https://example.supabase.co",
            _env_file=None,
        )
        assert jwks_only.supabase_url == "https://example.supabase.co"

        # Valid with explicit >= 16-char secret
        legacy_ok = Settings(
            environment=env,
            supabase_jwt_secret="explicit-secret-at-least-16",
            _env_file=None,
        )
        assert legacy_ok.supabase_jwt_secret == "explicit-secret-at-least-16"


@pytest.mark.asyncio
async def test_rejects_hs256_when_supabase_jwks_is_configured() -> None:
    secret = "test-legacy-hs256-secret-32-bytes-long!"
    verifier = SupabaseJWTVerifier(
        jwt_secret=secret,
        supabase_url="https://example.supabase.co",
    )

    token = jwt.encode(
        {
            "sub": "user-hs-456",
            "email": "atleta@example.com",
            "aud": "authenticated",
            "iss": "https://example.supabase.co/auth/v1",
        },
        secret,
        algorithm="HS256",
    )

    with pytest.raises(UnauthorizedError):
        await verifier.verify_token(token)


@pytest.mark.asyncio
async def test_rejects_es256_with_missing_or_wrong_issuer() -> None:
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(private_key.public_key()))
    public_jwk["kid"] = "supabase-ec-key-1"
    public_jwk["alg"] = "ES256"
    public_jwk["use"] = "sig"

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"keys": [public_jwk]})

    verifier = SupabaseJWTVerifier(
        supabase_url="https://example.supabase.co",
        transport=httpx.MockTransport(handler),
    )

    missing_iss = jwt.encode(
        {"sub": "user-ec-123", "email": "curador@example.com", "aud": "authenticated"},
        private_key,
        algorithm="ES256",
        headers={"kid": "supabase-ec-key-1"},
    )
    with pytest.raises(UnauthorizedError):
        await verifier.verify_token(missing_iss)

    wrong_iss = jwt.encode(
        {
            "sub": "user-ec-123",
            "email": "curador@example.com",
            "aud": "authenticated",
            "iss": "https://evil.supabase.co/auth/v1",
        },
        private_key,
        algorithm="ES256",
        headers={"kid": "supabase-ec-key-1"},
    )
    with pytest.raises(UnauthorizedError):
        await verifier.verify_token(wrong_iss)


@pytest.mark.asyncio
async def test_jwks_ignores_non_signing_use_and_requires_kid_when_multiple_keys_exist() -> None:
    key_1 = ec.generate_private_key(ec.SECP256R1())
    key_2 = ec.generate_private_key(ec.SECP256R1())
    enc_key = ec.generate_private_key(ec.SECP256R1())

    jwk_1 = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(key_1.public_key()))
    jwk_1.update({"kid": "k1", "alg": "ES256", "use": "sig"})

    jwk_2 = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(key_2.public_key()))
    jwk_2.update({"kid": "k2", "alg": "ES256"})  # use omitted -> eligible

    jwk_enc = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(enc_key.public_key()))
    jwk_enc.update({"kid": "k-enc", "alg": "ES256", "use": "enc"})

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"keys": [jwk_enc, jwk_1, jwk_2]})

    verifier = SupabaseJWTVerifier(
        supabase_url="https://example.supabase.co",
        transport=httpx.MockTransport(handler),
    )

    # Token claiming use="enc" key must be rejected
    enc_token = jwt.encode(
        {
            "sub": "u1",
            "email": "u1@example.com",
            "aud": "authenticated",
            "iss": "https://example.supabase.co/auth/v1",
        },
        enc_key,
        algorithm="ES256",
        headers={"kid": "k-enc"},
    )
    with pytest.raises(UnauthorizedError):
        await verifier.verify_token(enc_token)

    # Multiple eligible keys (k1, k2) -> token without kid must be rejected
    no_kid_token = jwt.encode(
        {
            "sub": "u1",
            "email": "u1@example.com",
            "aud": "authenticated",
            "iss": "https://example.supabase.co/auth/v1",
        },
        key_1,
        algorithm="ES256",
    )
    with pytest.raises(UnauthorizedError):
        await verifier.verify_token(no_kid_token)

    # Token with matching kid succeeds
    valid_token = jwt.encode(
        {
            "sub": "u1",
            "email": "u1@example.com",
            "aud": "authenticated",
            "iss": "https://example.supabase.co/auth/v1",
        },
        key_2,
        algorithm="ES256",
        headers={"kid": "k2"},
    )
    verified = await verifier.verify_token(valid_token)
    assert verified.auth_subject == "u1"


