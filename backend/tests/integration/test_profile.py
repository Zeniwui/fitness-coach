"""Integration tests for ticket #3: Living Profile, Injuries & Multi-Athlete Isolation."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_profile_endpoints_reject_unauthenticated_requests_401(
    client: AsyncClient,
) -> None:
    get_resp = await client.get("/api/v1/profile")
    assert get_resp.status_code == 401

    put_resp = await client.put("/api/v1/profile", json={"age": 28})
    assert put_resp.status_code == 401

    injuries_resp = await client.get("/api/v1/profile/injuries")
    assert injuries_resp.status_code == 401


@pytest.mark.asyncio
async def test_athlete_gets_default_living_profile_and_saves_structured_fields(
    client: AsyncClient,
    seed_accounts,
) -> None:
    athlete_a, token_a = seed_accounts["athlete_a"]

    # Initial GET returns an empty default Living Profile with natural approach by default
    initial_resp = await client.get("/api/v1/profile", headers=_auth_headers(token_a))
    assert initial_resp.status_code == 200
    initial = initial_resp.json()
    assert initial["athlete_id"] == str(athlete_a.id)
    assert initial["has_saved_profile"] is False
    assert initial["training_approach"] == "natural"
    assert initial["equipment"] == []
    assert initial["allergies"] == []
    assert initial["food_preferences"] == []
    assert initial["injuries"] == []
    assert initial["active_injuries_count"] == 0

    # Athlete fills in complete structured Living Profile
    update_payload = {
        "age": 31,
        "sex": "male",
        "height_cm": 178.5,
        "base_weight_kg": 81.2,
        "experience_level": "intermediate",
        "primary_goal": "hypertrophy",
        "training_days_per_week": 4,
        "session_duration_min": 75,
        "equipment": ["Barra olímpica", "Mancuernas hasta 40 kg", "Poleas", "Prensa"],
        "allergies": ["Lactosa", "Frutos secos"],
        "food_preferences": ["Alta proteína", "4 comidas al día"],
        "training_approach": "natural",
        "notes": "Entreno por la mañana antes de trabajar.",
    }
    put_resp = await client.put(
        "/api/v1/profile",
        headers=_auth_headers(token_a),
        json=update_payload,
    )
    assert put_resp.status_code == 200
    saved = put_resp.json()
    assert saved["athlete_id"] == str(athlete_a.id)
    assert saved["has_saved_profile"] is True
    assert saved["age"] == 31
    assert saved["sex"] == "male"
    assert saved["height_cm"] == 178.5
    assert saved["base_weight_kg"] == 81.2
    assert saved["experience_level"] == "intermediate"
    assert saved["primary_goal"] == "hypertrophy"
    assert saved["training_days_per_week"] == 4
    assert saved["session_duration_min"] == 75
    assert saved["equipment"] == ["Barra olímpica", "Mancuernas hasta 40 kg", "Poleas", "Prensa"]
    assert saved["allergies"] == ["Lactosa", "Frutos secos"]
    assert saved["food_preferences"] == ["Alta proteína", "4 comidas al día"]
    assert saved["training_approach"] == "natural"
    assert saved["notes"] == "Entreno por la mañana antes de trabajar."
    assert saved["updated_at"] is not None

    # Subsequent GET reflects persisted state in PostgreSQL
    fetched_resp = await client.get("/api/v1/profile", headers=_auth_headers(token_a))
    assert fetched_resp.status_code == 200
    assert fetched_resp.json()["base_weight_kg"] == 81.2
    assert fetched_resp.json()["primary_goal"] == "hypertrophy"


@pytest.mark.asyncio
async def test_living_profile_rejects_invalid_values_with_spanish_validation_error(
    client: AsyncClient,
    seed_accounts,
) -> None:
    _, token_a = seed_accounts["athlete_a"]

    bad_resp = await client.put(
        "/api/v1/profile",
        headers=_auth_headers(token_a),
        json={
            "age": 10,
            "training_days_per_week": 9,
            "training_approach": "natural",
        },
    )
    assert bad_resp.status_code == 422
    detail = str(bad_resp.json()["detail"])
    assert "edad" in detail.lower() or "días" in detail.lower()

    bad_injury = await client.post(
        "/api/v1/profile/injuries",
        headers=_auth_headers(token_a),
        json={"body_part": "   ", "description": "Dolor", "severity": "mild"},
    )
    assert bad_injury.status_code == 422
    assert "zona corporal" in str(bad_injury.json()["detail"]).lower()


@pytest.mark.asyncio
async def test_athlete_manages_injuries_and_resolving_updates_active_context_immediately(
    client: AsyncClient,
    seed_accounts,
) -> None:
    _, token_a = seed_accounts["athlete_a"]

    # Add two active injuries/restrictions
    shoulder_resp = await client.post(
        "/api/v1/profile/injuries",
        headers=_auth_headers(token_a),
        json={
            "body_part": "Hombro derecho",
            "description": "Molestia en press banca plano con agarre ancho",
            "severity": "moderate",
        },
    )
    assert shoulder_resp.status_code == 201
    shoulder = shoulder_resp.json()
    assert shoulder["status"] == "active"
    assert shoulder["resolved_at"] is None
    assert shoulder["resolution_notes"] is None

    knee_resp = await client.post(
        "/api/v1/profile/injuries",
        headers=_auth_headers(token_a),
        json={
            "body_part": "Rodilla izquierda",
            "description": "Tendinopatía rotuliana leve en sentadilla profunda",
            "severity": "mild",
        },
    )
    assert knee_resp.status_code == 201
    knee = knee_resp.json()

    # Active context reflects 2 active injuries immediately
    profile_resp = await client.get("/api/v1/profile", headers=_auth_headers(token_a))
    assert profile_resp.status_code == 200
    assert profile_resp.json()["active_injuries_count"] == 2
    assert len(profile_resp.json()["injuries"]) == 2

    # Edit description & severity of shoulder injury
    edit_resp = await client.patch(
        f"/api/v1/profile/injuries/{shoulder['id']}",
        headers=_auth_headers(token_a),
        json={
            "description": "Molestia solo al bajar por debajo de 90 grados",
            "severity": "mild",
        },
    )
    assert edit_resp.status_code == 200
    assert edit_resp.json()["description"] == "Molestia solo al bajar por debajo de 90 grados"
    assert edit_resp.json()["severity"] == "mild"
    assert edit_resp.json()["status"] == "active"

    # Mark shoulder injury as resolved with explicit date & notes
    resolve_resp = await client.patch(
        f"/api/v1/profile/injuries/{shoulder['id']}",
        headers=_auth_headers(token_a),
        json={
            "status": "resolved",
            "resolved_at": "2026-11-20T12:00:00Z",
            "resolution_notes": "Sin dolor tras 3 semanas de trabajo escapular.",
        },
    )
    assert resolve_resp.status_code == 200
    resolved = resolve_resp.json()
    assert resolved["status"] == "resolved"
    assert resolved["resolved_at"] is not None
    assert resolved["resolution_notes"] == "Sin dolor tras 3 semanas de trabajo escapular."

    # Immediately reflected in Living Profile active context and filtered GET
    after_resolve = (await client.get("/api/v1/profile", headers=_auth_headers(token_a))).json()
    assert after_resolve["active_injuries_count"] == 1

    active_only = (
        await client.get("/api/v1/profile/injuries?status=active", headers=_auth_headers(token_a))
    ).json()["items"]
    assert len(active_only) == 1
    assert active_only[0]["id"] == knee["id"]

    # Reopen shoulder injury clears resolved_at and resolution_notes
    reopen_resp = await client.patch(
        f"/api/v1/profile/injuries/{shoulder['id']}",
        headers=_auth_headers(token_a),
        json={"status": "active"},
    )
    assert reopen_resp.status_code == 200
    assert reopen_resp.json()["status"] == "active"
    assert reopen_resp.json()["resolved_at"] is None
    assert reopen_resp.json()["resolution_notes"] is None

    # Delete knee injury removes it immediately
    del_resp = await client.delete(
        f"/api/v1/profile/injuries/{knee['id']}",
        headers=_auth_headers(token_a),
    )
    assert del_resp.status_code == 204

    final_profile = (await client.get("/api/v1/profile", headers=_auth_headers(token_a))).json()
    assert len(final_profile["injuries"]) == 1
    assert final_profile["injuries"][0]["id"] == shoulder["id"]


@pytest.mark.asyncio
async def test_multi_athlete_isolation_blocks_cross_athlete_profile_and_injury_access(
    client: AsyncClient,
    seed_accounts,
) -> None:
    athlete_a, token_a = seed_accounts["athlete_a"]
    athlete_b, token_b = seed_accounts["athlete_b"]

    # Athlete A and Athlete B save distinct Living Profiles
    await client.put(
        "/api/v1/profile",
        headers=_auth_headers(token_a),
        json={
            "age": 29,
            "base_weight_kg": 76.0,
            "primary_goal": "hypertrophy",
            "equipment": ["Mancuernas"],
            "training_approach": "natural",
            "notes": "Secreto de Atleta A",
        },
    )
    await client.put(
        "/api/v1/profile",
        headers=_auth_headers(token_b),
        json={
            "age": 35,
            "base_weight_kg": 92.5,
            "primary_goal": "fat_loss",
            "equipment": ["Máquinas guiadas"],
            "training_approach": "natural",
            "notes": "Secreto de Atleta B",
        },
    )

    # Athlete B registers a private injury
    injury_b_resp = await client.post(
        "/api/v1/profile/injuries",
        headers=_auth_headers(token_b),
        json={
            "body_part": "Zona lumbar",
            "description": "Evitar peso muerto convencional pesado",
            "severity": "severe",
        },
    )
    assert injury_b_resp.status_code == 201
    injury_b_id = injury_b_resp.json()["id"]

    # Athlete A only sees their own profile & zero injuries
    profile_a = (await client.get("/api/v1/profile", headers=_auth_headers(token_a))).json()
    assert profile_a["athlete_id"] == str(athlete_a.id)
    assert profile_a["notes"] == "Secreto de Atleta A"
    assert profile_a["injuries"] == []

    # Athlete A cannot pass athlete_id to hijack Athlete B's profile
    hijack_resp = await client.put(
        "/api/v1/profile",
        headers=_auth_headers(token_a),
        json={"athlete_id": str(athlete_b.id), "age": 50},
    )
    assert hijack_resp.status_code == 422

    # Athlete A cannot edit or resolve Athlete B's injury -> 404 (no existence leakage)
    patch_cross = await client.patch(
        f"/api/v1/profile/injuries/{injury_b_id}",
        headers=_auth_headers(token_a),
        json={"status": "resolved"},
    )
    assert patch_cross.status_code == 404

    # Athlete A cannot delete Athlete B's injury -> 404 (no existence leakage)
    delete_cross = await client.delete(
        f"/api/v1/profile/injuries/{injury_b_id}",
        headers=_auth_headers(token_a),
    )
    assert delete_cross.status_code == 404

    # Error response for cross-athlete UUID is identical to non-existent UUID
    missing_resp = await client.delete(
        "/api/v1/profile/injuries/00000000-0000-0000-0000-000000000000",
        headers=_auth_headers(token_a),
    )
    assert missing_resp.status_code == 404
    assert delete_cross.json()["detail"] == missing_resp.json()["detail"]

    # Athlete B's profile and injury remain completely intact
    profile_b = (await client.get("/api/v1/profile", headers=_auth_headers(token_b))).json()
    assert profile_b["athlete_id"] == str(athlete_b.id)
    assert profile_b["notes"] == "Secreto de Atleta B"
    assert len(profile_b["injuries"]) == 1
    assert profile_b["injuries"][0]["id"] == injury_b_id
    assert profile_b["injuries"][0]["status"] == "active"

