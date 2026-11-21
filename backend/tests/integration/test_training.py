"""Integration tests for Training (#7): Mesocycles, Sessions, Volume, Deload & Coach context.

Tests run against real PostgreSQL + pgvector + Alembic migrations using the 3 backend testing seams.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from httpx import AsyncClient

from tests.fakes.ai_provider import FakeAIProvider


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_unauthenticated_training_endpoints_rejected(client: AsyncClient) -> None:
    for path in (
        "/api/v1/training/mesocycles",
        "/api/v1/training/today",
        "/api/v1/training/sessions",
        "/api/v1/training/volume-summary",
    ):
        resp = await client.get(path)
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_mesocycle_coach_draft_manual_edit_and_single_active_invariant(
    client: AsyncClient,
    seed_accounts: dict,
    fake_ai: FakeAIProvider,
) -> None:
    _, token_a = seed_accounts["athlete_a"]
    _, token_b = seed_accounts["athlete_b"]

    # 1. Configure Athlete A Living Profile + an active shoulder injury
    prof_resp = await client.put(
        "/api/v1/profile",
        headers=_auth_header(token_a),
        json={
            "age": 29,
            "sex": "male",
            "height_cm": 178,
            "base_weight_kg": 80,
            "experience_level": "intermediate",
            "primary_goal": "hypertrophy",
            "training_days_per_week": 4,
            "session_duration_min": 60,
            "equipment": ["mancuernas", "poleas", "barra"],
        },
    )
    assert prof_resp.status_code == 200

    inj_resp = await client.post(
        "/api/v1/profile/injuries",
        headers=_auth_header(token_a),
        json={
            "body_part": "hombro derecho",
            "description": "Molestia en press militar tras nuca",
            "severity": "moderate",
        },
    )
    assert inj_resp.status_code == 201

    # 2. Generate a draft Mesociclo with Coach
    draft_resp = await client.post(
        "/api/v1/training/mesocycles/draft-with-coach",
        headers=_auth_header(token_a),
        json={"focus_notes": "Priorizar hipertrofia de torso superior"},
    )
    assert draft_resp.status_code == 201
    draft_payload = draft_resp.json()
    meso1 = draft_payload["mesocycle"]
    assert meso1["status"] == "draft"
    assert meso1["duration_weeks"] >= 4
    assert len(meso1["planned_sessions"]) == 4  # matches training_days_per_week
    assert len(meso1["planned_sessions"][0]["exercises"]) >= 2

    # Verify Coach prompt received Living Profile equipment & active injury
    assert len(fake_ai.generate_calls) >= 1
    last_prompt = (
        fake_ai.generate_calls[-1]["system_prompt"]
        + "\n"
        + fake_ai.generate_calls[-1]["user_prompt"]
    )
    assert "hombro derecho" in last_prompt.lower()
    assert "mancuernas" in last_prompt.lower()

    meso1_id = meso1["id"]

    # 3. Manually edit the draft Mesociclo (exercises, sets, reps, RIR)
    edit_resp = await client.patch(
        f"/api/v1/training/mesocycles/{meso1_id}",
        headers=_auth_header(token_a),
        json={
            "name": "Mesociclo Hipertrofia Torso-Pierna",
            "duration_weeks": 5,
            "planned_sessions": [
                {
                    "day_order": 1,
                    "name": "Torso A",
                    "exercises": [
                        {
                            "exercise_name": "Press inclinado mancuernas",
                            "primary_muscle_group": "pecho",
                            "secondary_muscle_groups": ["hombros", "triceps"],
                            "target_sets": 4,
                            "rep_range_min": 8,
                            "rep_range_max": 10,
                            "target_rir": 1.0,
                        },
                        {
                            "exercise_name": "Remo con barra",
                            "primary_muscle_group": "espalda",
                            "secondary_muscle_groups": ["biceps"],
                            "target_sets": 4,
                            "rep_range_min": 8,
                            "rep_range_max": 12,
                            "target_rir": 2.0,
                        },
                    ],
                },
                {
                    "day_order": 2,
                    "name": "Pierna A",
                    "exercises": [
                        {
                            "exercise_name": "Prensa inclinada",
                            "primary_muscle_group": "cuadriceps",
                            "secondary_muscle_groups": ["gluteos"],
                            "target_sets": 4,
                            "rep_range_min": 10,
                            "rep_range_max": 12,
                            "target_rir": 2.0,
                        }
                    ],
                },
            ],
        },
    )
    assert edit_resp.status_code == 200
    edited = edit_resp.json()
    assert edited["name"] == "Mesociclo Hipertrofia Torso-Pierna"
    assert edited["duration_weeks"] == 5
    assert len(edited["planned_sessions"]) == 2
    assert edited["planned_sessions"][0]["exercises"][0]["target_sets"] == 4

    # 4. Activate meso1 cleanly (no prior active mesocycle)
    act1_resp = await client.post(
        f"/api/v1/training/mesocycles/{meso1_id}/activate",
        headers=_auth_header(token_a),
        json={},
    )
    assert act1_resp.status_code == 200
    assert act1_resp.json()["mesocycle"]["status"] == "active"
    assert act1_resp.json()["mesocycle"]["activated_at"] is not None

    # 5. Create a second draft Mesociclo and try activating WITHOUT confirmation -> 409 Conflict
    create2_resp = await client.post(
        "/api/v1/training/mesocycles",
        headers=_auth_header(token_a),
        json={
            "name": "Mesociclo Especialización Espalda",
            "goal": "Hipertrofia espalda",
            "duration_weeks": 6,
            "planned_sessions": [
                {
                    "day_order": 1,
                    "name": "Espalda A",
                    "exercises": [
                        {
                            "exercise_name": "Jalón al pecho",
                            "primary_muscle_group": "espalda",
                            "secondary_muscle_groups": ["biceps"],
                            "target_sets": 4,
                            "rep_range_min": 8,
                            "rep_range_max": 12,
                            "target_rir": 1.0,
                        }
                    ],
                }
            ],
        },
    )
    assert create2_resp.status_code == 201
    meso2_id = create2_resp.json()["id"]

    conflict_resp = await client.post(
        f"/api/v1/training/mesocycles/{meso2_id}/activate",
        headers=_auth_header(token_a),
        json={},
    )
    assert conflict_resp.status_code == 409
    conflict_detail = conflict_resp.json()["detail"]
    assert conflict_detail["active_mesocycle_id"] == meso1_id
    assert conflict_detail["active_mesocycle_name"] == "Mesociclo Hipertrofia Torso-Pierna"

    # 6. Activate meso2 WITH explicit confirmation (completed) -> transitions meso1 cleanly
    act2_resp = await client.post(
        f"/api/v1/training/mesocycles/{meso2_id}/activate",
        headers=_auth_header(token_a),
        json={"confirm_transition_status": "completed"},
    )
    assert act2_resp.status_code == 200
    act2_data = act2_resp.json()
    assert act2_data["mesocycle"]["id"] == meso2_id
    assert act2_data["mesocycle"]["status"] == "active"
    assert act2_data["previous_mesocycle"]["id"] == meso1_id
    assert act2_data["previous_mesocycle"]["status"] == "completed"

    # Verify Athlete A sees both in history with only one active
    list_a = await client.get("/api/v1/training/mesocycles", headers=_auth_header(token_a))
    assert list_a.status_code == 200
    mesos_a = list_a.json()
    assert len(mesos_a) == 2
    assert sum(1 for m in mesos_a if m["status"] in ("active", "deload")) == 1

    # 7. Multi-Athlete isolation: Athlete B cannot see, edit, or activate Athlete A's mesocycles
    list_b = await client.get("/api/v1/training/mesocycles", headers=_auth_header(token_b))
    assert list_b.status_code == 200
    assert list_b.json() == []

    patch_b = await client.patch(
        f"/api/v1/training/mesocycles/{meso2_id}",
        headers=_auth_header(token_b),
        json={"name": "Hack"},
    )
    assert patch_b.status_code == 404

    act_b = await client.post(
        f"/api/v1/training/mesocycles/{meso2_id}/activate",
        headers=_auth_header(token_b),
        json={},
    )
    assert act_b.status_code == 404


@pytest.mark.asyncio
async def test_today_session_previous_marks_and_training_session_crud_isolation(
    client: AsyncClient,
    seed_accounts: dict,
) -> None:
    _, token_a = seed_accounts["athlete_a"]
    _, token_b = seed_accounts["athlete_b"]

    # Create and activate a 2-day Mesociclo for Athlete A
    create_resp = await client.post(
        "/api/v1/training/mesocycles",
        headers=_auth_header(token_a),
        json={
            "name": "Mesociclo Torso-Pierna",
            "goal": "Hipertrofia",
            "duration_weeks": 5,
            "planned_sessions": [
                {
                    "day_order": 1,
                    "name": "Torso A",
                    "exercises": [
                        {
                            "exercise_name": "Press inclinado mancuernas",
                            "primary_muscle_group": "pecho",
                            "secondary_muscle_groups": ["hombros", "triceps"],
                            "target_sets": 3,
                            "rep_range_min": 8,
                            "rep_range_max": 10,
                            "target_rir": 1.0,
                        },
                        {
                            "exercise_name": "Remo en polea baja",
                            "primary_muscle_group": "espalda",
                            "secondary_muscle_groups": ["biceps"],
                            "target_sets": 3,
                            "rep_range_min": 8,
                            "rep_range_max": 12,
                            "target_rir": 2.0,
                        },
                    ],
                },
                {
                    "day_order": 2,
                    "name": "Pierna A",
                    "exercises": [
                        {
                            "exercise_name": "Prensa inclinada",
                            "primary_muscle_group": "cuadriceps",
                            "secondary_muscle_groups": ["gluteos"],
                            "target_sets": 4,
                            "rep_range_min": 10,
                            "rep_range_max": 12,
                            "target_rir": 2.0,
                        }
                    ],
                },
            ],
        },
    )
    assert create_resp.status_code == 201
    meso = create_resp.json()
    meso_id = meso["id"]
    torso_id = meso["planned_sessions"][0]["id"]

    act_resp = await client.post(
        f"/api/v1/training/mesocycles/{meso_id}/activate",
        headers=_auth_header(token_a),
        json={},
    )
    assert act_resp.status_code == 200

    # Today before any sessions -> Torso A with no previous marks
    today1 = await client.get("/api/v1/training/today", headers=_auth_header(token_a))
    assert today1.status_code == 200
    today1_data = today1.json()
    assert today1_data["planned_session"]["name"] == "Torso A"
    assert today1_data["exercises"][0]["previous_mark"] is None

    # Athlete B logs a session for the same exercise -> MUST NOT leak into Athlete A's marks
    b_log = await client.post(
        "/api/v1/training/sessions",
        headers=_auth_header(token_b),
        json={
            "session_date": date.today().isoformat(),
            "name": "Torso B",
            "sets": [
                {
                    "exercise_name": "Press inclinado mancuernas",
                    "muscle_group": "pecho",
                    "set_order": 1,
                    "reps": 10,
                    "load": 99.0,
                    "unit": "kg",
                    "rir": 0.0,
                }
            ],
        },
    )
    assert b_log.status_code == 201

    today_still_clean = await client.get("/api/v1/training/today", headers=_auth_header(token_a))
    assert today_still_clean.json()["exercises"][0]["previous_mark"] is None

    # Athlete A logs Torso A
    log_date = (date.today() - timedelta(days=3)).isoformat()
    log_resp = await client.post(
        "/api/v1/training/sessions",
        headers=_auth_header(token_a),
        json={
            "session_date": log_date,
            "name": "Torso A",
            "mesocycle_id": meso_id,
            "planned_session_id": torso_id,
            "fatigue_notes": "Buenas sensaciones, hombro sin dolor",
            "sets": [
                {
                    "exercise_name": "Press inclinado mancuernas",
                    "muscle_group": "pecho",
                    "secondary_muscle_groups": ["hombros", "triceps"],
                    "set_order": 1,
                    "reps": 9,
                    "load": 32.0,
                    "unit": "kg",
                    "rir": 1.5,
                },
                {
                    "exercise_name": "Press inclinado mancuernas",
                    "muscle_group": "pecho",
                    "secondary_muscle_groups": ["hombros", "triceps"],
                    "set_order": 2,
                    "reps": 8,
                    "load": 32.0,
                    "unit": "kg",
                    "rir": 1.0,
                },
            ],
        },
    )
    assert log_resp.status_code == 201
    session_id = log_resp.json()["id"]

    # Query today specifically for Torso A -> shows previous marks (32 kg x 9 @ RIR 1.5)
    today_torso = await client.get(
        f"/api/v1/training/today?planned_session_id={torso_id}",
        headers=_auth_header(token_a),
    )
    assert today_torso.status_code == 200
    prev_mark = today_torso.json()["exercises"][0]["previous_mark"]
    assert prev_mark is not None
    assert prev_mark["last_session_date"] == log_date
    assert prev_mark["best_load"] == 32.0
    assert prev_mark["best_reps"] == 9
    assert len(prev_mark["last_sets"]) == 2

    # Edit saved Training Session (correct load from 32 kg to 34 kg)
    edit_resp = await client.put(
        f"/api/v1/training/sessions/{session_id}",
        headers=_auth_header(token_a),
        json={
            "session_date": log_date,
            "name": "Torso A (corregido)",
            "fatigue_notes": "Carga corregida",
            "sets": [
                {
                    "exercise_name": "Press inclinado mancuernas",
                    "muscle_group": "pecho",
                    "secondary_muscle_groups": ["hombros", "triceps"],
                    "set_order": 1,
                    "reps": 9,
                    "load": 34.0,
                    "unit": "kg",
                    "rir": 1.0,
                }
            ],
        },
    )
    assert edit_resp.status_code == 200
    assert edit_resp.json()["name"] == "Torso A (corregido)"
    assert edit_resp.json()["sets"][0]["load"] == 34.0

    # Athlete B cannot edit or delete Athlete A's session
    b_edit = await client.put(
        f"/api/v1/training/sessions/{session_id}",
        headers=_auth_header(token_b),
        json={
            "session_date": log_date,
            "name": "Hack",
            "sets": [
                {
                    "exercise_name": "Press",
                    "muscle_group": "pecho",
                    "set_order": 1,
                    "reps": 5,
                    "load": 10.0,
                }
            ],
        },
    )
    assert b_edit.status_code == 404

    b_del = await client.delete(
        f"/api/v1/training/sessions/{session_id}",
        headers=_auth_header(token_b),
    )
    assert b_del.status_code == 404

    # Athlete A deletes the session -> 204 and removed from history
    del_resp = await client.delete(
        f"/api/v1/training/sessions/{session_id}",
        headers=_auth_header(token_a),
    )
    assert del_resp.status_code == 204

    list_after = await client.get("/api/v1/training/sessions", headers=_auth_header(token_a))
    assert list_after.status_code == 200
    assert list_after.json() == []


@pytest.mark.asyncio
async def test_weekly_effective_volume_and_deload_recommendation(
    client: AsyncClient,
    seed_accounts: dict,
) -> None:
    _, token_a = seed_accounts["athlete_a"]

    # Pick current ISO week Monday so volume summary hits this exact week
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    prev_week_day = monday - timedelta(days=5)

    # Earlier baseline session (higher performance: 100 kg x 8 = 126.67 e1RM)
    r1 = await client.post(
        "/api/v1/training/sessions",
        headers=_auth_header(token_a),
        json={
            "session_date": prev_week_day.isoformat(),
            "name": "Torso Semana 1",
            "fatigue_notes": "Muy buena energía",
            "sets": [
                {
                    "exercise_name": "Press banca",
                    "muscle_group": "pecho",
                    "secondary_muscle_groups": ["triceps"],
                    "set_order": 1,
                    "reps": 8,
                    "load": 100.0,
                    "unit": "kg",
                    "rir": 2.0,
                }
            ],
        },
    )
    assert r1.status_code == 201

    # This week session 1: 3 effective primary sets pecho (secondary triceps = 1.5 effective)
    # plus 1 warm-up set (RIR 6 -> 0 effective sets) + fatigue note & lower performance (90 kg x 7)
    r2 = await client.post(
        "/api/v1/training/sessions",
        headers=_auth_header(token_a),
        json={
            "session_date": monday.isoformat(),
            "name": "Torso Semana 2 - Día 1",
            "fatigue_notes": "Mucha fatiga acumulada y pesadez general",
            "sets": [
                {
                    "exercise_name": "Press banca",
                    "muscle_group": "pecho",
                    "secondary_muscle_groups": ["triceps"],
                    "set_order": 1,
                    "reps": 10,
                    "load": 60.0,
                    "unit": "kg",
                    "rir": 6.0,  # warm-up set, NOT effective
                },
                {
                    "exercise_name": "Press banca",
                    "muscle_group": "pecho",
                    "secondary_muscle_groups": ["triceps"],
                    "set_order": 2,
                    "reps": 7,
                    "load": 90.0,
                    "unit": "kg",
                    "rir": 0.5,
                },
                {
                    "exercise_name": "Press banca",
                    "muscle_group": "pecho",
                    "secondary_muscle_groups": ["triceps"],
                    "set_order": 3,
                    "reps": 7,
                    "load": 90.0,
                    "unit": "kg",
                    "rir": 0.5,
                },
                {
                    "exercise_name": "Press banca",
                    "muscle_group": "pecho",
                    "secondary_muscle_groups": ["triceps"],
                    "set_order": 4,
                    "reps": 6,
                    "load": 90.0,
                    "unit": "kg",
                    "rir": 0.0,
                },
            ],
        },
    )
    assert r2.status_code == 201

    # This week session 2: also fatigued with RIR 0.5
    r3 = await client.post(
        "/api/v1/training/sessions",
        headers=_auth_header(token_a),
        json={
            "session_date": (monday + timedelta(days=1)).isoformat(),
            "name": "Torso Semana 2 - Día 2",
            "fatigue_notes": "Sigo agotado, sin fuerza",
            "sets": [
                {
                    "exercise_name": "Extensión tríceps polea",
                    "muscle_group": "triceps",
                    "set_order": 1,
                    "reps": 10,
                    "load": 25.0,
                    "unit": "kg",
                    "rir": 0.5,
                },
                {
                    "exercise_name": "Extensión tríceps polea",
                    "muscle_group": "triceps",
                    "set_order": 2,
                    "reps": 10,
                    "load": 25.0,
                    "unit": "kg",
                    "rir": 0.5,
                },
            ],
        },
    )
    assert r3.status_code == 201

    vol_resp = await client.get(
        f"/api/v1/training/volume-summary?week_start={monday.isoformat()}",
        headers=_auth_header(token_a),
    )
    assert vol_resp.status_code == 200
    summary = vol_resp.json()
    assert summary["total_sessions"] == 2

    by_mg = {item["muscle_group"]: item for item in summary["by_muscle_group"]}
    # Pecho: 3 effective direct sets (warm-up RIR 6 excluded!)
    assert by_mg["pecho"]["direct_sets"] == 3
    assert by_mg["pecho"]["effective_sets"] == 3.0
    # Triceps: 2 direct sets + 3 secondary sets (3 * 0.5 = 1.5) = 3.5 effective sets
    assert by_mg["triceps"]["direct_sets"] == 2
    assert by_mg["triceps"]["secondary_sets"] == 3
    assert by_mg["triceps"]["effective_sets"] == 3.5

    # Deload should be recommended due to Press banca regression + 2 high-fatigue sessions
    deload = summary["deload_assessment"]
    assert deload["recommended"] is True
    assert deload["status"] == "recommended"
    assert "Press banca" in deload["regressing_exercises"]
    assert deload["high_fatigue_sessions"] >= 2
    assert len(deload["reasons_es"]) >= 2


@pytest.mark.asyncio
async def test_coach_chat_incorporates_active_mesocycle_and_sessions_with_isolation(
    client: AsyncClient,
    seed_accounts: dict,
    fake_ai: FakeAIProvider,
) -> None:
    _, token_a = seed_accounts["athlete_a"]
    _, token_b = seed_accounts["athlete_b"]

    # Create & activate Mesociclo for Athlete A
    meso_resp = await client.post(
        "/api/v1/training/mesocycles",
        headers=_auth_header(token_a),
        json={
            "name": "Mesociclo Fuerza-Hipertrofia Invierno",
            "goal": "Hipertrofia",
            "duration_weeks": 5,
            "planned_sessions": [
                {
                    "day_order": 1,
                    "name": "Torso Pesado",
                    "exercises": [
                        {
                            "exercise_name": "Press inclinado",
                            "primary_muscle_group": "pecho",
                            "target_sets": 4,
                            "rep_range_min": 6,
                            "rep_range_max": 8,
                            "target_rir": 1.0,
                        }
                    ],
                }
            ],
        },
    )
    assert meso_resp.status_code == 201
    meso_id = meso_resp.json()["id"]

    act = await client.post(
        f"/api/v1/training/mesocycles/{meso_id}/activate",
        headers=_auth_header(token_a),
        json={},
    )
    assert act.status_code == 200

    # Log a recent session for Athlete A
    log_resp = await client.post(
        "/api/v1/training/sessions",
        headers=_auth_header(token_a),
        json={
            "session_date": date.today().isoformat(),
            "name": "Torso Pesado",
            "fatigue_notes": "Fatiga notable en hombros",
            "sets": [
                {
                    "exercise_name": "Press inclinado",
                    "muscle_group": "pecho",
                    "set_order": 1,
                    "reps": 8,
                    "load": 80.0,
                    "unit": "kg",
                    "rir": 1.0,
                }
            ],
        },
    )
    assert log_resp.status_code == 201

    # Athlete A asks Coach about deload
    conv_a = await client.post(
        "/api/v1/coach/conversations",
        headers=_auth_header(token_a),
        json={"title": "Revisión de fatiga"},
    )
    assert conv_a.status_code == 201
    conv_a_id = conv_a.json()["id"]

    fake_ai.generate_calls.clear()
    sse_a = await client.post(
        f"/api/v1/coach/conversations/{conv_a_id}/messages",
        headers=_auth_header(token_a),
        json={"content": "¿Debería hacer semana de descarga pronto?"},
    )
    assert sse_a.status_code == 200
    assert len(fake_ai.generate_calls) >= 1
    prompt_a = fake_ai.generate_calls[-1]["system_prompt"]
    assert "Mesociclo Fuerza-Hipertrofia Invierno" in prompt_a
    assert "Torso Pesado" in prompt_a
    assert "Fatiga notable en hombros" in prompt_a
    assert "Evaluación de descarga" in prompt_a

    # Athlete B asks Coach -> MUST NOT see Athlete A's Mesociclo or sessions
    conv_b = await client.post(
        "/api/v1/coach/conversations",
        headers=_auth_header(token_b),
        json={"title": "Consulta B"},
    )
    assert conv_b.status_code == 201
    conv_b_id = conv_b.json()["id"]

    fake_ai.generate_calls.clear()
    sse_b = await client.post(
        f"/api/v1/coach/conversations/{conv_b_id}/messages",
        headers=_auth_header(token_b),
        json={"content": "¿Cómo va mi entrenamiento?"},
    )
    assert sse_b.status_code == 200
    prompt_b = fake_ai.generate_calls[-1]["system_prompt"]
    assert "Mesociclo Fuerza-Hipertrofia Invierno" not in prompt_b
    assert "Fatiga notable en hombros" not in prompt_b
