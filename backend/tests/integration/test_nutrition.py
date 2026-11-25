"""Integration tests for Nutrition (#8): phases, check-ins, adjustments, and Coach context."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_nutrition_phase_lifecycle_single_active_and_isolation(
    client: AsyncClient,
    seed_accounts: dict,
) -> None:
    """Athlete can create, update, switch (closing prior), and complete a Fase Nutricional."""
    _, token_a = seed_accounts["athlete_a"]
    _, token_b = seed_accounts["athlete_b"]

    # Unauthenticated request rejected with 401
    unauth = await client.get("/api/v1/nutrition/phases")
    assert unauth.status_code == 401

    # Initially empty
    empty_resp = await client.get("/api/v1/nutrition/phases", headers=_auth_header(token_a))
    assert empty_resp.status_code == 200
    assert empty_resp.json() == []

    # 1. Create active bulk phase for Athlete A
    create_resp = await client.post(
        "/api/v1/nutrition/phases",
        headers=_auth_header(token_a),
        json={
            "phase_type": "bulk",
            "start_date": "2026-10-01",
            "target_calories": 3000,
            "protein_g": 180,
            "fat_g": 80,
            "carbs_g": 390,
            "target_weekly_weight_change_kg": 0.25,
            "notes": "Volumen limpio controlado",
        },
    )
    assert create_resp.status_code == 201
    phase_1 = create_resp.json()
    assert phase_1["phase_type"] == "bulk"
    assert phase_1["status"] == "active"
    assert phase_1["target_calories"] == 3000
    assert phase_1["protein_g"] == 180
    assert phase_1["fat_g"] == 80
    assert phase_1["carbs_g"] == 390
    assert phase_1["target_weekly_weight_change_kg"] == pytest.approx(0.25)

    # 2. Update active phase targets
    patch_resp = await client.patch(
        f"/api/v1/nutrition/phases/{phase_1['id']}",
        headers=_auth_header(token_a),
        json={
            "target_calories": 3100,
            "carbs_g": 415,
            "notes": "Ajuste ligero por mayor volumen de entreno",
        },
    )
    assert patch_resp.status_code == 200
    updated_1 = patch_resp.json()
    assert updated_1["target_calories"] == 3100
    assert updated_1["carbs_g"] == 415
    assert updated_1["protein_g"] == 180

    # 3. Strict multi-Athlete isolation: Athlete B cannot see, edit, or complete Athlete A's phase
    list_b = await client.get("/api/v1/nutrition/phases", headers=_auth_header(token_b))
    assert list_b.status_code == 200
    assert list_b.json() == []

    cross_patch = await client.patch(
        f"/api/v1/nutrition/phases/{phase_1['id']}",
        headers=_auth_header(token_b),
        json={"target_calories": 2000},
    )
    assert cross_patch.status_code == 404

    cross_complete = await client.post(
        f"/api/v1/nutrition/phases/{phase_1['id']}/complete",
        headers=_auth_header(token_b),
        json={},
    )
    assert cross_complete.status_code == 404

    # 4. Creating a new phase (mini_cut) cleanly closes the previous active phase
    create_2 = await client.post(
        "/api/v1/nutrition/phases",
        headers=_auth_header(token_a),
        json={
            "phase_type": "mini_cut",
            "start_date": "2026-11-01",
            "target_calories": 2300,
            "protein_g": 195,
            "fat_g": 65,
            "carbs_g": 234,
            "target_weekly_weight_change_kg": -0.6,
            "notes": "Mini-cut de 4 semanas",
        },
    )
    assert create_2.status_code == 201
    phase_2 = create_2.json()
    assert phase_2["status"] == "active"
    assert phase_2["phase_type"] == "mini_cut"

    list_a = await client.get("/api/v1/nutrition/phases", headers=_auth_header(token_a))
    assert list_a.status_code == 200
    phases_a = list_a.json()
    assert len(phases_a) == 2
    active_phases = [p for p in phases_a if p["status"] == "active"]
    completed_phases = [p for p in phases_a if p["status"] == "completed"]
    assert len(active_phases) == 1
    assert active_phases[0]["id"] == phase_2["id"]
    assert len(completed_phases) == 1
    assert completed_phases[0]["id"] == phase_1["id"]
    assert completed_phases[0]["end_date"] == "2026-11-01"

    # 5. Explicitly complete the active phase
    complete_resp = await client.post(
        f"/api/v1/nutrition/phases/{phase_2['id']}/complete",
        headers=_auth_header(token_a),
        json={"end_date": "2026-11-21"},
    )
    assert complete_resp.status_code == 200
    completed_2 = complete_resp.json()
    assert completed_2["status"] == "completed"
    assert completed_2["end_date"] == "2026-11-21"

    # Cannot update an already completed phase
    patch_completed = await client.patch(
        f"/api/v1/nutrition/phases/{phase_2['id']}",
        headers=_auth_header(token_a),
        json={"target_calories": 2400},
    )
    assert patch_completed.status_code == 409


@pytest.mark.asyncio
async def test_weekly_checkin_idempotency_trend_coach_proposal_and_explicit_confirm(
    client: AsyncClient,
    seed_accounts: dict,
    fake_ai,
) -> None:
    """Weekly Check-in computes trend & TDEE delta, proposes adjustments without mutating phase,
    protects against duplicate submits via idempotency_key, and applies only on explicit confirm.
    """
    _, token_a = seed_accounts["athlete_a"]
    _, token_b = seed_accounts["athlete_b"]
    _, token_dual = seed_accounts["dual"]

    # Seed Athlete A's Living Profile with allergies & food preferences
    prof_resp = await client.put(
        "/api/v1/profile",
        headers=_auth_header(token_a),
        json={
            "base_weight_kg": 82.0,
            "primary_goal": "fat_loss",
            "allergies": ["lactosa", "cacahuete"],
            "food_preferences": ["dieta mediterránea", "pescado azul"],
        },
    )
    assert prof_resp.status_code == 200

    # Seed an approved EvidenceCard in Base de Conocimiento (via Curator DOI + approve)
    cand_resp = await client.post(
        "/api/v1/curator/candidates/from-doi",
        headers=_auth_header(token_dual),
        json={"doi": "10.1186/s12970-024-00611-2"},
    )
    if cand_resp.status_code == 201:
        cand_id = cand_resp.json()["id"]
        approve_resp = await client.post(
            f"/api/v1/curator/candidates/{cand_id}/approve",
            headers=_auth_header(token_dual),
            json={
                "evidence_level": "meta_analysis",
                "curated_text_es": (
                    "En déficit calórico, mantener proteína entre 2.0 y 2.4 g/kg/día preserva "
                    "la masa magra y ayuda a controlar el hambre."
                ),
                "tags": ["proteina", "deficit", "definicion"],
            },
        )
        assert approve_resp.status_code == 201

    # Activate a Cut phase (-0.5 kg/week target, 2400 kcal)
    phase_resp = await client.post(
        "/api/v1/nutrition/phases",
        headers=_auth_header(token_a),
        json={
            "phase_type": "cut",
            "start_date": "2026-10-01",
            "target_calories": 2400,
            "protein_g": 185,
            "fat_g": 65,
            "carbs_g": 269,
            "target_weekly_weight_change_kg": -0.5,
            "notes": "Definición controlada",
        },
    )
    assert phase_resp.status_code == 201
    phase = phase_resp.json()

    # Check-in 1 (week 1): uses daily_weights to compute average_weight_kg
    c1_payload = {
        "checkin_date": "2026-10-08",
        "idempotency_key": "checkin-a-2026-10-08",
        "daily_weights": [82.2, 82.0, 81.8],
        "body_measurements": {"waist_cm": 84.5},
        "adherence_score": 9,
        "sleep_quality": 8,
        "energy_level": 7,
        "hunger_level": 5,
        "recovery_score": 8,
        "perceived_fatigue": 4,
        "performance_notes": "Cargas estables en press banca y sentadilla.",
    }
    c1_resp = await client.post(
        "/api/v1/nutrition/checkins",
        headers=_auth_header(token_a),
        json=c1_payload,
    )
    assert c1_resp.status_code == 201
    c1 = c1_resp.json()
    assert c1["average_weight_kg"] == pytest.approx(82.0)
    assert c1["nutrition_phase_id"] == phase["id"]
    assert c1["body_measurements"]["waist_cm"] == pytest.approx(84.5)
    assert c1["weight_trend"]["trend_status"] == "insufficient_data"

    # Double-submit protection: same idempotency_key returns existing Check-in without duplicating
    ai_calls_before_dup = len(fake_ai.generate_calls)
    c1_dup = await client.post(
        "/api/v1/nutrition/checkins",
        headers=_auth_header(token_a),
        json=c1_payload,
    )
    assert c1_dup.status_code == 200
    assert c1_dup.json()["id"] == c1["id"]
    assert len(fake_ai.generate_calls) == ai_calls_before_dup

    # Check-in 2 (7 days later): weight dropped only 0.05 kg (stalled vs -0.5 kg/week target)
    # AND fatigue=9, sleep=4, recovery=3 -> expects calorie cut & deload/volume note
    c2_resp = await client.post(
        "/api/v1/nutrition/checkins",
        headers=_auth_header(token_a),
        json={
            "checkin_date": "2026-10-15",
            "idempotency_key": "checkin-a-2026-10-15",
            "average_weight_kg": 81.95,
            "body_measurements": {"waist_cm": 84.4},
            "adherence_score": 9,
            "sleep_quality": 4,
            "energy_level": 4,
            "hunger_level": 7,
            "recovery_score": 3,
            "perceived_fatigue": 9,
            "performance_notes": "Pérdida de 2 reps en remos y piernas pesadas.",
        },
    )
    assert c2_resp.status_code == 201
    c2 = c2_resp.json()

    # Automated weight trend & TDEE delta calculation
    assert c2["weight_trend"]["previous_weight_kg"] == pytest.approx(82.0)
    assert c2["weight_trend"]["actual_weekly_change_kg"] == pytest.approx(-0.05, abs=0.01)
    assert c2["weight_trend"]["target_weekly_change_kg"] == pytest.approx(-0.5)
    assert c2["weight_trend"]["trend_status"] == "losing_too_slow"
    assert c2["estimated_tdee_delta_kcal"] is not None
    assert c2["estimated_tdee_delta_kcal"] < 0  # real expenditure lower than assumed

    # Concrete Coach adjustment proposal generated, respecting LivingProfile allergies/preferences
    rec = c2["coach_recommendations"]
    assert rec["calorie_delta_kcal"] < 0
    assert rec["proposed_target_calories"] < 2400
    assert rec["proposed_protein_g"] >= 185  # preserves protein in deficit
    assert rec["training_adjustment_es"] is not None  # high fatigue triggers volume/deload advice
    assert "lactosa" in fake_ai.generate_calls[-1]["system_prompt"].lower()
    assert c2["adjustment_status"] == "proposed"

    # INVARIANT: Active NutritionPhase MUST NOT be mutated before explicit Athlete confirmation
    phases_before = (
        await client.get("/api/v1/nutrition/phases", headers=_auth_header(token_a))
    ).json()
    assert phases_before[0]["target_calories"] == 2400

    # Strict multi-Athlete isolation on Check-ins and adjustment confirmation
    list_b = await client.get("/api/v1/nutrition/checkins", headers=_auth_header(token_b))
    assert list_b.status_code == 200
    assert list_b.json() == []

    cross_apply = await client.post(
        f"/api/v1/nutrition/checkins/{c2['id']}/apply-adjustment",
        headers=_auth_header(token_b),
    )
    assert cross_apply.status_code == 404

    # Explicit confirmation applies the proposed calorie/macro adjustments to active phase
    apply_resp = await client.post(
        f"/api/v1/nutrition/checkins/{c2['id']}/apply-adjustment",
        headers=_auth_header(token_a),
    )
    assert apply_resp.status_code == 200
    applied = apply_resp.json()
    assert applied["checkin"]["adjustment_status"] == "accepted"
    assert applied["phase"]["target_calories"] == rec["proposed_target_calories"]
    assert applied["phase"]["carbs_g"] == rec["proposed_carbs_g"]

    # Re-applying an already accepted proposal returns 409
    reapply = await client.post(
        f"/api/v1/nutrition/checkins/{c2['id']}/apply-adjustment",
        headers=_auth_header(token_a),
    )
    assert reapply.status_code == 409

    # Check-in 3: dismiss proposal leaves active phase unchanged
    c3_resp = await client.post(
        "/api/v1/nutrition/checkins",
        headers=_auth_header(token_a),
        json={
            "checkin_date": "2026-10-22",
            "idempotency_key": "checkin-a-2026-10-22",
            "average_weight_kg": 80.7,  # dropped 1.25 kg in 7 days -> losing too fast
            "adherence_score": 9,
            "sleep_quality": 7,
            "energy_level": 6,
            "hunger_level": 8,
            "recovery_score": 6,
            "perceived_fatigue": 5,
            "performance_notes": "Hambre alta al final del día.",
        },
    )
    assert c3_resp.status_code == 201
    c3 = c3_resp.json()
    assert c3["weight_trend"]["trend_status"] == "losing_too_fast"
    assert c3["coach_recommendations"]["calorie_delta_kcal"] > 0
    assert c3["adjustment_status"] == "proposed"

    dismiss_resp = await client.post(
        f"/api/v1/nutrition/checkins/{c3['id']}/dismiss-adjustment",
        headers=_auth_header(token_a),
    )
    assert dismiss_resp.status_code == 200
    assert dismiss_resp.json()["adjustment_status"] == "dismissed"

    # Active phase still has the confirmed calories from c2 (not c3)
    phases_after = (
        await client.get("/api/v1/nutrition/phases", headers=_auth_header(token_a))
    ).json()
    assert phases_after[0]["target_calories"] == rec["proposed_target_calories"]

    # Chronological history descending (c3, c2, c1)
    history_resp = await client.get("/api/v1/nutrition/checkins", headers=_auth_header(token_a))
    assert history_resp.status_code == 200
    history = history_resp.json()
    assert [item["id"] for item in history] == [c3["id"], c2["id"], c1["id"]]


@pytest.mark.asyncio
async def test_coach_chat_receives_active_nutrition_phase_and_recent_checkins_context(
    client: AsyncClient,
    seed_accounts: dict,
    fake_ai,
) -> None:
    """CoachContextAssembler receives active Fase Nutricional, recent Check-ins,
    LivingProfile allergies/preferences, and KB EvidenceCards for meal/timing/supplement queries.
    """
    _, token_a = seed_accounts["athlete_a"]
    _, token_dual = seed_accounts["dual"]

    # 1. Configure Living Profile with allergies & preferences
    prof_resp = await client.put(
        "/api/v1/profile",
        headers=_auth_header(token_a),
        json={
            "base_weight_kg": 78.0,
            "primary_goal": "hypertrophy",
            "allergies": ["frutos secos"],
            "food_preferences": ["sin lácteos", "arroz y pollo"],
        },
    )
    assert prof_resp.status_code == 200

    # 2. Activate a Bulk Fase Nutricional
    phase_resp = await client.post(
        "/api/v1/nutrition/phases",
        headers=_auth_header(token_a),
        json={
            "phase_type": "bulk",
            "start_date": "2026-10-01",
            "target_calories": 3250,
            "protein_g": 175,
            "fat_g": 85,
            "carbs_g": 446,
            "target_weekly_weight_change_kg": 0.25,
            "notes": "Superávit ligero para hipertrofia",
        },
    )
    assert phase_resp.status_code == 201

    # 3. Record 2 weekly Check-ins so there is an active trend
    c1 = await client.post(
        "/api/v1/nutrition/checkins",
        headers=_auth_header(token_a),
        json={
            "checkin_date": "2026-10-08",
            "idempotency_key": "ctx-c1",
            "average_weight_kg": 78.0,
            "adherence_score": 9,
            "sleep_quality": 8,
            "energy_level": 8,
            "perceived_fatigue": 4,
        },
    )
    assert c1.status_code == 201
    c2 = await client.post(
        "/api/v1/nutrition/checkins",
        headers=_auth_header(token_a),
        json={
            "checkin_date": "2026-10-15",
            "idempotency_key": "ctx-c2",
            "average_weight_kg": 78.3,
            "adherence_score": 9,
            "sleep_quality": 7,
            "energy_level": 8,
            "perceived_fatigue": 5,
            "performance_notes": "Subiendo marcas en press inclinado.",
        },
    )
    assert c2.status_code == 201

    # 4. Seed an approved EvidenceCard about protein/creatine supplementation
    cand_resp = await client.post(
        "/api/v1/curator/candidates/from-doi",
        headers=_auth_header(token_dual),
        json={"doi": "10.1186/s12970-024-00611-2"},
    )
    if cand_resp.status_code == 201:
        await client.post(
            f"/api/v1/curator/candidates/{cand_resp.json()['id']}/approve",
            headers=_auth_header(token_dual),
            json={
                "evidence_level": "position_stand",
                "curated_text_es": (
                    "Distribuir 0.4 g/kg de proteína por comida y 3-5 g diarios de creatina "
                    "monohidrato optimiza la síntesis proteica y el rendimiento peri-entreno."
                ),
                "tags": ["proteina", "creatina", "peri-entreno"],
            },
        )

    # 5. Ask the Coach about meal structure, peri-workout timing, and supplementation
    conv_resp = await client.post(
        "/api/v1/coach/conversations",
        headers=_auth_header(token_a),
        json={"title": "Estructura de comidas y creatina"},
    )
    assert conv_resp.status_code == 201
    conv_id = conv_resp.json()["id"]

    calls_before = len(fake_ai.generate_calls)
    msg_resp = await client.post(
        f"/api/v1/coach/conversations/{conv_id}/messages",
        headers=_auth_header(token_a),
        json={
            "content": (
                "¿Cómo reparto mi proteína peri-entreno, estructura de comidas y creatina "
                "para mi volumen actual?"
            )
        },
    )
    assert msg_resp.status_code == 200
    assert len(fake_ai.generate_calls) > calls_before

    system_prompt = fake_ai.generate_calls[-1]["system_prompt"]
    assert "FASE NUTRICIONAL ACTIVA" in system_prompt
    assert "3250 kcal" in system_prompt
    assert "175 g" in system_prompt
    assert "78.3 kg" in system_prompt
    assert "frutos secos" in system_prompt.lower()
    assert "sin lácteos" in system_prompt.lower()


@pytest.mark.asyncio
async def test_apply_checkin_adjustment_rejects_mismatched_active_phase(
    client: AsyncClient,
    seed_accounts: dict,
) -> None:
    _, token_a = seed_accounts["athlete_a"]

    # Phase 1 active
    p1 = await client.post(
        "/api/v1/nutrition/phases",
        headers=_auth_header(token_a),
        json={
            "phase_type": "cut",
            "start_date": "2026-10-01",
            "target_calories": 2400,
            "protein_g": 180,
            "fat_g": 65,
            "carbs_g": 274,
            "target_weekly_weight_change_kg": -0.5,
        },
    )
    assert p1.status_code == 201

    # Check-in 1 & Check-in 2 under Phase 1 -> Check-in 2 gets a 'proposed' adjustment
    c1 = await client.post(
        "/api/v1/nutrition/checkins",
        headers=_auth_header(token_a),
        json={
            "checkin_date": "2026-10-08",
            "idempotency_key": "mismatch-c1",
            "average_weight_kg": 80.0,
            "adherence_score": 9,
            "sleep_quality": 8,
            "energy_level": 7,
            "hunger_level": 5,
            "recovery_score": 8,
            "perceived_fatigue": 4,
        },
    )
    assert c1.status_code == 201

    c2 = await client.post(
        "/api/v1/nutrition/checkins",
        headers=_auth_header(token_a),
        json={
            "checkin_date": "2026-10-15",
            "idempotency_key": "mismatch-c2",
            "average_weight_kg": 79.95,
            "adherence_score": 9,
            "sleep_quality": 4,
            "energy_level": 4,
            "hunger_level": 7,
            "recovery_score": 3,
            "perceived_fatigue": 9,
        },
    )
    assert c2.status_code == 201
    c2_data = c2.json()
    assert c2_data["adjustment_status"] == "proposed"

    # Activate Phase 2
    p2 = await client.post(
        "/api/v1/nutrition/phases",
        headers=_auth_header(token_a),
        json={
            "phase_type": "bulk",
            "start_date": "2026-10-16",
            "target_calories": 3100,
            "protein_g": 180,
            "fat_g": 80,
            "carbs_g": 415,
            "target_weekly_weight_change_kg": 0.25,
        },
    )
    assert p2.status_code == 201

    # Applying Phase 1's Check-in adjustment while Phase 2 is active -> 409 Conflict
    apply_resp = await client.post(
        f"/api/v1/nutrition/checkins/{c2_data['id']}/apply-adjustment",
        headers=_auth_header(token_a),
    )
    assert apply_resp.status_code == 409



