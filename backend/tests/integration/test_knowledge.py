"""Integration tests for ticket #4: Knowledge Base, Curator Inbox & Hybrid Search."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from fitness_coach.application.ports.scientific_sources import ScientificArticleRecord
from tests.fakes.scientific_sources import FakeScientificSources


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_curator_proposes_oa_and_paywall_studies_by_doi_with_6_block_sheet_and_role_guard(
    client: AsyncClient,
    seed_accounts,
    fake_scientific_sources: FakeScientificSources,
) -> None:
    _, curator_token = seed_accounts["curator"]
    _, athlete_token = seed_accounts["athlete_a"]

    oa_article = ScientificArticleRecord(
        title=(
            "Dose-response relationship between weekly resistance training volume "
            "and muscle hypertrophy"
        ),
        source_name="PubMed",
        source_url="https://pubmed.ncbi.nlm.nih.gov/27433992/",
        doi="10.1080/02640414.2016.1210197",
        pmid="27433992",
        pmcid="PMC5000001",
        authors=["Schoenfeld BJ", "Ogborn D", "Krieger JW"],
        journal="Journal of Sports Sciences",
        published_year=2017,
        abstract="Meta-analysis examining weekly set volume and skeletal muscle hypertrophy.",
        full_text=(
            "Full text: 15 studies analyzed. Performing 10+ weekly sets per muscle group produced "
            "significantly greater hypertrophy (ES +0.34, p=0.002) compared to <5 sets."
        ),
        is_open_access=True,
    )
    paywall_article = ScientificArticleRecord(
        title=(
            "Effects of proximity to failure (RIR) on strength and hypertrophy "
            "in trained lifters"
        ),
        source_name="Crossref",
        source_url="https://doi.org/10.1007/s40279-023-01880-x",
        doi="10.1007/s40279-023-01880-x",
        pmid="37300001",
        authors=["Robinson ZP", "Pelland JC"],
        journal="Sports Medicine",
        published_year=2023,
        abstract=(
            "Abstract only: Training closer to failure (0-2 RIR) may enhance hypertrophy, "
            "while strength gains appear similar across RIR ranges."
        ),
        full_text=None,
        is_open_access=False,
    )
    fake_scientific_sources.articles.extend([oa_article, paywall_article])

    # Athlete-only must receive 403 on Curator endpoints
    forbidden_list = await client.get(
        "/api/v1/curator/candidates",
        headers=_auth_headers(athlete_token),
    )
    assert forbidden_list.status_code == 403

    forbidden_create = await client.post(
        "/api/v1/curator/candidates/from-doi",
        headers=_auth_headers(athlete_token),
        json={"doi_or_url": "https://doi.org/10.1080/02640414.2016.1210197"},
    )
    assert forbidden_create.status_code == 403

    # Curator proposes OA study by DOI URL
    oa_resp = await client.post(
        "/api/v1/curator/candidates/from-doi",
        headers=_auth_headers(curator_token),
        json={"doi_or_url": "https://doi.org/10.1080/02640414.2016.1210197"},
    )
    assert oa_resp.status_code == 201
    oa_body = oa_resp.json()
    assert oa_body["doi"] == "10.1080/02640414.2016.1210197"
    assert oa_body["pmid"] == "27433992"
    assert oa_body["status"] == "pending"
    assert oa_body["access_level"] == "full_text_open_access"
    assert oa_body["paywall_warning"] is None
    assert oa_body["source_url"] == "https://pubmed.ncbi.nlm.nih.gov/27433992/"

    # Mandatory 6-block critical sheet must have all 6 non-empty blocks
    sheet = oa_body["critical_sheet"]
    for block_key in (
        "block_1_identification",
        "block_2_design_and_evidence_level",
        "block_3_population_and_protocol",
        "block_4_key_findings_and_applicability",
        "block_5_limitations_and_conflicts",
        "block_6_impact_vs_existing_kb",
    ):
        assert isinstance(sheet[block_key], str) and len(sheet[block_key].strip()) > 0
    assert "10.1080/02640414.2016.1210197" in sheet["block_1_identification"]

    # Curator proposes paywalled study by DOI
    pw_resp = await client.post(
        "/api/v1/curator/candidates/from-doi",
        headers=_auth_headers(curator_token),
        json={"doi_or_url": "10.1007/s40279-023-01880-x"},
    )
    assert pw_resp.status_code == 201
    pw_body = pw_resp.json()
    assert pw_body["access_level"] == "abstract_only_paywall"
    assert pw_body["paywall_warning"] == "Evaluado solo con abstract (texto completo de pago)"
    assert "abstract" in pw_body["critical_sheet"]["block_5_limitations_and_conflicts"].lower()

    # Listing pending candidates shows both studies
    list_resp = await client.get(
        "/api/v1/curator/candidates?status=pending",
        headers=_auth_headers(curator_token),
    )
    assert list_resp.status_code == 200
    items = list_resp.json()["items"]
    assert len(items) == 2


def _make_pdf_bytes(text: str | None) -> bytes:
    import pymupdf

    doc = pymupdf.open()
    page = doc.new_page()
    if text:
        page.insert_textbox(pymupdf.Rect(50, 50, 540, 750), text)
    data = doc.tobytes()
    doc.close()
    return data


@pytest.mark.asyncio
async def test_curator_uploads_pdf_to_paywall_candidate_and_handles_invalid_pdfs_safely(
    client: AsyncClient,
    seed_accounts,
    fake_scientific_sources: FakeScientificSources,
) -> None:
    _, curator_token = seed_accounts["curator"]
    _, athlete_token = seed_accounts["athlete_a"]

    paywall_article = ScientificArticleRecord(
        title="Creatine supplementation and resistance training strength outcomes",
        source_name="Crossref",
        source_url="https://doi.org/10.1249/mss.0000000000009999",
        doi="10.1249/mss.0000000000009999",
        authors=["Kreider RB"],
        journal="MSSE",
        published_year=2024,
        abstract="Abstract only: Creatine monohydrate improved 1RM bench press.",
        full_text=None,
        is_open_access=False,
    )
    fake_scientific_sources.articles.append(paywall_article)

    created = (
        await client.post(
            "/api/v1/curator/candidates/from-doi",
            headers=_auth_headers(curator_token),
            json={"doi_or_url": "10.1249/mss.0000000000009999"},
        )
    ).json()
    candidate_id = created["id"]
    original_sheet = created["critical_sheet"]
    assert created["access_level"] == "abstract_only_paywall"

    # Corrupt PDF -> 400 in Spanish, does NOT corrupt existing candidate
    corrupt_resp = await client.post(
        f"/api/v1/curator/candidates/{candidate_id}/upload-pdf",
        headers=_auth_headers(curator_token),
        files={"file": ("broken.pdf", b"not-a-valid-pdf-stream", "application/pdf")},
    )
    assert corrupt_resp.status_code == 400
    assert "pdf" in corrupt_resp.json()["detail"].lower()

    # Image-only / no-text-layer PDF -> 400 in Spanish, does NOT corrupt existing candidate
    blank_pdf = _make_pdf_bytes(None)
    no_text_resp = await client.post(
        f"/api/v1/curator/candidates/{candidate_id}/upload-pdf",
        headers=_auth_headers(curator_token),
        files={"file": ("scan.pdf", blank_pdf, "application/pdf")},
    )
    assert no_text_resp.status_code == 400
    assert "texto" in no_text_resp.json()["detail"].lower()

    # Oversized PDF (>15MB) -> 400 in Spanish
    oversized_pdf = b"%PDF-1.4\n" + (b"0" * (15 * 1024 * 1024 + 1024))
    oversized_resp = await client.post(
        f"/api/v1/curator/candidates/{candidate_id}/upload-pdf",
        headers=_auth_headers(curator_token),
        files={"file": ("huge.pdf", oversized_pdf, "application/pdf")},
    )
    assert oversized_resp.status_code == 400
    assert "tamaño" in oversized_resp.json()["detail"].lower()

    # Verify prior candidate state is 100% untouched after all failed uploads
    still_intact = (
        await client.get(
            f"/api/v1/curator/candidates/{candidate_id}",
            headers=_auth_headers(curator_token),
        )
    ).json()
    assert still_intact["access_level"] == "abstract_only_paywall"
    assert still_intact["critical_sheet"] == original_sheet
    assert still_intact["previous_critical_sheet"] is None

    # Valid full-text PDF -> switches to full_text_uploaded_pdf and regenerates 6 blocks
    valid_pdf = _make_pdf_bytes(
        "Randomized controlled trial (n=64, 12 weeks). Creatine monohydrate 5 g/day "
        "increased 1RM bench press by +8.4% and lean mass by +1.4 kg vs placebo (p < 0.01)."
    )
    upload_resp = await client.post(
        f"/api/v1/curator/candidates/{candidate_id}/upload-pdf",
        headers=_auth_headers(curator_token),
        files={"file": ("kreider2024.pdf", valid_pdf, "application/pdf")},
    )
    assert upload_resp.status_code == 200
    updated = upload_resp.json()
    assert updated["access_level"] == "full_text_uploaded_pdf"
    assert updated["paywall_warning"] is None
    assert updated["pdf_storage_path"] is not None
    assert updated["previous_critical_sheet"] == original_sheet
    assert "n=64" in updated["critical_sheet"]["block_3_population_and_protocol"]

    # Manual proposal directly from PDF (Curator succeeds, Athlete gets 403)
    manual_pdf = _make_pdf_bytes(
        "ISSN Position Stand: Protein and exercise. Daily intake of 1.6-2.2 g/kg/day "
        "optimizes muscle protein synthesis and mTOR signaling in resistance-trained athletes."
    )
    forbidden_pdf = await client.post(
        "/api/v1/curator/candidates/from-pdf",
        headers=_auth_headers(athlete_token),
        files={"file": ("issn.pdf", manual_pdf, "application/pdf")},
        data={"title": "ISSN Position Stand: Protein and Exercise"},
    )
    assert forbidden_pdf.status_code == 403

    manual_resp = await client.post(
        "/api/v1/curator/candidates/from-pdf",
        headers=_auth_headers(curator_token),
        files={"file": ("issn.pdf", manual_pdf, "application/pdf")},
        data={"title": "ISSN Position Stand: Protein and Exercise"},
    )
    assert manual_resp.status_code == 201
    manual_body = manual_resp.json()
    assert manual_body["access_level"] == "full_text_uploaded_pdf"
    assert manual_body["paywall_warning"] is None
    assert "ISSN" in manual_body["critical_sheet"]["key_terms_en"]
    assert "mTOR" in manual_body["critical_sheet"]["key_terms_en"]


@pytest.mark.asyncio
async def test_reject_candidate_remembers_doi_blocks_duplicates_and_allows_explicit_reopen(
    client: AsyncClient,
    seed_accounts,
    fake_scientific_sources: FakeScientificSources,
) -> None:
    _, curator_token = seed_accounts["curator"]
    _, athlete_token = seed_accounts["athlete_a"]

    weak_study = ScientificArticleRecord(
        title="Uncontrolled pilot study on proprietary supplement blend",
        source_name="PubMed",
        source_url="https://pubmed.ncbi.nlm.nih.gov/99900011/",
        doi="10.9999/weak.2024.001",
        pmid="99900011",
        authors=["Sponsor A"],
        journal="Pilot Journal",
        published_year=2024,
        abstract="n=6, no control group, funded by manufacturer.",
        full_text="Full text of n=6 uncontrolled study funded by supplement brand.",
        is_open_access=True,
    )
    fake_scientific_sources.articles.append(weak_study)

    created = (
        await client.post(
            "/api/v1/curator/candidates/from-doi",
            headers=_auth_headers(curator_token),
            json={"doi_or_url": "10.9999/weak.2024.001"},
        )
    ).json()
    candidate_id = created["id"]

    # Athlete cannot reject -> 403
    forbidden = await client.post(
        f"/api/v1/curator/candidates/{candidate_id}/reject",
        headers=_auth_headers(athlete_token),
        json={"rejection_reason": "No autorizado"},
    )
    assert forbidden.status_code == 403

    # Empty rejection reason -> 400/422
    empty_reason = await client.post(
        f"/api/v1/curator/candidates/{candidate_id}/reject",
        headers=_auth_headers(curator_token),
        json={"rejection_reason": "   "},
    )
    assert empty_reason.status_code in (400, 422)

    # Valid rejection with mandatory reason
    rej_resp = await client.post(
        f"/api/v1/curator/candidates/{candidate_id}/reject",
        headers=_auth_headers(curator_token),
        json={
            "rejection_reason": "Muestra mínima (n=6), sin grupo control y conflicto de interés."
        },
    )
    assert rej_resp.status_code == 200
    rej_body = rej_resp.json()
    assert rej_body["status"] == "rejected"
    assert "n=6" in rej_body["rejection_reason"]

    # Re-proposing same DOI without allow_reopen -> 409 with prior rejection & reason
    dup_resp = await client.post(
        "/api/v1/curator/candidates/from-doi",
        headers=_auth_headers(curator_token),
        json={"doi_or_url": "https://doi.org/10.9999/weak.2024.001"},
    )
    assert dup_resp.status_code == 409
    detail = dup_resp.json()["detail"]
    assert detail["code"] == "previously_rejected"
    assert detail["prior_candidate_id"] == candidate_id
    assert "n=6" in detail["prior_rejection_reason"]

    # Explicit reopen returns candidate to pending
    reopen_resp = await client.post(
        "/api/v1/curator/candidates/from-doi",
        headers=_auth_headers(curator_token),
        json={"doi_or_url": "10.9999/weak.2024.001", "allow_reopen": True},
    )
    assert reopen_resp.status_code == 201
    reopened = reopen_resp.json()
    assert reopened["id"] == candidate_id
    assert reopened["status"] == "pending"
    assert reopened["rejection_reason"] is None


@pytest.mark.asyncio
async def test_approve_candidate_evolution_relations_and_card_updates_without_deleting_history(
    client: AsyncClient,
    seed_accounts,
    fake_scientific_sources: FakeScientificSources,
) -> None:
    _, curator_token = seed_accounts["curator"]
    _, athlete_token = seed_accounts["athlete_a"]

    old_study = ScientificArticleRecord(
        title="Early RCT suggesting 60s rest intervals maximize hypertrophy",
        source_name="PubMed",
        source_url="https://pubmed.ncbi.nlm.nih.gov/11111111/",
        doi="10.1000/rest.2010",
        pmid="11111111",
        authors=["Old Author"],
        journal="Strength Journal",
        published_year=2010,
        abstract="Short rest intervals of 60 seconds vs 180 seconds.",
        full_text="Full text of 2010 trial on rest intervals and hypertrophy.",
        is_open_access=True,
    )
    new_meta = ScientificArticleRecord(
        title="Updated meta-analysis on inter-set rest intervals and skeletal muscle hypertrophy",
        source_name="PubMed",
        source_url="https://pubmed.ncbi.nlm.nih.gov/22222222/",
        doi="10.1000/rest.2024",
        pmid="22222222",
        authors=["Singer A", "Schoenfeld BJ"],
        journal="Sports Medicine",
        published_year=2024,
        abstract="Meta-analysis showing >60s rest intervals favor hypertrophy.",
        full_text=(
            "Meta-analysis of 9 RCTs showing rest intervals >60s "
            "outperform <=60s for hypertrophy."
        ),
        is_open_access=True,
    )
    fake_scientific_sources.articles.extend([old_study, new_meta])

    cand1 = (
        await client.post(
            "/api/v1/curator/candidates/from-doi",
            headers=_auth_headers(curator_token),
            json={"doi_or_url": "10.1000/rest.2010"},
        )
    ).json()
    cand2 = (
        await client.post(
            "/api/v1/curator/candidates/from-doi",
            headers=_auth_headers(curator_token),
            json={"doi_or_url": "10.1000/rest.2024"},
        )
    ).json()

    # Athlete cannot approve -> 403
    forbidden_approve = await client.post(
        f"/api/v1/curator/candidates/{cand1['id']}/approve",
        headers=_auth_headers(athlete_token),
        json={"tags": ["descanso", "hipertrofia"]},
    )
    assert forbidden_approve.status_code == 403

    # Approve first candidate
    card1_resp = await client.post(
        f"/api/v1/curator/candidates/{cand1['id']}/approve",
        headers=_auth_headers(curator_token),
        json={
            "evidence_level": "rct",
            "curated_text_es": (
                "Ensayo clásico sobre intervalos de descanso cortos de 60s para hipertrofia."
            ),
            "key_terms_en": ["inter-set rest", "hypertrophy"],
            "tags": ["descanso", "hipertrofia"],
            "curator_notes": "Estudio histórico inicial.",
        },
    )
    assert card1_resp.status_code == 201
    card1 = card1_resp.json()
    assert card1["validity_status"] == "active"

    # Approve second candidate with `supersedes` relation to card1
    card2_resp = await client.post(
        f"/api/v1/curator/candidates/{cand2['id']}/approve",
        headers=_auth_headers(curator_token),
        json={
            "evidence_level": "meta_analysis",
            "curated_text_es": (
                "Meta-análisis reciente: descansos mayores a 60s superan "
                "a descansos cortos para hipertrofia."
            ),
            "key_terms_en": ["inter-set rest", "hypertrophy", "meta-analysis"],
            "tags": ["descanso", "hipertrofia"],
            "curator_notes": "Evidencia vigente prioritaria.",
            "relations": [
                {
                    "target_card_id": card1["id"],
                    "relation_type": "supersedes",
                    "rationale": "Meta-análisis 2024 con mayor muestra y mejor control de volumen.",
                }
            ],
        },
    )
    assert card2_resp.status_code == 201
    card2 = card2_resp.json()
    assert card2["validity_status"] == "active"
    assert len(card2["outgoing_relations"]) == 1
    assert card2["outgoing_relations"][0]["relation_type"] == "supersedes"
    assert card2["outgoing_relations"][0]["target_card_id"] == card1["id"]

    # Card1 is NOT deleted; it is preserved as `superseded` and points to card2
    card1_detail_resp = await client.get(
        f"/api/v1/knowledge/cards/{card1['id']}",
        headers=_auth_headers(athlete_token),
    )
    assert card1_detail_resp.status_code == 200
    card1_detail = card1_detail_resp.json()
    assert card1_detail["validity_status"] == "superseded"
    assert len(card1_detail["incoming_relations"]) == 1
    assert [c["id"] for c in card1_detail["updated_by_cards"]] == [card2["id"]]

    # Curator edits notes and archives a card without breaking references (Athlete gets 403)
    forbidden_patch = await client.patch(
        f"/api/v1/curator/cards/{card1['id']}",
        headers=_auth_headers(athlete_token),
        json={"curator_notes": "Intento no autorizado"},
    )
    assert forbidden_patch.status_code == 403

    patch_resp = await client.patch(
        f"/api/v1/curator/cards/{card1['id']}",
        headers=_auth_headers(curator_token),
        json={
            "curator_notes": "Archivado tras revisión 2024; conservado por trazabilidad.",
            "validity_status": "archived",
        },
    )
    assert patch_resp.status_code == 200
    patched = patch_resp.json()
    assert patched["validity_status"] == "archived"
    assert "trazabilidad" in patched["curator_notes"]
    assert len(patched["incoming_relations"]) == 1


@pytest.mark.asyncio
async def test_hybrid_search_spanish_concepts_exact_acronyms_filters_and_active_priority(
    client: AsyncClient,
    seed_accounts,
    fake_scientific_sources: FakeScientificSources,
) -> None:
    _, curator_token = seed_accounts["curator"]
    _, athlete_token = seed_accounts["athlete_a"]

    articles = [
        ScientificArticleRecord(
            title="Weekly resistance training set volume and skeletal muscle hypertrophy",
            source_name="PubMed",
            source_url="https://pubmed.ncbi.nlm.nih.gov/30000001/",
            doi="10.2000/vol.2024",
            pmid="30000001",
            authors=["Schoenfeld BJ"],
            journal="Sports Medicine",
            published_year=2024,
            abstract="Weekly set volume meta-analysis.",
            full_text="Full text: 10-20 weekly sets maximize skeletal muscle hypertrophy.",
            is_open_access=True,
        ),
        ScientificArticleRecord(
            title="Proximity to failure (RIR) and 1RM strength adaptations",
            source_name="PubMed",
            source_url="https://pubmed.ncbi.nlm.nih.gov/30000002/",
            doi="10.2000/rir.2024",
            pmid="30000002",
            authors=["Robinson ZP"],
            journal="Sports Medicine",
            published_year=2024,
            abstract="RIR and 1RM strength outcomes.",
            full_text="Full text: 0-2 RIR optimizes hypertrophy; 1RM strength improves across RIR.",
            is_open_access=True,
        ),
        ScientificArticleRecord(
            title="ISSN Position Stand on HMB and mTOR signaling",
            source_name="PubMed",
            source_url="https://pubmed.ncbi.nlm.nih.gov/30000003/",
            doi="10.2000/issn.hmb",
            pmid="30000003",
            authors=["Wilson JM"],
            journal="JISSN",
            published_year=2023,
            abstract="ISSN position stand on HMB and mTOR.",
            full_text="Full text: ISSN review of HMB supplementation and mTOR pathway.",
            is_open_access=True,
        ),
        ScientificArticleRecord(
            title="Outdated volume study claiming 3 weekly sets suffice for muscle hypertrophy",
            source_name="PubMed",
            source_url="https://pubmed.ncbi.nlm.nih.gov/30000004/",
            doi="10.2000/vol.2005",
            pmid="30000004",
            authors=["Early Author"],
            journal="Old Sports J",
            published_year=2005,
            abstract="Small trial on weekly set volume.",
            full_text="Full text: 3 weekly sets vs 6 weekly sets for muscle hypertrophy.",
            is_open_access=True,
        ),
    ]
    fake_scientific_sources.articles.extend(articles)

    async def _create_and_approve(
        doi: str,
        *,
        evidence_level: str,
        curated_text_es: str,
        key_terms_en: list[str],
        tags: list[str],
        relations: list[dict] | None = None,
    ) -> dict:
        cand = (
            await client.post(
                "/api/v1/curator/candidates/from-doi",
                headers=_auth_headers(curator_token),
                json={"doi_or_url": doi},
            )
        ).json()
        resp = await client.post(
            f"/api/v1/curator/candidates/{cand['id']}/approve",
            headers=_auth_headers(curator_token),
            json={
                "evidence_level": evidence_level,
                "curated_text_es": curated_text_es,
                "key_terms_en": key_terms_en,
                "tags": tags,
                "relations": relations or [],
            },
        )
        assert resp.status_code == 201
        return resp.json()

    old_vol_card = await _create_and_approve(
        "10.2000/vol.2005",
        evidence_level="rct",
        curated_text_es="Ensayo antiguo sobre series semanales y crecimiento muscular.",
        key_terms_en=["weekly sets", "hypertrophy"],
        tags=["volumen", "hipertrofia"],
    )
    active_vol_card = await _create_and_approve(
        "10.2000/vol.2024",
        evidence_level="meta_analysis",
        curated_text_es=(
            "Meta-análisis vigente sobre dosis-respuesta de volumen semanal y masa muscular."
        ),
        key_terms_en=["weekly sets", "set volume", "muscle hypertrophy"],
        tags=["volumen", "hipertrofia"],
        relations=[
            {
                "target_card_id": old_vol_card["id"],
                "relation_type": "supersedes",
                "rationale": "Meta-análisis actualizado con mayor evidencia.",
            }
        ],
    )
    rir_card = await _create_and_approve(
        "10.2000/rir.2024",
        evidence_level="meta_analysis",
        curated_text_es="Análisis sobre proximidad al fallo y ganancias de fuerza máxima.",
        key_terms_en=["RIR", "1RM", "proximity to failure"],
        tags=["fuerza", "intensidad"],
    )
    hmb_card = await _create_and_approve(
        "10.2000/issn.hmb",
        evidence_level="position_stand",
        curated_text_es="Posicionamiento sobre suplementación deportiva y señalización anabólica.",
        key_terms_en=["ISSN", "HMB", "mTOR"],
        tags=["suplementacion"],
    )

    # 1. Spanish conceptual query -> Athlete can search; active outranks superseded
    es_resp = await client.get(
        "/api/v1/knowledge/search",
        headers=_auth_headers(athlete_token),
        params={"q": "cuánto volumen semanal maximiza el crecimiento muscular"},
    )
    assert es_resp.status_code == 200
    es_hits = es_resp.json()["items"]
    assert len(es_hits) >= 2
    assert es_hits[0]["card"]["id"] == active_vol_card["id"]
    assert es_hits[0]["card"]["validity_status"] == "active"

    # Superseded card surfaces its updating card when present
    superseded_hits = [h for h in es_hits if h["card"]["id"] == old_vol_card["id"]]
    if superseded_hits:
        assert [c["id"] for c in superseded_hits[0]["updated_by_cards"]] == [active_vol_card["id"]]

    # 2. Exact acronyms: RIR, 1RM, HMB, ISSN, mTOR
    for acronym, expected_id in (
        ("RIR", rir_card["id"]),
        ("1RM", rir_card["id"]),
        ("HMB", hmb_card["id"]),
        ("ISSN", hmb_card["id"]),
        ("mTOR", hmb_card["id"]),
    ):
        ac_resp = await client.get(
            "/api/v1/knowledge/search",
            headers=_auth_headers(athlete_token),
            params={"q": acronym},
        )
        assert ac_resp.status_code == 200
        ac_hits = ac_resp.json()["items"]
        assert ac_hits, f"Expected hybrid search hit for exact acronym {acronym}"
        assert ac_hits[0]["card"]["id"] == expected_id, f"Wrong top hit for acronym {acronym}"

    # 3. Filters: tags, evidence_level, validity_status
    filtered_resp = await client.get(
        "/api/v1/knowledge/search",
        headers=_auth_headers(athlete_token),
        params={
            "tags": ["suplementacion"],
            "evidence_level": "position_stand",
            "validity_status": "active",
        },
    )
    assert filtered_resp.status_code == 200
    filtered_hits = filtered_resp.json()["items"]
    assert [h["card"]["id"] for h in filtered_hits] == [hmb_card["id"]]


@pytest.mark.asyncio
async def test_controlled_reindex_updates_embeddings_when_model_changes(
    client: AsyncClient,
    seed_accounts,
    fake_ai,
    fake_scientific_sources: FakeScientificSources,
) -> None:
    _, curator_token = seed_accounts["curator"]
    _, athlete_token = seed_accounts["athlete_a"]

    fake_scientific_sources.articles.append(
        ScientificArticleRecord(
            title="Protein timing and hypertrophy meta-analysis",
            source_name="PubMed",
            source_url="https://pubmed.ncbi.nlm.nih.gov/40000001/",
            doi="10.3000/prot.2024",
            pmid="40000001",
            authors=["Schoenfeld BJ"],
            journal="JISSN",
            published_year=2024,
            abstract="Total daily protein intake drives hypertrophy.",
            full_text=(
                "Full text: Total daily protein intake of 1.6 g/kg/day "
                "drives muscle hypertrophy."
            ),
            is_open_access=True,
        )
    )
    cand = (
        await client.post(
            "/api/v1/curator/candidates/from-doi",
            headers=_auth_headers(curator_token),
            json={"doi_or_url": "10.3000/prot.2024"},
        )
    ).json()
    card = (
        await client.post(
            f"/api/v1/curator/candidates/{cand['id']}/approve",
            headers=_auth_headers(curator_token),
            json={
                "evidence_level": "meta_analysis",
                "curated_text_es": (
                    "La ingesta total diaria de proteína es el factor principal "
                    "para la hipertrofia."
                ),
                "key_terms_en": ["protein", "hypertrophy"],
                "tags": ["proteina", "hipertrofia"],
            },
        )
    ).json()
    assert card["embedding_model"] == "fake-embedding-v1"

    # Athlete cannot trigger reindex -> 403
    forbidden = await client.post(
        "/api/v1/curator/reindex",
        headers=_auth_headers(athlete_token),
        json={"force": False},
    )
    assert forbidden.status_code == 403

    # Reindex with same model and force=False skips already up-to-date cards
    noop_resp = await client.post(
        "/api/v1/curator/reindex",
        headers=_auth_headers(curator_token),
        json={"force": False},
    )
    assert noop_resp.status_code == 200
    assert noop_resp.json() == {
        "reindexed_count": 0,
        "skipped_count": 1,
        "embedding_model": "fake-embedding-v1",
    }

    # Swap embedding model & dimension (simulating provider migration per ADR-0003)
    fake_ai.embedding_model_id = "openai-text-embedding-3-small-v2"
    fake_ai.embedding_dim = 24

    reindex_resp = await client.post(
        "/api/v1/curator/reindex",
        headers=_auth_headers(curator_token),
        json={"force": False},
    )
    assert reindex_resp.status_code == 200
    assert reindex_resp.json() == {
        "reindexed_count": 1,
        "skipped_count": 0,
        "embedding_model": "openai-text-embedding-3-small-v2",
    }

    # Card now carries the new embedding model and remains searchable via hybrid search
    refreshed = (
        await client.get(
            f"/api/v1/knowledge/cards/{card['id']}",
            headers=_auth_headers(athlete_token),
        )
    ).json()
    assert refreshed["embedding_model"] == "openai-text-embedding-3-small-v2"

    search_resp = await client.get(
        "/api/v1/knowledge/search",
        headers=_auth_headers(athlete_token),
        params={"q": "proteína diaria para masa muscular"},
    )
    assert search_resp.status_code == 200
    hits = search_resp.json()["items"]
    assert len(hits) == 1
    assert hits[0]["card"]["id"] == card["id"]
    assert hits[0]["vector_rank"] == 1


@pytest.mark.asyncio
async def test_curator_rejects_unsafe_source_url_and_self_referential_relation(
    client: AsyncClient,
    seed_accounts,
    fake_scientific_sources: FakeScientificSources,
) -> None:
    _, curator_token = seed_accounts["curator"]

    for idx, unsafe_url in enumerate(
        ("javascript:alert(1)", "data:text/html,<script>alert(1)</script>")
    ):
        doi = f"10.9999/xss.{idx}.2025"
        fake_scientific_sources.articles.append(
            ScientificArticleRecord(
                title="Unsafe URL study",
                source_name="PubMed",
                source_url=unsafe_url,
                doi=doi,
                pmid=f"9999000{idx}",
                authors=["Attacker A"],
                journal="Test Journal",
                published_year=2025,
                abstract="Abstract text",
                is_open_access=False,
            )
        )
        resp = await client.post(
            "/api/v1/curator/candidates/from-doi",
            headers=_auth_headers(curator_token),
            json={"doi_or_url": doi},
        )
        assert resp.status_code in (400, 422)

    # Create and approve a valid card, then attempt a self-referential relation -> 422
    fake_scientific_sources.articles.append(
        ScientificArticleRecord(
            title="Valid Study for Self Relation Check",
            source_name="PubMed",
            source_url="https://pubmed.ncbi.nlm.nih.gov/99990002/",
            doi="10.9999/valid.self.2025",
            pmid="99990002",
            authors=["Author V"],
            journal="Sports Science",
            published_year=2025,
            abstract="Solid RCT abstract.",
            is_open_access=False,
        )
    )
    cand_resp = await client.post(
        "/api/v1/curator/candidates/from-doi",
        headers=_auth_headers(curator_token),
        json={"doi_or_url": "10.9999/valid.self.2025"},
    )
    assert cand_resp.status_code == 201
    cand_id = cand_resp.json()["id"]

    card_resp = await client.post(
        f"/api/v1/curator/candidates/{cand_id}/approve",
        headers=_auth_headers(curator_token),
        json={"evidence_level": "rct", "tags": ["self-check"]},
    )
    assert card_resp.status_code == 201
    card_id = card_resp.json()["id"]

    self_rel_resp = await client.patch(
        f"/api/v1/curator/cards/{card_id}",
        headers=_auth_headers(curator_token),
        json={
            "add_relations": [
                {
                    "target_card_id": card_id,
                    "relation_type": "confirms",
                    "rationale": "Self-reference must fail",
                }
            ]
        },
    )
    assert self_rel_resp.status_code == 422


@pytest.mark.asyncio
async def test_reopen_rejected_candidate_overwrites_metadata_and_approves_cleanly(
    client: AsyncClient,
    seed_accounts,
    fake_scientific_sources: FakeScientificSources,
) -> None:
    _, curator_token = seed_accounts["curator"]

    fake_scientific_sources.articles.append(
        ScientificArticleRecord(
            title="Stale Poisoned Title",
            source_name="PubMed",
            source_url="https://example.com/stale",
            doi="10.9999/reopen.meta.2025",
            pmid="88880001",
            pmcid=None,
            authors=["Stale Author"],
            journal="Old Journal",
            published_year=2020,
            abstract="Old abstract.",
            is_open_access=False,
        )
    )
    first_resp = await client.post(
        "/api/v1/curator/candidates/from-doi",
        headers=_auth_headers(curator_token),
        json={"doi_or_url": "10.9999/reopen.meta.2025"},
    )
    assert first_resp.status_code == 201
    candidate_id = first_resp.json()["id"]

    rej_resp = await client.post(
        f"/api/v1/curator/candidates/{candidate_id}/reject",
        headers=_auth_headers(curator_token),
        json={"rejection_reason": "Metadatos incompletos."},
    )
    assert rej_resp.status_code == 200

    # Authoritative source now returns updated metadata
    fake_scientific_sources.articles[:] = [
        ScientificArticleRecord(
            title="Authoritative Updated Study Title",
            source_name="PubMed",
            source_url="https://pubmed.ncbi.nlm.nih.gov/88880002/",
            doi="10.9999/reopen.meta.2025",
            pmid="88880002",
            pmcid="PMC8888000",
            authors=["Authoritative A", "Authoritative B"],
            journal="Journal of Applied Physiology",
            published_year=2025,
            abstract="Updated full abstract with clean methodology.",
            full_text="Updated full text with complete data.",
            is_open_access=True,
        )
    ]
    reopen_resp = await client.post(
        "/api/v1/curator/candidates/from-doi",
        headers=_auth_headers(curator_token),
        json={"doi_or_url": "10.9999/reopen.meta.2025", "allow_reopen": True},
    )
    assert reopen_resp.status_code == 201
    reopened = reopen_resp.json()
    assert reopened["id"] == candidate_id
    assert reopened["title"] == "Authoritative Updated Study Title"
    assert reopened["source_url"] == "https://pubmed.ncbi.nlm.nih.gov/88880002/"
    assert reopened["authors"] == ["Authoritative A", "Authoritative B"]
    assert reopened["journal"] == "Journal of Applied Physiology"
    assert reopened["published_year"] == 2025
    assert reopened["pmid"] == "88880002"
    assert reopened["pmcid"] == "PMC8888000"
    assert reopened["origin"] == "manual_upload"

    approve_resp = await client.post(
        f"/api/v1/curator/candidates/{candidate_id}/approve",
        headers=_auth_headers(curator_token),
        json={"evidence_level": "rct", "tags": ["reopen"]},
    )
    assert approve_resp.status_code == 201
    card = approve_resp.json()
    assert card["title"] == "Authoritative Updated Study Title"
    assert card["source_url"] == "https://pubmed.ncbi.nlm.nih.gov/88880002/"


@pytest.mark.asyncio
async def test_curator_pdf_uploads_use_canonical_keys_ignoring_traversal_filename(
    client: AsyncClient,
    seed_accounts,
    fake_binary_storage,
) -> None:
    _, curator_token = seed_accounts["curator"]
    pdf_bytes = _make_pdf_bytes(
        "Canonical key verification study on hypertrophy and progressive overload."
    )

    from_pdf_resp = await client.post(
        "/api/v1/curator/candidates/from-pdf",
        headers=_auth_headers(curator_token),
        files={"file": ("../../evil/a.pdf", pdf_bytes, "application/pdf")},
        data={"title": "Canonical PDF Study"},
    )
    assert from_pdf_resp.status_code == 201
    cand = from_pdf_resp.json()
    assert cand["pdf_storage_path"] is not None
    assert cand["pdf_storage_path"].startswith("curator-pdfs/manual/")
    assert cand["pdf_storage_path"].endswith(".pdf")
    assert "evil" not in cand["pdf_storage_path"]
    assert ".." not in cand["pdf_storage_path"]
    assert cand["pdf_storage_path"] in fake_binary_storage.curator_pdfs

    # Now upload a new PDF to the pending candidate with traversal filename
    updated_pdf = _make_pdf_bytes(
        "Updated canonical key verification study with full protocol details."
    )
    upload_resp = await client.post(
        f"/api/v1/curator/candidates/{cand['id']}/upload-pdf",
        headers=_auth_headers(curator_token),
        files={"file": ("../../evil/a.pdf", updated_pdf, "application/pdf")},
    )
    assert upload_resp.status_code == 200
    updated_cand = upload_resp.json()
    assert updated_cand["pdf_storage_path"].startswith(f"curator-pdfs/candidates/{cand['id']}/")
    assert updated_cand["pdf_storage_path"].endswith(".pdf")
    assert "evil" not in updated_cand["pdf_storage_path"]
    assert ".." not in updated_cand["pdf_storage_path"]
    assert updated_cand["pdf_storage_path"] in fake_binary_storage.curator_pdfs


@pytest.mark.asyncio
async def test_curator_rejects_pdf_exceeding_max_pages_and_max_size_on_from_pdf(
    client: AsyncClient,
    seed_accounts,
) -> None:
    import pymupdf

    from fitness_coach.domain.knowledge import MAX_PDF_PAGES, MAX_PDF_SIZE_BYTES
    from fitness_coach.infrastructure.scientific.pdf_extractor import extract_pdf_text

    _, curator_token = seed_accounts["curator"]

    # 1. PDF with > MAX_PDF_PAGES pages -> 400
    doc = pymupdf.open()
    for i in range(MAX_PDF_PAGES + 1):
        page = doc.new_page()
        if i == 0:
            page.insert_textbox(pymupdf.Rect(50, 50, 540, 750), "Study page 1 text content.")
    too_many_pages_pdf = doc.tobytes()
    doc.close()

    pages_resp = await client.post(
        "/api/v1/curator/candidates/from-pdf",
        headers=_auth_headers(curator_token),
        files={"file": ("many_pages.pdf", too_many_pages_pdf, "application/pdf")},
    )
    assert pages_resp.status_code == 400
    assert str(MAX_PDF_PAGES) in pages_resp.json()["detail"]

    # 2. PDF > 15 MB on /from-pdf -> 400 with "tamaño" in detail
    oversized_pdf = b"%PDF-1.4\n" + (b"0" * (MAX_PDF_SIZE_BYTES + 1024))
    size_resp = await client.post(
        "/api/v1/curator/candidates/from-pdf",
        headers=_auth_headers(curator_token),
        files={"file": ("huge.pdf", oversized_pdf, "application/pdf")},
    )
    assert size_resp.status_code == 400
    assert "tamaño" in size_resp.json()["detail"].lower()

    # 3. Character cap stops extraction at max_chars
    long_doc = pymupdf.open()
    for _ in range(3):
        p = long_doc.new_page()
        p.insert_textbox(pymupdf.Rect(50, 50, 540, 750), "A" * 200)
    long_pdf = long_doc.tobytes()
    long_doc.close()

    capped = extract_pdf_text(long_pdf, max_chars=250)
    assert len(capped) <= 250
