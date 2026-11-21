"""Supabase Auth JWT verifier adapter."""

from __future__ import annotations

import jwt

from fitness_coach.application.ports.identity_storage import VerifiedIdentity
from fitness_coach.domain.identity import UnauthorizedError


class SupabaseJWTVerifier:
    """Verifies HS256 Supabase Auth JWTs and extracts auth_subject and email."""

    def __init__(self, *, jwt_secret: str, audience: str = "authenticated") -> None:
        self._jwt_secret = jwt_secret
        self._audience = audience

    async def verify_token(self, token: str) -> VerifiedIdentity:
        try:
            payload = jwt.decode(
                token,
                self._jwt_secret,
                algorithms=["HS256"],
                audience=self._audience,
            )
        except jwt.PyJWTError as exc:
            raise UnauthorizedError("Token de autenticación inválido o expirado.") from exc

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
