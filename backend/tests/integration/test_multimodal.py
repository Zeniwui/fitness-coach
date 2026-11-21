"""Integration tests for Multimodal Gym Flows (#9) against real PostgreSQL + pgvector."""

from __future__ import annotations

import json

import pytest
from httpx import AsyncClient

from fitness_coach.application.ports.ai_provider import LLMResponse
from fitness_coach.domain.identity import Athlete
from tests.fakes.ai_provider import FakeAIProvider
from tests.fakes.identity_storage import FakeBinaryStorage

# Minimal valid PNG header + IHDR bytes for deterministic image upload tests
SAMPLE_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde"
)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_image_attachment_upload_validation_and_multi_athlete_isolation(
    client: AsyncClient,
    seed_accounts: dict[str, tuple[Athlete, str]],
    fake_binary_storage: FakeBinaryStorage,
) -> None:
    athlete_a, token_a = seed_accounts["athlete_a"]
    _, token_b = seed_accounts["athlete_b"]

    # 1. Reject unsupported MIME type
    bad_type = await client.post(
        "/api/v1/multimodal/attachments",
        headers=_auth(token_a),
        files={"file": ("notes.txt", b"hola mundo", "text/plain")},
    )
    assert bad_type.status_code == 422

    # 2. Reject invalid image signature (spoofed MIME type)
    spoofed = await client.post(
        "/api/v1/multimodal/attachments",
        headers=_auth(token_a),
        files={"file": ("fake.png", b"not-a-real-png", "image/png")},
    )
    assert spoofed.status_code == 422

    # 3. Valid PNG upload stores under strict <athlete_id>/ prefix
    uploaded = await client.post(
        "/api/v1/multimodal/attachments",
        headers=_auth(token_a),
        data={"category": "meal"},
        files={"file": ("comida.png", SAMPLE_PNG_BYTES, "image/png")},
    )
    assert uploaded.status_code == 201
    att = uploaded.json()
    att_id = att["id"]
    assert att["media_type"] == "image"
    assert att["mime_type"] == "image/png"
    assert att["category"] == "meal"
    assert att["size_bytes"] == len(SAMPLE_PNG_BYTES)

    # Verify strict athlete_id storage prefix in BinaryStoragePort
    stored_keys = list(fake_binary_storage.athlete_objects.keys())
    assert len(stored_keys) == 1
    assert stored_keys[0].startswith(f"{athlete_a.id}/")

    # 4. Athlete A can retrieve their own attachment bytes
    own_get = await client.get(
        f"/api/v1/multimodal/attachments/{att_id}",
        headers=_auth(token_a),
    )
    assert own_get.status_code == 200
    assert own_get.content == SAMPLE_PNG_BYTES
    assert own_get.headers["content-type"].startswith("image/png")

    # 5. Athlete B CANNOT access Athlete A's attachment (zero existence leakage -> 404)
    cross_get = await client.get(
        f"/api/v1/multimodal/attachments/{att_id}",
        headers=_auth(token_b),
    )
    assert cross_get.status_code == 404


@pytest.mark.asyncio
async def test_audio_transcription_returns_spanish_transcript_and_validates_mime(
    client: AsyncClient,
    seed_accounts: dict[str, tuple[Athlete, str]],
    fake_ai: FakeAIProvider,
) -> None:
    _, token_a = seed_accounts["athlete_a"]
    fake_ai.canned_transcript = (
        "Press inclinado mancuernas 3x8 con 32 kg a RIR 1, última serie costó mucho"
    )

    # Reject non-audio file
    bad = await client.post(
        "/api/v1/multimodal/transcribe",
        headers=_auth(token_a),
        files={"file": ("photo.png", SAMPLE_PNG_BYTES, "image/png")},
    )
    assert bad.status_code == 422

    # Valid audio returns Spanish transcript via AIProviderPort
    ok = await client.post(
        "/api/v1/multimodal/transcribe",
        headers=_auth(token_a),
        files={"file": ("nota.webm", b"fake-webm-audio-bytes", "audio/webm")},
    )
    assert ok.status_code == 200
    body = ok.json()
    assert body["transcript"] == fake_ai.canned_transcript
    assert body["language"] == "es"
    assert fake_ai.transcribe_calls == ["audio/webm"]


