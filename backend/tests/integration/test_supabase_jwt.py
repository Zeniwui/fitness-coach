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
        {"sub": "user-ec-123", "email": "curador@example.com", "aud": "authenticated"},
        attacker_key,
        algorithm="ES256",
        headers={"kid": "supabase-ec-key-1"},
    )

    with pytest.raises(UnauthorizedError):
        await verifier.verify_token(forged)
