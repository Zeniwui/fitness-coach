"""Integration tests for Monthly Cut, Quota Checkpointing, Seed Batch & Trending Topics (#5).

Runs against real PostgreSQL + pgvector + Alembic migrations using the 3 backend testing seams.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from fitness_coach.application.ports.scientific_sources import (
    LiveSearchHit,
    ScientificArticleRecord,
)
from tests.fakes.ai_provider import FakeAIProvider
from tests.fakes.scientific_sources import FakeScientificSources


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_monthly_cut_rbac_and_deterministic_prefilter_dedup_cap_paywall(
    client: AsyncClient,
    seed_accounts,
    fake_ai: FakeAIProvider,
    fake_scientific_sources: FakeScientificSources,
) -> None:
    """Slice 1: Curator-only RBAC, 0-LLM deterministic pre-filter/dedup, cap, paywall flag &
    history.
    """
    _, athlete_token = seed_accounts["athlete_a"]
    _, curator_token = seed_accounts["dual"]

    # 1. Athlete cannot trigger monthly cut, seed batch, or curator trending review -> 403
    assert (
        await client.post(
            "/api/v1/curator/monthly-cuts",
            headers=_auth_header(athlete_token),
            json={"max_candidates": 5},
        )
    ).status_code == 403
    assert (
        await client.get(
            "/api/v1/curator/monthly-cuts",
            headers=_auth_header(athlete_token),
        )
    ).status_code == 403
    assert (
        await client.post(
            "/api/v1/curator/seed-batch",
            headers=_auth_header(athlete_token),
        )
    ).status_code == 403

    # 2. Seed one approved EvidenceCard and one rejected CandidateStudy to verify exclusion
    existing_approved_doi = "10.1007/approved.existing.2025"
    existing_rejected_doi = "10.1007/rejected.existing.2025"
    existing_rejected_pmid = "40000099"

    fake_scientific_sources.articles = [
        ScientificArticleRecord(
            title="Existing Approved Hypertrophy Meta-Analysis",
            source_name="PubMed",
            source_url=f"https://doi.org/{existing_approved_doi}",
            doi=existing_approved_doi,
            pmid="40000001",
            authors=["Schoenfeld BJ"],
            journal="Sports Medicine",
            published_year=2025,
            abstract="Meta-analysis of weekly resistance training volume and muscle hypertrophy.",
            full_text="Full text of approved meta-analysis on resistance training volume.",
            is_open_access=True,
        ),
        ScientificArticleRecord(
            title="Existing Rejected Low-Quality Bodybuilding Note",
            source_name="PubMed",
            source_url=f"https://doi.org/{existing_rejected_doi}",
            doi=existing_rejected_doi,
            pmid=existing_rejected_pmid,
            authors=["Anon X"],
            journal="Sports Medicine",
            published_year=2025,
            abstract="Weak observational note on resistance training.",
            full_text=None,
            is_open_access=False,
        ),
    ]

    approved_cand = (
        await client.post(
            "/api/v1/curator/candidates/from-doi",
            headers=_auth_header(curator_token),
            json={"doi_or_url": existing_approved_doi},
        )
    ).json()
    assert (
        await client.post(
            f"/api/v1/curator/candidates/{approved_cand['id']}/approve",
            headers=_auth_header(curator_token),
            json={
                "evidence_level": "meta_analysis",
                "curated_text_es": "Volumen semanal óptimo de hipertrofia entre 10 y 20 series.",
                "key_terms_en": ["hypertrophy", "weekly volume"],
                "tags": ["hipertrofia", "volumen"],
            },
        )
    ).status_code == 201

    rejected_cand = (
        await client.post(
            "/api/v1/curator/candidates/from-doi",
            headers=_auth_header(curator_token),
            json={"doi_or_url": existing_rejected_doi},
        )
    ).json()
    assert (
        await client.post(
            f"/api/v1/curator/candidates/{rejected_cand['id']}/reject",
            headers=_auth_header(curator_token),
            json={"rejection_reason": "Sin grupo control ni aleatorización."},
        )
    ).status_code == 200

    # Reset AI call counter before running Monthly Cut
    fake_ai.generate_calls.clear()

    # 3. Configure controlled batch: off-topic, already-approved, already-rejected (by PMID),
    # in-batch duplicate, OA full-text meta-analysis, paywall RCT, and a 3rd lower-priority study
    fake_scientific_sources.articles = [
        # Off-topic -> must be dropped deterministically (0 LLM calls)
        ScientificArticleRecord(
            title="Pediatric Asthma Inhaler Adherence in Primary Care",
            source_name="PubMed",
            source_url="https://pubmed.ncbi.nlm.nih.gov/41000001/",
            doi="10.1000/offtopic.asthma.2026",
            pmid="41000001",
            authors=["Smith J"],
            journal="Pediatrics",
            published_year=2026,
            abstract="Clinical asthma inhaler compliance in children aged 5 to 10.",
            full_text="Full text pediatric asthma study.",
            is_open_access=True,
        ),
        # Already approved DOI -> excluded
        ScientificArticleRecord(
            title="Existing Approved Hypertrophy Meta-Analysis",
            source_name="Europe PMC",
            source_url=f"https://doi.org/{existing_approved_doi}",
            doi=existing_approved_doi.upper(),
            pmid="40000001",
            authors=["Schoenfeld BJ"],
            journal="Sports Medicine",
            published_year=2025,
            abstract="Meta-analysis of weekly resistance training volume and muscle hypertrophy.",
            full_text="Full text...",
            is_open_access=True,
        ),
        # Already rejected PMID (even with different/missing DOI) -> excluded
        ScientificArticleRecord(
            title="Previously Rejected Study Resurfaced",
            source_name="PubMed",
            source_url=f"https://pubmed.ncbi.nlm.nih.gov/{existing_rejected_pmid}/",
            doi=None,
            pmid=existing_rejected_pmid,
            authors=["Anon X"],
            journal="Sports Medicine",
            published_year=2025,
            abstract="Resistance training hypertrophy study.",
            full_text=None,
            is_open_access=False,
        ),
        # Valid #1: Open Access Meta-Analysis (high priority)
        ScientificArticleRecord(
            title="Proximity to Failure and Muscle Hypertrophy: A 2026 Meta-Analysis",
            source_name="Europe PMC",
            source_url="https://doi.org/10.1007/oa.failure.2026",
            doi="10.1007/oa.failure.2026",
            pmid="41000010",
            pmcid="PMC9990010",
            authors=["Refalo MC", "Helms ER"],
            journal="Sports Medicine",
            published_year=2026,
            abstract=(
                "Systematic review and meta-analysis comparing RIR 0-2 vs RIR 4+ for hypertrophy."
            ),
            full_text="Complete Open Access text detailing n=420 trained lifters and RIR outcomes.",
            is_open_access=True,
        ),
        # Duplicate of Valid #1 inside same batch -> deduplicated
        ScientificArticleRecord(
            title="Proximity to Failure and Muscle Hypertrophy: A 2026 Meta-Analysis",
            source_name="Crossref",
            source_url="https://doi.org/10.1007/oa.failure.2026",
            doi="10.1007/OA.FAILURE.2026",
            pmid="41000010",
            authors=["Refalo MC", "Helms ER"],
            journal="Sports Medicine",
            published_year=2026,
            abstract="Duplicate entry from Crossref.",
            full_text=None,
            is_open_access=False,
        ),
        # Valid #2: Paywalled RCT (abstract only)
        ScientificArticleRecord(
            title="Randomized Controlled Trial of Lengthened Partials on Hypertrophy",
            source_name="PubMed",
            source_url="https://doi.org/10.1519/paywall.partials.2026",
            doi="10.1519/paywall.partials.2026",
            pmid="41000011",
            authors=["Wolf M", "Schoenfeld BJ"],
            journal="Journal of Strength and Conditioning Research",
            published_year=2026,
            abstract=(
                "RCT comparing lengthened partials vs full ROM for muscle hypertrophy over 8 weeks."
            ),
            full_text=None,
            is_open_access=False,
        ),
        # Valid #3: Lower-priority observational study -> must be excluded by max_candidates=2
        ScientificArticleRecord(
            title="Observational Survey of Creatine Timing in Recreational Lifters",
            source_name="SportRxiv",
            source_url="https://sportrxiv.org/10.51224/creatine.survey.2026",
            doi="10.51224/creatine.survey.2026",
            pmid=None,
            authors=["Doe J"],
            journal="SportRxiv",
            published_year=2026,
            abstract="Cross-sectional survey on creatine timing and muscle strength.",
            full_text=None,
            is_open_access=False,
        ),
    ]
    fake_scientific_sources.live_hits = [
        LiveSearchHit(
            title="Debate: ¿Las parciales en estiramiento superan siempre al ROM completo?",
            url="https://fitness-trends.example/lengthened-partials",
            snippet="Tendencia viral sobre parciales en estiramiento para hipertrofia.",
            published_year=2026,
        )
    ]

    resp = await client.post(
        "/api/v1/curator/monthly-cuts",
        headers=_auth_header(curator_token),
        json={
            "date_from": "2026-01-01",
            "date_to": "2026-01-31",
            "query_override": "hypertrophy resistance training",
            "max_candidates": 2,
        },
    )
    assert resp.status_code == 201, resp.text
    run = resp.json()
    assert run["status"] == "completed"
    assert run["run_type"] == "manual"
    assert run["collected_count"] == 7
    assert run["filtered_count"] == 2
    assert run["analyzed_count"] == 2
    assert run["max_candidates"] == 2
    assert run["pause_reason"] is None
    assert "Europe PMC" in run["sources"]
    assert "PubMed" in run["sources"]

    # Verify candidates created are pending, linked to run, capped at 2, and paywall flagged
    cand_resp = await client.get(
        "/api/v1/curator/candidates?status=pending",
        headers=_auth_header(curator_token),
    )
    assert cand_resp.status_code == 200
    pending = cand_resp.json()["items"]
    assert len(pending) == 2

    by_doi = {c["doi"]: c for c in pending}
    assert "10.1007/oa.failure.2026" in by_doi
    assert "10.1519/paywall.partials.2026" in by_doi
    assert "10.51224/creatine.survey.2026" not in by_doi
    assert "10.1000/offtopic.asthma.2026" not in by_doi

    oa_cand = by_doi["10.1007/oa.failure.2026"]
    assert oa_cand["origin"] == "monthly_cut"
    assert oa_cand["access_level"] == "full_text_open_access"
    assert oa_cand["paywall_warning"] is None
    assert oa_cand["monthly_cut_run_id"] == run["id"]

    paywall_cand = by_doi["10.1519/paywall.partials.2026"]
    assert paywall_cand["access_level"] == "abstract_only_paywall"
    assert paywall_cand["paywall_warning"] == "Evaluado solo con abstract (texto completo de pago)"
    assert "abstract" in paywall_cand["critical_sheet"]["block_5_limitations_and_conflicts"].lower()

    # Verify run history endpoint exposes the run
    history_resp = await client.get(
        "/api/v1/curator/monthly-cuts",
        headers=_auth_header(curator_token),
    )
    assert history_resp.status_code == 200
    runs = history_resp.json()["items"]
    assert len(runs) == 1
    assert runs[0]["id"] == run["id"]

    # Verify ADR-0001: NO EvidenceCards were auto-created (only the 1 manually approved earlier)
    kb_resp = await client.get(
        "/api/v1/knowledge/search",
        headers=_auth_header(athlete_token),
    )
    assert kb_resp.status_code == 200
    assert len(kb_resp.json()["items"]) == 1


@pytest.mark.asyncio
async def test_monthly_cut_rate_limit_checkpoint_and_idempotent_resume(
    client: AsyncClient,
    seed_accounts,
    fake_ai: FakeAIProvider,
    fake_scientific_sources: FakeScientificSources,
) -> None:
    """Slice 2: HTTP 429 pauses cleanly with checkpoint; resume continues with 0 duplicate LLM
    calls/rows.
    """
    _, curator_token = seed_accounts["dual"]

    fake_scientific_sources.articles = [
        ScientificArticleRecord(
            title="Meta-Analysis 1: Weekly Set Volume and Hypertrophy",
            source_name="PubMed",
            source_url="https://doi.org/10.1007/rl.study1.2026",
            doi="10.1007/rl.study1.2026",
            pmid="42000001",
            authors=["Author A"],
            journal="Sports Medicine",
            published_year=2026,
            abstract="Meta-analysis on weekly resistance training volume and muscle hypertrophy.",
            full_text="Full text of study 1 on weekly resistance training volume.",
            is_open_access=True,
        ),
        ScientificArticleRecord(
            title="Meta-Analysis 2: Protein Timing and Muscle Growth",
            source_name="Europe PMC",
            source_url="https://doi.org/10.1007/rl.study2.2026",
            doi="10.1007/rl.study2.2026",
            pmid="42000002",
            authors=["Author B"],
            journal="Sports Medicine",
            published_year=2026,
            abstract="Meta-analysis on protein distribution and muscle hypertrophy.",
            full_text="Full text of study 2 on protein timing and muscle protein synthesis.",
            is_open_access=True,
        ),
        ScientificArticleRecord(
            title="Meta-Analysis 3: Creatine Supplementation and 1RM Strength",
            source_name="Crossref",
            source_url="https://doi.org/10.1007/rl.study3.2026",
            doi="10.1007/rl.study3.2026",
            pmid="42000003",
            authors=["Author C"],
            journal="Journal of the International Society of Sports Nutrition",
            published_year=2026,
            abstract="Meta-analysis on creatine monohydrate and 1RM strength.",
            full_text="Full text of study 3 on creatine monohydrate.",
            is_open_access=True,
        ),
    ]
    fake_scientific_sources.live_hits = []

    # Simulate HTTP 429 after 1 LLM call (study 1 succeeds, study 2 triggers 429)
    fake_ai.simulate_rate_limit_after = 1

    first_resp = await client.post(
        "/api/v1/curator/monthly-cuts",
        headers=_auth_header(curator_token),
        json={"max_candidates": 5},
    )
    assert first_resp.status_code == 201, first_resp.text
    paused_run = first_resp.json()
    assert paused_run["status"] == "paused_rate_limit"
    assert paused_run["collected_count"] == 3
    assert paused_run["filtered_count"] == 3
    assert paused_run["analyzed_count"] == 1
    assert paused_run["checkpoint_next_index"] == 1
    assert paused_run["checkpoint_queue_size"] == 3
    assert "429" in (paused_run["pause_reason"] or "")

    # Exactly 1 LLM call occurred and exactly 1 candidate was persisted
    assert len(fake_ai.generate_calls) == 1
    cands_after_pause = (
        await client.get(
            "/api/v1/curator/candidates?status=pending",
            headers=_auth_header(curator_token),
        )
    ).json()["items"]
    assert len(cands_after_pause) == 1

    # Lift quota limit and resume -> must process ONLY the remaining 2 studies (total LLM calls = 3)
    fake_ai.simulate_rate_limit_after = None
    resume_resp = await client.post(
        f"/api/v1/curator/monthly-cuts/{paused_run['id']}/resume",
        headers=_auth_header(curator_token),
    )
    assert resume_resp.status_code == 200, resume_resp.text
    completed_run = resume_resp.json()
    assert completed_run["status"] == "completed"
    assert completed_run["analyzed_count"] == 3
    assert completed_run["checkpoint_next_index"] == 3
    assert completed_run["pause_reason"] is None
    assert completed_run["finished_at"] is not None

    # Total LLM calls across both runs MUST be 3 (never re-analyzed study 1!)
    assert len(fake_ai.generate_calls) == 3

    # Total pending candidates MUST be 3 (zero duplicates)
    cands_after_resume = (
        await client.get(
            "/api/v1/curator/candidates?status=pending",
            headers=_auth_header(curator_token),
        )
    ).json()["items"]
    assert len(cands_after_resume) == 3

    # Resuming an already-completed run returns 400
    invalid_resume = await client.post(
        f"/api/v1/curator/monthly-cuts/{paused_run['id']}/resume",
        headers=_auth_header(curator_token),
    )
    assert invalid_resume.status_code == 400


@pytest.mark.asyncio
async def test_trending_topics_isolation_contrast_and_curator_review(
    client: AsyncClient,
    seed_accounts,
    fake_scientific_sources: FakeScientificSources,
) -> None:
    """Slice 3: Temas de Actualidad contrast against KB, Curator approve/dismiss, never enter
    EvidenceCards.
    """
    _, athlete_token = seed_accounts["athlete_a"]
    _, curator_token = seed_accounts["dual"]

    # Seed one approved EvidenceCard so TrendingTopic cites it in critical contrast
    fake_scientific_sources.articles = [
        ScientificArticleRecord(
            title="Creatine Monohydrate and Strength Performance Meta-Analysis",
            source_name="PubMed",
            source_url="https://doi.org/10.1007/kb.creatine.2025",
            doi="10.1007/kb.creatine.2025",
            pmid="43000001",
            authors=["Kreider RB"],
            journal="Journal of the International Society of Sports Nutrition",
            published_year=2025,
            abstract="Meta-analysis confirming 3-5g/day creatine monohydrate efficacy.",
            full_text="Full text confirming creatine monohydrate 3-5g/day safety and efficacy.",
            is_open_access=True,
        )
    ]
    cand = (
        await client.post(
            "/api/v1/curator/candidates/from-doi",
            headers=_auth_header(curator_token),
            json={"doi_or_url": "10.1007/kb.creatine.2025"},
        )
    ).json()
    card = (
        await client.post(
            f"/api/v1/curator/candidates/{cand['id']}/approve",
            headers=_auth_header(curator_token),
            json={
                "evidence_level": "meta_analysis",
                "curated_text_es": "Monohidrato de creatina 3-5 g/día mejora fuerza e hipertrofia.",
                "key_terms_en": ["creatine monohydrate", "strength"],
                "tags": ["creatina", "suplementacion"],
            },
        )
    ).json()

    # Run Monthly Cut with two live trending hits
    fake_scientific_sources.articles = []
    fake_scientific_sources.live_hits = [
        LiveSearchHit(
            title="Debate viral: ¿La creatina HCL supera al monohidrato de creatina?",
            url="https://trends.example/creatine-hcl",
            snippet="Influencers afirman que la creatina HCL requiere menos dosis y rinde más.",
            published_year=2026,
        ),
        LiveSearchHit(
            title="Mito en redes: ¿Entrenar en ayunas quema el doble de grasa?",
            url="https://trends.example/fasted-cardio",
            snippet="Debate recurrente sobre cardio en ayunas frente a déficit calórico total.",
            published_year=2026,
        ),
    ]
    run_resp = await client.post(
        "/api/v1/curator/monthly-cuts",
        headers=_auth_header(curator_token),
        json={"query_override": "creatine hypertrophy trends", "max_candidates": 5},
    )
    assert run_resp.status_code == 201

    # Athlete cannot access curator trending queue or review endpoint -> 403
    assert (
        await client.get(
            "/api/v1/curator/trending-topics",
            headers=_auth_header(athlete_token),
        )
    ).status_code == 403

    curator_topics = (
        await client.get(
            "/api/v1/curator/trending-topics?status=pending",
            headers=_auth_header(curator_token),
        )
    ).json()["items"]
    assert len(curator_topics) == 2

    # Before approval, Athlete sees 0 approved Temas de Actualidad
    athlete_before = (
        await client.get(
            "/api/v1/knowledge/trending-topics",
            headers=_auth_header(athlete_token),
        )
    ).json()["items"]
    assert len(athlete_before) == 0

    # Curator approves first as context and dismisses second
    t1, t2 = curator_topics[0], curator_topics[1]
    assert card["id"] in t1["cited_card_ids"]

    assert (
        await client.post(
            f"/api/v1/curator/trending-topics/{t1['id']}/review",
            headers=_auth_header(athlete_token),
            json={"decision": "approved_context"},
        )
    ).status_code == 403

    approve_resp = await client.post(
        f"/api/v1/curator/trending-topics/{t1['id']}/review",
        headers=_auth_header(curator_token),
        json={"decision": "approved_context"},
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["status"] == "approved_context"

    dismiss_resp = await client.post(
        f"/api/v1/curator/trending-topics/{t2['id']}/review",
        headers=_auth_header(curator_token),
        json={"decision": "dismissed"},
    )
    assert dismiss_resp.status_code == 200
    assert dismiss_resp.json()["status"] == "dismissed"

    # Athlete now sees ONLY the approved Tema de Actualidad
    athlete_after = (
        await client.get(
            "/api/v1/knowledge/trending-topics",
            headers=_auth_header(athlete_token),
        )
    ).json()["items"]
    assert len(athlete_after) == 1
    assert athlete_after[0]["id"] == t1["id"]

    # Strict isolation: EvidenceCard search still has ONLY the 1 approved EvidenceCard (no
    # TrendingTopics)
    kb_cards = (
        await client.get(
            "/api/v1/knowledge/search",
            headers=_auth_header(athlete_token),
        )
    ).json()["items"]
    assert len(kb_cards) == 1
    assert kb_cards[0]["card"]["id"] == card["id"]


@pytest.mark.asyncio
async def test_seed_batch_is_idempotent_and_enters_pending_curator_inbox(
    client: AsyncClient,
    seed_accounts,
) -> None:
    """Slice 4: Foundational seed batch (~15-20 studies) loads idempotently as pending
    CandidateStudies.
    """
    _, athlete_token = seed_accounts["athlete_a"]
    _, curator_token = seed_accounts["dual"]

    # First run creates all foundational studies (between 15 and 20)
    first = await client.post(
        "/api/v1/curator/seed-batch",
        headers=_auth_header(curator_token),
    )
    assert first.status_code == 201, first.text
    first_body = first.json()
    assert 15 <= first_body["total_in_catalog"] <= 20
    assert first_body["created_count"] == first_body["total_in_catalog"]
    assert first_body["skipped_count"] == 0

    # All entered as pending CandidateStudies with origin=seed_batch (ADR-0001: 0 auto-approved
    # EvidenceCards)
    pending = (
        await client.get(
            "/api/v1/curator/candidates?status=pending",
            headers=_auth_header(curator_token),
        )
    ).json()["items"]
    assert len(pending) == first_body["total_in_catalog"]
    assert all(c["origin"] == "seed_batch" for c in pending)

    kb_cards = (
        await client.get(
            "/api/v1/knowledge/search",
            headers=_auth_header(athlete_token),
        )
    ).json()["items"]
    assert len(kb_cards) == 0

    # Second run is 100% idempotent: 0 created, all skipped, candidate count unchanged
    second = await client.post(
        "/api/v1/curator/seed-batch",
        headers=_auth_header(curator_token),
    )
    assert second.status_code == 201
    second_body = second.json()
    assert second_body["created_count"] == 0
    assert second_body["skipped_count"] == first_body["total_in_catalog"]

    pending_after = (
        await client.get(
            "/api/v1/curator/candidates?status=pending",
            headers=_auth_header(curator_token),
        )
    ).json()["items"]
    assert len(pending_after) == first_body["total_in_catalog"]


@pytest.mark.asyncio
async def test_autonomous_cli_runner_executes_scheduled_run_resume_and_seed(
    test_database_url: str,
    db_session,
    fake_ai: FakeAIProvider,
    fake_scientific_sources: FakeScientificSources,
) -> None:
    """Slice 5: Autonomous CLI runner executes scheduled Corte Mensual, resume, and seed outside
    web server.
    """
    from fitness_coach.infrastructure.cli.monthly_cut import (
        run_cli_monthly_cut,
        run_cli_resume,
        run_cli_seed,
    )

    fake_scientific_sources.articles = [
        ScientificArticleRecord(
            title="Scheduled Meta-Analysis on Resistance Training Deloads",
            source_name="PubMed",
            source_url="https://doi.org/10.1007/cli.deload.2026",
            doi="10.1007/cli.deload.2026",
            pmid="44000001",
            authors=["Bell L"],
            journal="Sports Medicine",
            published_year=2026,
            abstract=(
                "Systematic review and meta-analysis of deload protocols in resistance training."
            ),
            full_text="Full text of deload systematic review.",
            is_open_access=True,
        ),
        ScientificArticleRecord(
            title="Scheduled RCT on Beta-Alanine and Hypertrophy",
            source_name="Europe PMC",
            source_url="https://doi.org/10.1007/cli.beta.2026",
            doi="10.1007/cli.beta.2026",
            pmid="44000002",
            authors=["Trexler ET"],
            journal="Journal of the International Society of Sports Nutrition",
            published_year=2026,
            abstract=(
                "RCT on beta-alanine supplementation during high-volume hypertrophy mesocycles."
            ),
            full_text="Full text of beta-alanine RCT.",
            is_open_access=True,
        ),
    ]
    fake_scientific_sources.live_hits = []

    # Simulate rate limit after 1 item during scheduled CLI run
    fake_ai.simulate_rate_limit_after = 1
    paused = await run_cli_monthly_cut(
        database_url=test_database_url,
        ai_provider=fake_ai,
        scientific_sources=fake_scientific_sources,
        max_candidates=5,
    )
    assert paused.run_type.value == "scheduled"
    assert paused.status.value == "paused_rate_limit"
    assert paused.analyzed_count == 1

    # Resume via CLI after quota resets
    fake_ai.simulate_rate_limit_after = None
    resumed = await run_cli_resume(
        database_url=test_database_url,
        run_id=paused.id,
        ai_provider=fake_ai,
        scientific_sources=fake_scientific_sources,
    )
    assert resumed.status.value == "completed"
    assert resumed.analyzed_count == 2

    # Seed via CLI is idempotent
    seed1 = await run_cli_seed(database_url=test_database_url)
    assert 15 <= seed1.created_count <= 20
    seed2 = await run_cli_seed(database_url=test_database_url)
    assert seed2.created_count == 0
    assert seed2.skipped_count == seed1.total_in_catalog


@pytest.mark.asyncio
async def test_monthly_cut_pauses_cleanly_on_429_during_kb_embedding_lookup(
    client: AsyncClient,
    seed_accounts,
    fake_ai: FakeAIProvider,
    fake_scientific_sources: FakeScientificSources,
) -> None:
    _, curator_token = seed_accounts["dual"]

    # Seed 1 approved EvidenceCard so _find_related_kb_cards invokes embed_texts
    fake_scientific_sources.articles = [
        ScientificArticleRecord(
            title="Baseline Volume Meta-Analysis",
            source_name="PubMed",
            source_url="https://doi.org/10.1007/kb.base.2024",
            doi="10.1007/kb.base.2024",
            pmid="45000001",
            abstract="Higher weekly volume increases hypertrophy.",
            full_text="Full text baseline volume meta-analysis.",
            is_open_access=True,
        ),
    ]
    prop = await client.post(
        "/api/v1/curator/candidates/from-doi",
        headers=_auth_header(curator_token),
        json={"doi_or_url": "10.1007/kb.base.2024"},
    )
    assert prop.status_code == 201
    approve = await client.post(
        f"/api/v1/curator/candidates/{prop.json()['id']}/approve",
        headers=_auth_header(curator_token),
        json={"tags": ["volumen"], "relations": []},
    )
    assert approve.status_code == 201

    # Queue a new article for Monthly Cut and trigger 429 on the very next embed_texts call
    fake_scientific_sources.articles = [
        ScientificArticleRecord(
            title="New 2026 Hypertrophy Frequency RCT",
            source_name="PubMed",
            source_url="https://doi.org/10.1007/new.freq.2026",
            doi="10.1007/new.freq.2026",
            pmid="45000002",
            abstract="Frequency RCT abstract.",
            full_text="Full text frequency RCT.",
            is_open_access=True,
        ),
    ]
    fake_scientific_sources.live_hits = []
    fake_ai.simulate_embed_rate_limit_after = len(fake_ai.embed_calls)

    run_resp = await client.post(
        "/api/v1/curator/monthly-cuts",
        headers=_auth_header(curator_token),
        json={"max_candidates": 5},
    )
    assert run_resp.status_code == 201, run_resp.text
    paused = run_resp.json()
    assert paused["status"] == "paused_rate_limit"
    assert paused["analyzed_count"] == 0
    assert paused["pause_reason"] is not None

    # Quota resets -> resume completes cleanly
    fake_ai.simulate_embed_rate_limit_after = None
    resume_resp = await client.post(
        f"/api/v1/curator/monthly-cuts/{paused['id']}/resume",
        headers=_auth_header(curator_token),
    )
    assert resume_resp.status_code == 200, resume_resp.text
    resumed = resume_resp.json()
    assert resumed["status"] == "completed"
    assert resumed["analyzed_count"] == 1