@pytest.mark.asyncio
async def test_parse_natural_training_session_produces_editable_draft_without_persisting(
    client: AsyncClient,
    seed_accounts: dict[str, tuple[Athlete, str]],
) -> None:
    _, token_a = seed_accounts["athlete_a"]

    # Complete Spanish natural-language session description
    resp = await client.post(
        "/api/v1/training/sessions/parse-natural",
        headers=_auth(token_a),
        json={
            "text": (
                "Press inclinado mancuernas 3x8 con 32 kg a RIR 1, "
                "última serie costó mucho"
            ),
            "origin": "chat_voice",
            "session_date": "2026-11-21",
        },
    )
    assert resp.status_code == 200
    draft = resp.json()
    assert draft["needs_confirmation"] is True
    assert draft["origin"] == "chat_voice"
    assert draft["session_date"] == "2026-11-21"
    assert len(draft["sets"]) == 3
    first = draft["sets"][0]
    assert "press inclinado" in first["exercise_name"].lower()
    assert first["muscle_group"] == "pecho"
    assert first["reps"] == 8
    assert first["load"] == 32.0
    assert first["unit"] == "kg"
    assert first["rir"] == 1.0
    assert draft["ambiguities"] == []
    assert draft["fatigue_notes"] is not None

    # MUST NOT persist to training_sessions until explicit confirmation
    sessions_before = await client.get("/api/v1/training/sessions", headers=_auth(token_a))
    assert sessions_before.status_code == 200
    assert sessions_before.json() == []

    # Explicit confirmation via POST /api/v1/training/sessions persists with chat_voice origin
    confirmed = await client.post(
        "/api/v1/training/sessions",
        headers=_auth(token_a),
        json={
            "session_date": draft["session_date"],
            "name": draft["name"],
            "origin": draft["origin"],
            "fatigue_notes": draft["fatigue_notes"],
            "sets": [
                {
                    "exercise_name": s["exercise_name"],
                    "muscle_group": s["muscle_group"],
                    "set_order": s["set_order"],
                    "reps": s["reps"],
                    "load": s["load"],
                    "unit": s["unit"],
                    "rir": s["rir"],
                    "rpe": s["rpe"],
                    "notes": s["notes"],
                }
                for s in draft["sets"]
            ],
        },
    )
    assert confirmed.status_code == 201
    assert confirmed.json()["origin"] == "chat_voice"

    sessions_after = await client.get("/api/v1/training/sessions", headers=_auth(token_a))
    assert len(sessions_after.json()) == 1


@pytest.mark.asyncio
async def test_parse_natural_training_session_flags_missing_load_and_rir_without_inventing(
    client: AsyncClient,
    seed_accounts: dict[str, tuple[Athlete, str]],
) -> None:
    _, token_a = seed_accounts["athlete_a"]

    # Omitted load and RIR must be flagged, NEVER silently invented
    resp = await client.post(
        "/api/v1/training/sessions/parse-natural",
        headers=_auth(token_a),
        json={
            "text": "Hice 4 series de press banca a 8 repes",
            "origin": "chat_text",
        },
    )
    assert resp.status_code == 200
    draft = resp.json()
    assert draft["needs_confirmation"] is True
    assert len(draft["sets"]) == 4
    for s in draft["sets"]:
        assert "press banca" in s["exercise_name"].lower()
        assert s["reps"] == 8
        assert s["load"] is None
        assert s["rir"] is None
        assert "load" in s["missing_fields"]
        assert "rir" in s["missing_fields"]

    amb_fields = {a["field"] for a in draft["ambiguities"]}
    assert "load" in amb_fields
    assert "rir" in amb_fields
    assert any("carga" in a["message_es"].lower() for a in draft["ambiguities"])

    # Still NOT persisted
    sessions = await client.get("/api/v1/training/sessions", headers=_auth(token_a))
    assert sessions.json() == []


