"""Supabase Auth JWT verifier adapter (supports asymmetric JWKS ES256/RS256 and legacy HS256)."""

from __future__ import annotations

import time
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx
import jwt

from fitness_coach.application.ports.identity_storage import VerifiedIdentity
from fitness_coach.domain.identity import UnauthorizedError

_ASYMMETRIC_ALGS = frozenset({"ES256", "RS256"})
_JWKS_CACHE_TTL_SECONDS = 300.0


def _normalize_supabase_origin(supabase_url: str | None) -> str | None:
    if not supabase_url or not supabase_url.strip():
        return None
    parts = urlsplit(supabase_url.strip())
    if not parts.scheme or not parts.netloc:
        return None
    return urlunsplit((parts.scheme, parts.netloc, "", "", ""))


class SupabaseJWTVerifier:
    """Verifies Supabase Auth JWTs (ES256/RS256 via JWKS and legacy HS256) and extracts identity."""

    def __init__(
        self,
        *,
        jwt_secret: str | None = None,
        supabase_url: str | None = None,
        audience: str = "authenticated",
        transport: httpx.AsyncBaseTransport | None = None,
        jwks_cache_ttl_seconds: float = _JWKS_CACHE_TTL_SECONDS,
    ) -> None:
        self._jwt_secret = jwt_secret
        self._supabase_origin = _normalize_supabase_origin(supabase_url)
        self._audience = audience
        self._transport = transport
        self._jwks_cache_ttl = jwks_cache_ttl_seconds
        self._jwks_keys: list[dict[str, Any]] = []
        self._jwks_fetched_at: float = 0.0

    async def _fetch_jwks(self, *, force_refresh: bool = False) -> list[dict[str, Any]]:
        if not self._supabase_origin:
            raise UnauthorizedError("Token de autenticación inválido o expirado.")

        now = time.monotonic()
        if (
            not force_refresh
            and self._jwks_keys
            and (now - self._jwks_fetched_at) < self._jwks_cache_ttl
        ):
            return self._jwks_keys

        jwks_url = f"{self._supabase_origin}/auth/v1/.well-known/jwks.json"
        try:
            async with httpx.AsyncClient(transport=self._transport, timeout=5.0) as client:
                response = await client.get(jwks_url)
                response.raise_for_status()
                body = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise UnauthorizedError("Token de autenticación inválido o expirado.") from exc

        keys = body.get("keys")
        if not isinstance(keys, list) or not keys:
            raise UnauthorizedError("Token de autenticación inválido o expirado.")

        self._jwks_keys = [k for k in keys if isinstance(k, dict)]
        self._jwks_fetched_at = now
        return self._jwks_keys

    def _find_matching_jwk(
        self, keys: list[dict[str, Any]], *, kid: str | None, alg: str
    ) -> dict[str, Any] | None:
        if kid:
            for key in keys:
                if key.get("kid") == kid:
                    return key
            return None
        for key in keys:
            key_alg = key.get("alg")
            if key_alg is None or key_alg == alg:
                return key
        return None

    async def _decode_asymmetric(self, token: str, *, alg: str, kid: str | None) -> dict[str, Any]:
        keys = await self._fetch_jwks(force_refresh=False)
        matched = self._find_matching_jwk(keys, kid=kid, alg=alg)
        if matched is None:
            keys = await self._fetch_jwks(force_refresh=True)
            matched = self._find_matching_jwk(keys, kid=kid, alg=alg)
        if matched is None:
            raise UnauthorizedError("Token de autenticación inválido o expirado.")

        try:
            public_key = jwt.PyJWK.from_dict(matched).key
            return jwt.decode(
                token,
                public_key,
                algorithms=[alg],
                audience=self._audience,
            )
        except jwt.PyJWTError as exc:
            raise UnauthorizedError("Token de autenticación inválido o expirado.") from exc

    async def verify_token(self, token: str) -> VerifiedIdentity:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as exc:
            raise UnauthorizedError("Token de autenticación inválido o expirado.") from exc

        alg = header.get("alg")
        if alg == "HS256":
            if not self._jwt_secret:
                raise UnauthorizedError("Token de autenticación inválido o expirado.")
            try:
                payload = jwt.decode(
                    token,
                    self._jwt_secret,
                    algorithms=["HS256"],
                    audience=self._audience,
                )
            except jwt.PyJWTError as exc:
                raise UnauthorizedError("Token de autenticación inválido o expirado.") from exc
        elif isinstance(alg, str) and alg in _ASYMMETRIC_ALGS:
            kid = header.get("kid") if isinstance(header.get("kid"), str) else None
            payload = await self._decode_asymmetric(token, alg=alg, kid=kid)
        else:
            raise UnauthorizedError("Token de autenticación inválido o expirado.")

        subject = payload.get("sub")
        email = payload.get("email")
        if not isinstance(subject, str) or not subject or not isinstance(email, str) or not email:
            raise UnauthorizedError("El token no contiene identidad válida.")

        user_meta = payload.get("user_metadata") or {}
        display_name = user_meta.get("display_name") or user_meta.get("full_name")
        return VerifiedIdentity(
            auth_subject=subject,
            email=email.strip().lower(),
            display_name=display_name if isinstance(display_name, str) else None,
        )
