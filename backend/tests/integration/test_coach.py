"""Integration tests for Coach Chat (#6): multi-provider config, SSE streaming, citations,
live search quarantine, boundaries, Living Profile proposals, and multi-Athlete isolation.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fitness_coach.application.ports.ai_provider import LLMResponse, ModelTier
from fitness_coach.application.ports.scientific_sources import (
    LiveSearchHit,
    ScientificArticleRecord,
)
from fitness_coach.domain.coach import LIVE_SEARCH_QUARANTINE_LABEL
from fitness_coach.infrastructure.ai.provider import build_ai_provider
from fitness_coach.infrastructure.config import Settings
from fitness_coach.infrastructure.db.models.coach import MessageModel
from tests.fakes.ai_provider import FakeAIProvider
from tests.fakes.scientific_sources import FakeScientificSources


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _parse_sse(raw_body: str) -> list[tuple[str, dict[str, Any]]]:
    """Parse standard SSE response text into a list of (event_name, json_payload)."""
    events: list[tuple[str, dict[str, Any]]] = []
    current_event = "message"
    data_lines: list[str] = []
    for line in raw_body.splitlines():
        if line == "":
            if data_lines:
                payload = json.loads("\n".join(data_lines))
                events.append((current_event, payload))
                current_event = "message"
                data_lines = []
        elif line.startswith("event:"):
            current_event = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            data_lines.append(line.split(":", 1)[1].strip())
    if data_lines:
        events.append((current_event, json.loads("\n".join(data_lines))))
    return events


class TestMultiProviderConfiguration:
    """AC2: Swap LLM provider & fast/reasoning tiers via Settings without touching domain logic."""

    @pytest.mark.parametrize(
        ("provider_name", "fast_model", "reasoning_model"),
        [
            ("google_ai_studio", "gemini-2.0-flash", "gemini-2.5-pro"),
            ("openai", "gpt-4o-mini", "gpt-4o"),
            ("anthropic", "claude-3-5-haiku-latest", "claude-3-7-sonnet-latest"),
            ("openai_compatible", "llama-3.3-70b", "deepseek-r1"),
        ],
    )
    def test_provider_and_tiers_configurable_without_touching_embeddings(
        self,
        provider_name: str,
        fast_model: str,
        reasoning_model: str,
    ) -> None:
        settings = Settings(
            environment="test",
            _env_file=None,
            ai_provider=provider_name,
            ai_fast_model=fast_model,
            ai_reasoning_model=reasoning_model,
            embedding_model="text-embedding-004",
        )
        provider = build_ai_provider(settings)

        assert provider.provider_name == provider_name
        assert provider.resolve_model(ModelTier.FAST) == fast_model
        assert provider.resolve_model(ModelTier.REASONING) == reasoning_model
        # Embeddings remain decoupled from the active LLM provider
        assert provider.embedding_model == "text-embedding-004"


class TestConversationsSSEAndIsolation:
    """AC1: Multiple Spanish threads, SSE streaming, and strict multi-Athlete isolation."""

    async def test_athlete_creates_multiple_threads_streams_sse_and_isolates_from_other_athletes(
        self,
        client: AsyncClient,
        seed_accounts,
        fake_ai: FakeAIProvider,
    ) -> None:
        _, tok_a = seed_accounts["athlete_a"]
        _, tok_b = seed_accounts["athlete_b"]

        # Unauthenticated access rejected
        unauth = await client.get("/api/v1/coach/conversations")
        assert unauth.status_code == 401

        # Athlete A creates two separate conversation threads
        c1 = await client.post(
            "/api/v1/coach/conversations",
            headers=_auth_headers(tok_a),
            json={"title": "Plan de hipertrofia"},
        )
        assert c1.status_code == 201
        conv1_id = c1.json()["id"]

        c2 = await client.post(
            "/api/v1/coach/conversations",
            headers=_auth_headers(tok_a),
            json={"title": "Dudas de nutrición"},
        )
        assert c2.status_code == 201
        conv2_id = c2.json()["id"]

        list_a = await client.get("/api/v1/coach/conversations", headers=_auth_headers(tok_a))
        assert list_a.status_code == 200
        assert {item["id"] for item in list_a.json()} == {conv1_id, conv2_id}

        # Athlete A sends a message and receives SSE stream
        fake_ai.canned_responses.append(
            LLMResponse(text="Para hipertrofia prioriza progresión de cargas y RIR 1-2.")
        )
        stream_resp = await client.post(
            f"/api/v1/coach/conversations/{conv1_id}/messages",
            headers=_auth_headers(tok_a),
            json={"content": "¿Cómo organizo mi volumen semanal para espalda?"},
        )
        assert stream_resp.status_code == 200
        assert stream_resp.headers["content-type"].startswith("text/event-stream")

        events = _parse_sse(stream_resp.text)
        event_names = [name for name, _ in events]
        assert "token" in event_names
        assert "citations" in event_names
        assert event_names[-1] == "done"

        streamed_text = "".join(payload["delta"] for name, payload in events if name == "token")
        assert "hipertrofia" in streamed_text.lower()

        # Messages are persisted and reloadable on revisit
        msgs_a = await client.get(
            f"/api/v1/coach/conversations/{conv1_id}/messages",
            headers=_auth_headers(tok_a),
        )
        assert msgs_a.status_code == 200
        items = msgs_a.json()
        assert len(items) == 2
        assert items[0]["role"] == "user"
        assert items[1]["role"] == "assistant"
        assert "hipertrofia" in items[1]["content"].lower()

        # Strict multi-Athlete isolation: Athlete B sees empty list and 404 on A's thread
        list_b = await client.get("/api/v1/coach/conversations", headers=_auth_headers(tok_b))
        assert list_b.status_code == 200
        assert list_b.json() == []

        cross_read = await client.get(
            f"/api/v1/coach/conversations/{conv1_id}/messages",
            headers=_auth_headers(tok_b),
        )
        assert cross_read.status_code == 404

        cross_post = await client.post(
            f"/api/v1/coach/conversations/{conv1_id}/messages",
            headers=_auth_headers(tok_b),
            json={"content": "Intento leer o escribir en otro hilo"},
        )
        assert cross_post.status_code == 404


class TestContextAssemblyCitationsAndResolvedInjury:
    """AC3 & AC6: Living Profile + active injuries + KB citations / cold-start disclosure."""

    async def test_cold_start_declares_general_knowledge_then_cites_approved_evidence_card(
        self,
        client: AsyncClient,
        seed_accounts,
        fake_ai: FakeAIProvider,
        fake_scientific_sources: FakeScientificSources,
    ) -> None:
        _, tok_a = seed_accounts["athlete_a"]
        _, tok_dual = seed_accounts["dual"]

        # Create conversation
        conv_resp = await client.post(
            "/api/v1/coach/conversations",
            headers=_auth_headers(tok_a),
            json={"title": "Creatina e hipertrofia"},
        )
        conv_id = conv_resp.json()["id"]

        # 1. Cold start: KB is empty -> Coach explicitly declares general knowledge
        fake_ai.canned_responses.append(
            LLMResponse(text="La creatina monohidrato suele usarse a 3-5 g diarios.")
        )
        cold_resp = await client.post(
            f"/api/v1/coach/conversations/{conv_id}/messages",
            headers=_auth_headers(tok_a),
            json={"content": "¿Qué dosis de creatina recomiendas para hipertrofia?"},
        )
        assert cold_resp.status_code == 200
        cold_events = _parse_sse(cold_resp.text)
        citations_ev = next(p for name, p in cold_events if name == "citations")
        done_ev = next(p for name, p in cold_events if name == "done")
        assert citations_ev["citations"] == []
        assert citations_ev["used_general_knowledge"] is True
        assert "conocimiento general" in done_ev["message"]["content"].lower()

        # 2. Curator approves an EvidenceCard about creatine
        fake_scientific_sources.articles.append(
            ScientificArticleRecord(
                title="ISSN Position Stand: Creatine Supplementation and Hypertrophy",
                source_name="PubMed",
                source_url="https://pubmed.ncbi.nlm.nih.gov/34567890/",
                doi="10.1186/s12970-021-00412-w",
                pmid="34567890",
                authors=["Kreider RB", "Antonio J"],
                journal="JISSN",
                published_year=2021,
                abstract="Creatine monohydrate 3-5 g/day improves lean mass and strength.",
                full_text="Creatine monohydrate 3-5 g/day improves lean mass and strength.",
                is_open_access=True,
            )
        )
        cand_resp = await client.post(
            "/api/v1/curator/candidates/from-doi",
            headers=_auth_headers(tok_dual),
            json={"doi_or_url": "10.1186/s12970-021-00412-w"},
        )
        assert cand_resp.status_code == 201
        cand_id = cand_resp.json()["id"]

        approve_resp = await client.post(
            f"/api/v1/curator/candidates/{cand_id}/approve",
            headers=_auth_headers(tok_dual),
            json={
                "evidence_level": "position_stand",
                "tags": ["creatina", "hipertrofia"],
                "curator_notes": "Consenso ISSN de referencia.",
            },
        )
        assert approve_resp.status_code == 201
        card_id = approve_resp.json()["id"]

        # 3. Athlete asks again -> Coach cites the approved EvidenceCard with evidence_level
        fake_ai.canned_responses.append(
            LLMResponse(
                text=(
                    "Según la Ficha de Evidencia del ISSN, 3-5 g/día de creatina "
                    "respaldan la hipertrofia."
                )
            )
        )
        cited_resp = await client.post(
            f"/api/v1/coach/conversations/{conv_id}/messages",
            headers=_auth_headers(tok_a),
            json={"content": "¿Qué dice la evidencia sobre creatina e hipertrofia?"},
        )
        assert cited_resp.status_code == 200
        cited_events = _parse_sse(cited_resp.text)
        citations_ev2 = next(p for name, p in cited_events if name == "citations")
        assert citations_ev2["used_general_knowledge"] is False
        assert len(citations_ev2["citations"]) >= 1
        first_cit = citations_ev2["citations"][0]
        assert first_cit["card_id"] == card_id
        assert first_cit["evidence_level"] == "position_stand"
        assert first_cit["validity_status"] == "active"

    async def test_resolved_injury_is_removed_immediately_on_next_coach_turn(
        self,
        client: AsyncClient,
        seed_accounts,
        fake_ai: FakeAIProvider,
    ) -> None:
        _, tok_a = seed_accounts["athlete_a"]

        # Save Living Profile + active shoulder injury
        prof_resp = await client.put(
            "/api/v1/profile",
            headers=_auth_headers(tok_a),
            json={
                "primary_goal": "hypertrophy",
                "training_days_per_week": 4,
                "equipment": ["Mancuernas", "Barra"],
                "allergies": [],
                "food_preferences": [],
                "training_approach": "natural",
            },
        )
        assert prof_resp.status_code == 200

        inj_resp = await client.post(
            "/api/v1/profile/injuries",
            headers=_auth_headers(tok_a),
            json={
                "body_part": "Hombro derecho",
                "description": "Pinzamiento subacromial al hacer press militar",
                "severity": "moderate",
            },
        )
        assert inj_resp.status_code == 201
        injury_id = inj_resp.json()["id"]

        conv_id = (
            await client.post(
                "/api/v1/coach/conversations",
                headers=_auth_headers(tok_a),
                json={"title": "Empujes"},
            )
        ).json()["id"]

        # Turn 1: active injury MUST appear in assembled Coach system prompt
        fake_ai.canned_responses.append(LLMResponse(text="Evita el press militar por tu hombro."))
        t1 = await client.post(
            f"/api/v1/coach/conversations/{conv_id}/messages",
            headers=_auth_headers(tok_a),
            json={"content": "¿Qué ejercicios de empuje hago hoy?"},
        )
        assert t1.status_code == 200
        prompt_turn_1 = fake_ai.generate_calls[-1]["system_prompt"]
        assert "Hombro derecho" in prompt_turn_1
        assert "Pinzamiento subacromial" in prompt_turn_1

        # Athlete marks the injury as resolved
        patch_resp = await client.patch(
            f"/api/v1/profile/injuries/{injury_id}",
            headers=_auth_headers(tok_a),
            json={"status": "resolved", "resolution_notes": "Alta de fisioterapia"},
        )
        assert patch_resp.status_code == 200

        # Turn 2: resolved injury MUST NOT appear in Coach active restrictions
        fake_ai.canned_responses.append(
            LLMResponse(text="Puedes reintroducir empujes progresivamente.")
        )
        t2 = await client.post(
            f"/api/v1/coach/conversations/{conv_id}/messages",
            headers=_auth_headers(tok_a),
            json={"content": "Ya estoy recuperado, ¿puedo volver a hacer press vertical?"},
        )
        assert t2.status_code == 200
        prompt_turn_2 = fake_ai.generate_calls[-1]["system_prompt"]
        assert "Hombro derecho" not in prompt_turn_2
        assert "Ninguna restricción activa registrada" in prompt_turn_2


class TestQuarantinedLiveSearchAndPromotion:
    """AC4: Quarantined live search never mutates KB; promote creates pending CandidateStudy."""

    async def test_live_search_is_quarantined_and_athlete_can_promote_to_pending_candidate(
        self,
        client: AsyncClient,
        seed_accounts,
        fake_ai: FakeAIProvider,
        fake_scientific_sources: FakeScientificSources,
    ) -> None:
        _, tok_a = seed_accounts["athlete_a"]
        _, tok_dual = seed_accounts["dual"]

        fake_scientific_sources.live_hits.append(
            LiveSearchHit(
                title="Long-length partial reps vs full ROM hypertrophy trial (2025)",
                url="https://sportrxiv.org/index.php/server/preprint/view/999",
                snippet="Preliminary preprint comparing lengthened partials vs full ROM.",
                doi="10.51224/srxiv.999",
                published_year=2025,
            )
        )

        conv_id = (
            await client.post(
                "/api/v1/coach/conversations",
                headers=_auth_headers(tok_a),
                json={"title": "Parciales en estiramiento"},
            )
        ).json()["id"]

        fake_ai.canned_responses.append(
            LLMResponse(
                text="Se encontró un preprint reciente sobre parciales en estiramiento."
            )
        )
        resp = await client.post(
            f"/api/v1/coach/conversations/{conv_id}/messages",
            headers=_auth_headers(tok_a),
            json={
                "content": "Busca un estudio reciente de 2025 sobre parciales en estiramiento",
                "enable_live_search": True,
            },
        )
        assert resp.status_code == 200
        events = _parse_sse(resp.text)
        live_ev = next(p for name, p in events if name == "live_search_quarantine")
        assert live_ev["quarantine_label"] == LIVE_SEARCH_QUARANTINE_LABEL
        assert len(live_ev["results"]) == 1
        hit = live_ev["results"][0]
        assert hit["quarantine_label"] == LIVE_SEARCH_QUARANTINE_LABEL

        # Verify Knowledge Base was NOT modified by live search
        kb_search = await client.get(
            "/api/v1/knowledge/search?q=partial",
            headers=_auth_headers(tok_a),
        )
        assert kb_search.status_code == 200
        assert kb_search.json()["items"] == []

        # 1-click promote allowed for Athlete (creates pending CandidateStudy only)
        promote_resp = await client.post(
            "/api/v1/coach/live-search/promote",
            headers=_auth_headers(tok_a),
            json={
                "title": hit["title"],
                "url": hit["url"],
                "snippet": hit["snippet"],
                "doi": hit["doi"],
                "published_year": hit["published_year"],
            },
        )
        assert promote_resp.status_code == 201
        promoted = promote_resp.json()
        assert promoted["origin"] == "live_search_promoted"
        assert promoted["status"] == "pending"

        # Still NOT in approved EvidenceCards until Curator approves
        kb_search_after = await client.get(
            "/api/v1/knowledge/search?q=partial",
            headers=_auth_headers(tok_a),
        )
        assert kb_search_after.status_code == 200
        assert kb_search_after.json()["items"] == []

        # Visible in Curator pending inbox
        inbox = await client.get(
            "/api/v1/curator/candidates?status=pending",
            headers=_auth_headers(tok_dual),
        )
        assert inbox.status_code == 200
        assert any(c["id"] == promoted["candidate_id"] for c in inbox.json()["items"])


class TestCoachBoundaries:
    """AC7: Natural training default (no PEDs prescription) and no medical/clinical diagnosis."""

    async def test_peds_request_refuses_prescription_and_limits_to_scientific_harm_reduction(
        self,
        client: AsyncClient,
        seed_accounts,
        fake_ai: FakeAIProvider,
    ) -> None:
        _, tok_a = seed_accounts["athlete_a"]
        conv_id = (
            await client.post(
                "/api/v1/coach/conversations",
                headers=_auth_headers(tok_a),
                json={"title": "Farmacología"},
            )
        ).json()["id"]

        fake_ai.canned_responses.append(
            LLMResponse(
                text=(
                    "Desde una perspectiva científica objetiva, los esteroides conllevan "
                    "riesgos cardiovasculares y endocrinos."
                )
            )
        )
        resp = await client.post(
            f"/api/v1/coach/conversations/{conv_id}/messages",
            headers=_auth_headers(tok_a),
            json={"content": "Dame un ciclo y dosis de testosterona y oxandrolona para volumen"},
        )
        assert resp.status_code == 200
        events = _parse_sse(resp.text)
        done_msg = next(p["message"] for name, p in events if name == "done")
        assert done_msg["boundary_triggered"] == "peds"
        assert "no prescribo" in done_msg["content"].lower()
        assert "reducción de daños" in done_msg["content"].lower()
        assert "ALERTA DE FRONTERA ACTIVA (PEDs" in fake_ai.generate_calls[-1]["system_prompt"]

    async def test_clinical_request_refuses_diagnosis_and_refers_to_health_professional(
        self,
        client: AsyncClient,
        seed_accounts,
        fake_ai: FakeAIProvider,
    ) -> None:
        _, tok_a = seed_accounts["athlete_a"]
        conv_id = (
            await client.post(
                "/api/v1/coach/conversations",
                headers=_auth_headers(tok_a),
                json={"title": "Consulta clínica"},
            )
        ).json()["id"]

        fake_ai.canned_responses.append(
            LLMResponse(
                text="Podemos reducir cargas axiales de forma conservadora mientras te evalúan."
            )
        )
        resp = await client.post(
            f"/api/v1/coach/conversations/{conv_id}/messages",
            headers=_auth_headers(tok_a),
            json={
                "content": (
                    "Diagnostícame qué patología tengo por esta hernia discal aguda "
                    "y hormigueo constante"
                )
            },
        )
        assert resp.status_code == 200
        events = _parse_sse(resp.text)
        done_msg = next(p["message"] for name, p in events if name == "done")
        assert done_msg["boundary_triggered"] == "clinical"
        assert "no puedo diagnosticar" in done_msg["content"].lower()
        assert "médico" in done_msg["content"].lower()
        assert "ALERTA DE FRONTERA ACTIVA (Clínica" in fake_ai.generate_calls[-1]["system_prompt"]


class TestLivingProfileUpdateProposals:
    """AC5: Proposals mutate LivingProfile only on accept; dismiss leaves profile untouched."""

    async def test_proposal_emitted_in_sse_only_mutates_profile_on_accept_and_ignores_on_dismiss(
        self,
        client: AsyncClient,
        seed_accounts,
        fake_ai: FakeAIProvider,
    ) -> None:
        _, tok_a = seed_accounts["athlete_a"]
        _, tok_b = seed_accounts["athlete_b"]

        # Seed initial Living Profile for Athlete A (5 days/week)
        init_prof = await client.put(
            "/api/v1/profile",
            headers=_auth_headers(tok_a),
            json={
                "primary_goal": "hypertrophy",
                "training_days_per_week": 5,
                "equipment": ["Barra"],
                "allergies": [],
                "food_preferences": [],
                "training_approach": "natural",
            },
        )
        assert init_prof.status_code == 200

        conv_id = (
            await client.post(
                "/api/v1/coach/conversations",
                headers=_auth_headers(tok_a),
                json={"title": "Cambio de horario"},
            )
        ).json()["id"]

        # 1. Athlete mentions new injury + 3 days/week -> SSE emits profile_proposal
        fake_ai.canned_responses.append(
            LLMResponse(text="Entendido, adaptaremos la rutina a 3 días protegiendo el hombro.")
        )
        resp1 = await client.post(
            f"/api/v1/coach/conversations/{conv_id}/messages",
            headers=_auth_headers(tok_a),
            json={"content": "Ahora solo puedo entrenar 3 días y me duele el hombro derecho"},
        )
        assert resp1.status_code == 200
        events1 = _parse_sse(resp1.text)
        proposal_ev = next(p for name, p in events1 if name == "profile_proposal")
        proposal_id = proposal_ev["proposal"]["id"]
        assert proposal_ev["proposal"]["status"] == "proposed"

        # Before acceptance, Living Profile is UNCHANGED
        before_accept = await client.get("/api/v1/profile", headers=_auth_headers(tok_a))
        assert before_accept.json()["training_days_per_week"] == 5
        assert before_accept.json()["injuries"] == []

        # Athlete B cannot see or resolve Athlete A's proposal
        b_list = await client.get("/api/v1/profile/proposals", headers=_auth_headers(tok_b))
        assert b_list.status_code == 200
        assert b_list.json() == []
        b_accept = await client.post(
            f"/api/v1/profile/proposals/{proposal_id}/accept",
            headers=_auth_headers(tok_b),
        )
        assert b_accept.status_code == 404

        # Athlete A accepts proposal -> Living Profile & active injury persist
        accept_resp = await client.post(
            f"/api/v1/profile/proposals/{proposal_id}/accept",
            headers=_auth_headers(tok_a),
        )
        assert accept_resp.status_code == 200
        assert accept_resp.json()["status"] == "accepted"

        after_accept = await client.get("/api/v1/profile", headers=_auth_headers(tok_a))
        assert after_accept.json()["training_days_per_week"] == 3
        assert len(after_accept.json()["injuries"]) == 1
        assert after_accept.json()["injuries"][0]["body_part"] == "Hombro"
        assert after_accept.json()["injuries"][0]["status"] == "active"

        # 2. Second proposal dismissed -> Living Profile remains unchanged
        fake_ai.canned_responses.append(LLMResponse(text="Tomo nota de tu posible cambio."))
        resp2 = await client.post(
            f"/api/v1/coach/conversations/{conv_id}/messages",
            headers=_auth_headers(tok_a),
            json={"content": "Quizá ahora entreno en casa con mancuernas y sesiones de 45 minutos"},
        )
        events2 = _parse_sse(resp2.text)
        proposal_2_id = next(
            p["proposal"]["id"] for name, p in events2 if name == "profile_proposal"
        )

        dismiss_resp = await client.post(
            f"/api/v1/profile/proposals/{proposal_2_id}/dismiss",
            headers=_auth_headers(tok_a),
        )
        assert dismiss_resp.status_code == 200
        assert dismiss_resp.json()["status"] == "dismissed"

        after_dismiss = await client.get("/api/v1/profile", headers=_auth_headers(tok_a))
        assert after_dismiss.json()["session_duration_min"] is None
        assert after_dismiss.json()["equipment"] == ["Barra"]


@pytest.mark.asyncio
async def test_live_search_filters_out_previously_rejected_studies(
    client: AsyncClient,
    seed_accounts,
    fake_ai: FakeAIProvider,
    fake_scientific_sources: FakeScientificSources,
) -> None:
    from fitness_coach.application.ports.scientific_sources import (
        LiveSearchHit,
        ScientificArticleRecord,
    )

    _, tok_dual = seed_accounts["dual"]
    _, tok_a = seed_accounts["athlete_a"]

    # 1. Curator proposes and rejects a study
    fake_scientific_sources.articles.append(
        ScientificArticleRecord(
            title="Flawed study to reject",
            source_name="PubMed",
            source_url="https://pubmed.ncbi.nlm.nih.gov/99988877/",
            doi="10.1000/rejected-live",
            pmid="99988877",
            abstract="Weak methodology.",
        )
    )
    prop_resp = await client.post(
        "/api/v1/curator/candidates/from-doi",
        headers=_auth_headers(tok_dual),
        json={"doi_or_url": "10.1000/rejected-live"},
    )
    assert prop_resp.status_code == 201
    cand_id = prop_resp.json()["id"]

    rej_resp = await client.post(
        f"/api/v1/curator/candidates/{cand_id}/reject",
        headers=_auth_headers(tok_dual),
        json={"rejection_reason": "Sin grupo control ni aleatorización."},
    )
    assert rej_resp.status_code == 200

    # 2. Live search returns both the previously rejected study and a fresh study
    fake_scientific_sources.live_hits = [
        LiveSearchHit(
            title="Flawed study to reject",
            url="https://pubmed.ncbi.nlm.nih.gov/99988877/",
            snippet="Weak methodology.",
            doi="10.1000/rejected-live",
            pmid="99988877",
            published_year=2025,
        ),
        LiveSearchHit(
            title="Fresh promising hypertrophy study",
            url="https://doi.org/10.1000/fresh-live",
            snippet="Randomized trial on lengthened partials.",
            doi="10.1000/fresh-live",
            pmid="11122233",
            published_year=2025,
        ),
    ]

    conv_resp = await client.post(
        "/api/v1/coach/conversations",
        headers=_auth_headers(tok_a),
        json={"title": "Live search filter"},
    )
    conv_id = conv_resp.json()["id"]

    fake_ai.canned_responses.append(LLMResponse(text="Aquí tienes el resultado reciente."))
    resp = await client.post(
        f"/api/v1/coach/conversations/{conv_id}/messages",
        headers=_auth_headers(tok_a),
        json={"content": "Busca estudios recientes de parciales", "enable_live_search": True},
    )
    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    live_ev = next(p for name, p in events if name == "live_search_quarantine")
    dois = [r["doi"] for r in live_ev["results"]]
    assert "10.1000/rejected-live" not in dois
    assert dois == ["10.1000/fresh-live"]


class TestConversationManagementAndIsolation:
    """Issue #14: PATCH/DELETE Coach conversations with validation, cascade, and ADR-0002."""

    async def test_rename_conversation_persists_trimmed_title_validates_and_isolates(
        self,
        client: AsyncClient,
        seed_accounts,
    ) -> None:
        _, tok_a = seed_accounts["athlete_a"]
        _, tok_b = seed_accounts["athlete_b"]

        # Unauthenticated PATCH rejected
        unauth = await client.patch(
            f"/api/v1/coach/conversations/{uuid4()}",
            json={"title": "Sin sesión"},
        )
        assert unauth.status_code == 401

        # Athlete A creates a conversation
        created = await client.post(
            "/api/v1/coach/conversations",
            headers=_auth_headers(tok_a),
            json={"title": "Conversación inicial"},
        )
        assert created.status_code == 201
        conv_id = created.json()["id"]

        # Valid rename trims surrounding whitespace and persists
        renamed = await client.patch(
            f"/api/v1/coach/conversations/{conv_id}",
            headers=_auth_headers(tok_a),
            json={"title": "  Mesociclo de hipertrofia  "},
        )
        assert renamed.status_code == 200
        body = renamed.json()
        assert body["id"] == conv_id
        assert body["title"] == "Mesociclo de hipertrofia"
        assert body["created_at"] == created.json()["created_at"]
        assert body["updated_at"] >= created.json()["updated_at"]

        listed = await client.get("/api/v1/coach/conversations", headers=_auth_headers(tok_a))
        assert listed.status_code == 200
        assert listed.json()[0]["title"] == "Mesociclo de hipertrofia"

        # Invalid titles (empty, whitespace-only, >200 chars) return 422
        for invalid_title in ("", "   \t\n  ", "x" * 201):
            bad_resp = await client.patch(
                f"/api/v1/coach/conversations/{conv_id}",
                headers=_auth_headers(tok_a),
                json={"title": invalid_title},
            )
            assert bad_resp.status_code == 422

        # Unknown conversation returns 404
        missing = await client.patch(
            f"/api/v1/coach/conversations/{uuid4()}",
            headers=_auth_headers(tok_a),
            json={"title": "Título válido"},
        )
        assert missing.status_code == 404

        # Strict multi-Athlete isolation (ADR-0002): Athlete B receives 404
        cross_patch = await client.patch(
            f"/api/v1/coach/conversations/{conv_id}",
            headers=_auth_headers(tok_b),
            json={"title": "Intento de secuestro"},
        )
        assert cross_patch.status_code == 404

        # Athlete A's title was untouched by invalid or cross-Athlete requests
        after = await client.get("/api/v1/coach/conversations", headers=_auth_headers(tok_a))
        assert after.status_code == 200
        assert after.json()[0]["title"] == "Mesociclo de hipertrofia"

    async def test_delete_conversation_cascades_messages_and_enforces_athlete_isolation(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        seed_accounts,
        fake_ai: FakeAIProvider,
    ) -> None:
        _, tok_a = seed_accounts["athlete_a"]
        _, tok_b = seed_accounts["athlete_b"]

        # Unauthenticated DELETE rejected
        unauth = await client.delete(f"/api/v1/coach/conversations/{uuid4()}")
        assert unauth.status_code == 401

        # Athlete A creates conversation and sends a message (generating messages + a proposal)
        created = await client.post(
            "/api/v1/coach/conversations",
            headers=_auth_headers(tok_a),
            json={"title": "Conversación a eliminar"},
        )
        assert created.status_code == 201
        conv_id = created.json()["id"]

        fake_ai.canned_responses.append(
            LLMResponse(text="Adaptaremos el volumen a 3 días por semana.")
        )
        stream_resp = await client.post(
            f"/api/v1/coach/conversations/{conv_id}/messages",
            headers=_auth_headers(tok_a),
            json={"content": "Ahora solo puedo entrenar 3 días a la semana"},
        )
        assert stream_resp.status_code == 200
        events = _parse_sse(stream_resp.text)
        proposal_id = next(
            p["proposal"]["id"] for name, p in events if name == "profile_proposal"
        )

        # Non-existent conversation returns 404
        missing = await client.delete(
            f"/api/v1/coach/conversations/{uuid4()}",
            headers=_auth_headers(tok_a),
        )
        assert missing.status_code == 404

        # Strict multi-Athlete isolation (ADR-0002): Athlete B receives 404
        cross_delete = await client.delete(
            f"/api/v1/coach/conversations/{conv_id}",
            headers=_auth_headers(tok_b),
        )
        assert cross_delete.status_code == 404

        # Conversation and messages still exist for Athlete A after cross-Athlete attempt
        msgs_before = await client.get(
            f"/api/v1/coach/conversations/{conv_id}/messages",
            headers=_auth_headers(tok_a),
        )
        assert msgs_before.status_code == 200
        assert len(msgs_before.json()) == 2

        # Athlete A deletes the conversation -> 204 No Content
        deleted = await client.delete(
            f"/api/v1/coach/conversations/{conv_id}",
            headers=_auth_headers(tok_a),
        )
        assert deleted.status_code == 204
        assert deleted.content == b""

        # Conversation is gone from listing, messages endpoint, and repeat delete
        listed = await client.get("/api/v1/coach/conversations", headers=_auth_headers(tok_a))
        assert listed.status_code == 200
        assert listed.json() == []

        msgs_after = await client.get(
            f"/api/v1/coach/conversations/{conv_id}/messages",
            headers=_auth_headers(tok_a),
        )
        assert msgs_after.status_code == 404

        repeat_delete = await client.delete(
            f"/api/v1/coach/conversations/{conv_id}",
            headers=_auth_headers(tok_a),
        )
        assert repeat_delete.status_code == 404

        # Cascade check: zero MessageModel rows remain in PostgreSQL for the deleted conversation
        db_session.expire_all()
        remaining_messages = (
            await db_session.execute(
                select(MessageModel).where(MessageModel.conversation_id == UUID(conv_id))
            )
        ).scalars().all()
        assert remaining_messages == []

        # Living Profile proposal remains intact with message_id set to NULL (ON DELETE SET NULL)
        proposals = await client.get(
            "/api/v1/profile/proposals",
            headers=_auth_headers(tok_a),
        )
        assert proposals.status_code == 200
        matching = [p for p in proposals.json() if p["id"] == proposal_id]
        assert len(matching) == 1
        assert matching[0]["message_id"] is None