def _parse_sse(raw: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    for block in raw.split("\n\n"):
        if not block.strip():
            continue
        event_name = "message"
        data_lines: list[str] = []
        for line in block.splitlines():
            if line.startswith("event:"):
                event_name = line[6:].strip()
            elif line.startswith("data:"):
                data_lines.append(line[5:].strip())
        if data_lines:
            events.append((event_name, json.loads("\n".join(data_lines))))
    return events


@pytest.mark.asyncio
async def test_coach_chat_multimodal_image_analysis_isolation_and_uncertainty(
    client: AsyncClient,
    seed_accounts: dict[str, tuple[Athlete, str]],
    fake_ai: FakeAIProvider,
) -> None:
    _, token_a = seed_accounts["athlete_a"]
    _, token_b = seed_accounts["athlete_b"]

    # Create active NutritionPhase for Athlete A so meal estimation has phase context
    phase_res = await client.post(
        "/api/v1/nutrition/phases",
        headers=_auth(token_a),
        json={
            "phase_type": "cut",
            "start_date": "2026-11-01",
            "target_calories": 2200,
            "protein_g": 180,
            "fat_g": 65,
            "carbs_g": 224,
            "target_weekly_weight_change_kg": -0.4,
        },
    )
    assert phase_res.status_code == 201

    # Athlete A uploads a meal image
    up = await client.post(
        "/api/v1/multimodal/attachments",
        headers=_auth(token_a),
        data={"category": "meal"},
        files={"file": ("pollo_arroz.png", SAMPLE_PNG_BYTES, "image/png")},
    )
    assert up.status_code == 201
    att_id = up.json()["id"]

    # Athlete B creates a conversation and tries to attach Athlete A's image -> 404
    conv_b = await client.post(
        "/api/v1/coach/conversations",
        headers=_auth(token_b),
        json={"title": "Chat B"},
    )
    cross_send = await client.post(
        f"/api/v1/coach/conversations/{conv_b.json()['id']}/messages",
        headers=_auth(token_b),
        json={"content": "Analiza esta foto", "attachment_ids": [att_id]},
    )
    assert cross_send.status_code == 404

    # Athlete A sends message with their meal image
    conv_a = await client.post(
        "/api/v1/coach/conversations",
        headers=_auth(token_a),
        json={"title": "Comida post-entreno"},
    )
    conv_a_id = conv_a.json()["id"]
    fake_ai.canned_responses.append(
        LLMResponse(
            text=(
                "Estimación aproximada: 520-650 kcal (40-50 g proteína, 55-70 g carbohidratos, "
                "10-18 g grasa). Al no estar pesada, hay margen de incertidumbre por aceites."
            )
        )
    )

    send_a = await client.post(
        f"/api/v1/coach/conversations/{conv_a_id}/messages",
        headers=_auth(token_a),
        json={
            "content": "¿Cuántas calorías y macros aproximados tiene este plato en definición?",
            "attachment_ids": [att_id],
        },
    )
    assert send_a.status_code == 200
    events = _parse_sse(send_a.text)
    assert any(ev == "done" for ev, _ in events)

    # Verify image was passed to AIProviderPort with honest range/uncertainty instructions
    assert len(fake_ai.generate_calls) >= 1
    last_call = fake_ai.generate_calls[-1]
    assert last_call["image_count"] == 1
    sys_prompt = last_call["system_prompt"].lower()
    assert "rango" in sys_prompt
    assert "incertidumbre" in sys_prompt
    assert "borrosa" in sys_prompt or "ilegible" in sys_prompt
    assert "2200" in sys_prompt  # active NutritionPhase context present

    # Verify attachment is linked and returned in conversation message history
    msgs = await client.get(
        f"/api/v1/coach/conversations/{conv_a_id}/messages",
        headers=_auth(token_a),
    )
    assert msgs.status_code == 200
    user_msg = msgs.json()[0]
    assert len(user_msg["attachments"]) == 1
    assert user_msg["attachments"][0]["id"] == att_id


@pytest.mark.asyncio
async def test_coach_chat_emits_session_draft_sse_event_without_persisting(
    client: AsyncClient,
    seed_accounts: dict[str, tuple[Athlete, str]],
) -> None:
    _, token_a = seed_accounts["athlete_a"]
    conv = await client.post(
        "/api/v1/coach/conversations",
        headers=_auth(token_a),
        json={"title": "Registro en gym"},
    )
    conv_id = conv.json()["id"]

    res = await client.post(
        f"/api/v1/coach/conversations/{conv_id}/messages",
        headers=_auth(token_a),
        json={"content": "Press banca 4x8 con 80 kg a RIR 2"},
    )
    assert res.status_code == 200
    events = _parse_sse(res.text)
    draft_events = [data for ev, data in events if ev == "session_draft"]
    assert len(draft_events) == 1
    draft = draft_events[0]["draft"]
    assert draft["needs_confirmation"] is True
    assert len(draft["sets"]) == 4
    assert draft["sets"][0]["load"] == 80.0

    # Confirm NOT persisted automatically
    sessions = await client.get("/api/v1/training/sessions", headers=_auth(token_a))
    assert sessions.json() == []


@pytest.mark.asyncio
async def test_coach_chat_label_supplement_and_scale_screenshot_categories(
    client: AsyncClient,
    seed_accounts: dict[str, tuple[Athlete, str]],
    fake_ai: FakeAIProvider,
) -> None:
    _, token_a = seed_accounts["athlete_a"]
    conv = await client.post(
        "/api/v1/coach/conversations",
        headers=_auth(token_a),
        json={"title": "Etiquetas y báscula"},
    )
    conv_id = conv.json()["id"]

    # (b) Supplement label upload
    up_label = await client.post(
        "/api/v1/multimodal/attachments",
        headers=_auth(token_a),
        data={"category": "label_supplement"},
        files={"file": ("etiqueta.png", SAMPLE_PNG_BYTES, "image/png")},
    )
    assert up_label.status_code == 201
    res_label = await client.post(
        f"/api/v1/coach/conversations/{conv_id}/messages",
        headers=_auth(token_a),
        json={
            "content": "Evalúa esta etiqueta de creatina y su dosis por toma",
            "attachment_ids": [up_label.json()["id"]],
        },
    )
    assert res_label.status_code == 200
    label_prompt = fake_ai.generate_calls[-1]["system_prompt"].lower()
    assert fake_ai.generate_calls[-1]["image_count"] == 1
    assert "etiqueta nutricional o suplemento" in label_prompt
    assert "base de conocimiento" in label_prompt

    # (c) Scale / tracker screenshot upload
    up_scale = await client.post(
        "/api/v1/multimodal/attachments",
        headers=_auth(token_a),
        data={"category": "scale_tracker"},
        files={"file": ("bascula.png", SAMPLE_PNG_BYTES, "image/png")},
    )
    assert up_scale.status_code == 201
    res_scale = await client.post(
        f"/api/v1/coach/conversations/{conv_id}/messages",
        headers=_auth(token_a),
        json={
            "content": "Extrae mi peso de esta captura de la báscula para mi check-in",
            "attachment_ids": [up_scale.json()["id"]],
        },
    )
    assert res_scale.status_code == 200
    scale_prompt = fake_ai.generate_calls[-1]["system_prompt"].lower()
    assert fake_ai.generate_calls[-1]["image_count"] == 1
    assert "báscula" in scale_prompt
    assert "check-in" in scale_prompt




