"""Tests for production adapters: AI provider, HTTP scientific sources & Supabase Storage."""

from __future__ import annotations

import json

import httpx
import pytest

from fitness_coach.application.ports.ai_provider import ModelTier
from fitness_coach.infrastructure.ai.provider import build_ai_provider
from fitness_coach.infrastructure.config import Settings


@pytest.mark.asyncio
async def test_ai_provider_decouples_embedding_api_key_from_chat_provider() -> None:
    captured_requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured_requests.append(request)
        if "batchEmbedContents" in str(request.url):
            return httpx.Response(
                200,
                json={"embeddings": [{"values": [0.1, 0.2, 0.3]}]},
            )
        if str(request.url).endswith("/embeddings"):
            return httpx.Response(
                200,
                json={"data": [{"embedding": [0.4, 0.5, 0.6]}]},
            )
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)

    # Chat = Anthropic, Embeddings = Google AI Studio (Gemini)
    settings_gem = Settings(
        ai_provider="anthropic",
        anthropic_api_key="ant-secret-key",
        embedding_provider="google_ai_studio",
        embedding_model="text-embedding-004",
        google_api_key="gem-secret-key",
    )
    provider_gem = build_ai_provider(settings_gem, transport=transport)
    embs_gem = await provider_gem.embed_texts(["hipertrofia"])
    assert len(embs_gem) == 1
    assert embs_gem[0].vector == [0.1, 0.2, 0.3]
    assert "key=gem-secret-key" in str(captured_requests[-1].url)
    assert "ant-secret-key" not in str(captured_requests[-1].url)

    # Chat = Anthropic, Embeddings = OpenAI
    settings_oai = Settings(
        ai_provider="anthropic",
        anthropic_api_key="ant-secret-key",
        embedding_provider="openai",
        embedding_model="text-embedding-3-small",
        openai_api_key="oai-secret-key",
    )
    provider_oai = build_ai_provider(settings_oai, transport=transport)
    embs_oai = await provider_oai.embed_texts(["volumen semanal"])
    assert len(embs_oai) == 1
    assert embs_oai[0].vector == [0.4, 0.5, 0.6]
    assert captured_requests[-1].headers.get("authorization") == "Bearer oai-secret-key"


@pytest.mark.asyncio
async def test_anthropic_generate_supports_json_schema_and_structured_data() -> None:
    captured_bodies: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured_bodies.append(json.loads(request.content.decode("utf-8")))
        return httpx.Response(
            200,
            json={
                "content": [
                    {
                        "type": "text",
                        "text": (
                            '```json\n{"suggested_evidence_level": "meta_analysis", '
                            '"curated_summary_es": "Resumen sólido"}\n```'
                        ),
                    }
                ]
            },
        )

    transport = httpx.MockTransport(handler)
    settings = Settings(
        ai_provider="anthropic",
        ai_fast_model="claude-3-5-haiku-latest",
        ai_reasoning_model="claude-3-7-sonnet-latest",
        anthropic_api_key="ant-secret-key",
    )
    provider = build_ai_provider(settings, transport=transport)
    resp = await provider.generate(
        tier=ModelTier.REASONING,
        system_prompt="Eres un analista crítico.",
        user_prompt="Analiza este estudio.",
        json_schema={"type": "object", "title": "CriticalSheet6Blocks"},
    )
    assert resp.structured_data["suggested_evidence_level"] == "meta_analysis"
    assert resp.structured_data["curated_summary_es"] == "Resumen sólido"
    assert "JSON" in captured_bodies[0]["system"]


@pytest.mark.asyncio
async def test_http_scientific_sources_adapter_search_fetch_doi_and_live_search() -> None:
    from datetime import date

    from fitness_coach.infrastructure.scientific_sources.http_adapter import (
        HttpScientificSourcesAdapter,
    )

    pubmed_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <PubmedArticleSet>
      <PubmedArticle>
        <MedlineCitation>
          <PMID>39000001</PMID>
          <Article>
            <Journal><Title>Sports Medicine</Title></Journal>
            <ArticleTitle>Resistance Training Volume Paywall Trial</ArticleTitle>
            <Abstract>
              <AbstractText>Abstract only paywalled study on weekly sets.</AbstractText>
            </Abstract>
            <AuthorList>
              <Author><LastName>Schoenfeld</LastName><Initials>BJ</Initials></Author>
            </AuthorList>
            <JournalIssue><PubDate><Year>2025</Year></PubDate></JournalIssue>
          </Article>
        </MedlineCitation>
        <PubmedData>
          <ArticleIdList>
            <ArticleId IdType="doi">10.1007/s40279-025-paywall</ArticleId>
          </ArticleIdList>
        </PubmedData>
      </PubmedArticle>
    </PubmedArticleSet>"""

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "ebi.ac.uk/europepmc/webservices/rest/search" in url:
            if "10.1007/s40279-025-oa" in url or "hypertrophy" in url:
                return httpx.Response(
                    200,
                    json={
                        "resultList": {
                            "result": [
                                {
                                    "title": "Open Access Hypertrophy Meta-Analysis",
                                    "doi": "10.1007/s40279-025-oa",
                                    "pmid": "39000002",
                                    "pmcid": "PMC1234567",
                                    "authorString": "Robinson ZP, Pelland JC",
                                    "journalTitle": "Sports Medicine - Open",
                                    "pubYear": "2025",
                                    "abstractText": "Open access abstract text.",
                                    "isOpenAccess": "Y",
                                }
                            ]
                        }
                    },
                )
            return httpx.Response(200, json={"resultList": {"result": []}})
        if "ebi.ac.uk/europepmc/webservices/rest/PMC1234567/fullTextXML" in url:
            return httpx.Response(
                200,
                text=(
                    "<article><body>"
                    "<p>Full open access text with n=240 trained subjects.</p>"
                    "</body></article>"
                ),
            )
        if "eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi" in url:
            return httpx.Response(200, json={"esearchresult": {"idlist": ["39000001"]}})
        if "eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi" in url:
            return httpx.Response(200, text=pubmed_xml)
        if (
            "api.crossref.org/works/10.51224%2Fsrxiv.500" in url
            or "api.crossref.org/works/10.51224/srxiv.500" in url
        ):
            return httpx.Response(
                200,
                json={
                    "message": {
                        "title": ["SportRxiv Preprint on Lengthened Partials"],
                        "DOI": "10.51224/srxiv.500",
                        "URL": "https://doi.org/10.51224/srxiv.500",
                        "container-title": ["SportRxiv"],
                        "author": [{"family": "Wolf", "given": "Milo"}],
                        "published": {"date-parts": [[2025, 3, 1]]},
                        "abstract": (
                            "<jats:p>Preprint comparing lengthened partials vs full ROM.</jats:p>"
                        ),
                    }
                },
            )
        if "api.crossref.org/works" in url:
            return httpx.Response(
                200,
                json={
                    "message": {
                        "items": [
                            {
                                "title": ["SportRxiv Preprint on Lengthened Partials"],
                                "DOI": "10.51224/srxiv.500",
                                "URL": "https://doi.org/10.51224/srxiv.500",
                                "container-title": ["SportRxiv"],
                                "author": [{"family": "Wolf", "given": "Milo"}],
                                "published": {"date-parts": [[2025, 3, 1]]},
                                "abstract": (
                                    "<jats:p>Preprint comparing lengthened partials "
                                    "vs full ROM.</jats:p>"
                                ),
                            }
                        ]
                    }
                },
            )
        return httpx.Response(404)

    adapter = HttpScientificSourcesAdapter(transport=httpx.MockTransport(handler))

    # 1. search_literature aggregates PubMed, Europe PMC (with OA full text), and SportRxiv/Crossref
    records = await adapter.search_literature(
        query="hypertrophy",
        date_from=date(2025, 1, 1),
        date_to=date(2025, 12, 31),
        max_results=10,
    )
    dois = {r.doi for r in records}
    assert "10.1007/s40279-025-oa" in dois
    assert "10.1007/s40279-025-paywall" in dois
    assert "10.51224/srxiv.500" in dois

    oa_rec = next(r for r in records if r.doi == "10.1007/s40279-025-oa")
    assert oa_rec.is_open_access is True
    assert oa_rec.full_text is not None and "n=240" in oa_rec.full_text

    paywall_rec = next(r for r in records if r.doi == "10.1007/s40279-025-paywall")
    assert paywall_rec.is_open_access is False
    assert paywall_rec.full_text is None
    assert paywall_rec.abstract is not None

    # 2. fetch_by_doi resolves via Europe PMC / Crossref
    fetched = await adapter.fetch_by_doi("10.51224/srxiv.500")
    assert fetched is not None
    assert fetched.title == "SportRxiv Preprint on Lengthened Partials"
    assert fetched.source_name == "SportRxiv"

    # 3. live_web_search returns quarantined LiveSearchHit items
    hits = await adapter.live_web_search(query="hypertrophy", max_results=3)
    assert len(hits) >= 1
    assert hits[0].doi == "10.1007/s40279-025-oa"


@pytest.mark.asyncio
async def test_supabase_binary_storage_adapter_roundtrip_and_athlete_isolation() -> None:
    from uuid import uuid4

    from fitness_coach.domain.identity import ForbiddenError
    from fitness_coach.infrastructure.storage.supabase_storage import SupabaseBinaryStorageAdapter

    store: dict[str, bytes] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("authorization") == "Bearer svc-role-key"
        assert request.headers.get("apikey") == "svc-role-key"
        path = request.url.path
        if request.method == "POST":
            store[path] = request.content
            return httpx.Response(200, json={"Key": path})
        if request.method == "GET":
            if path not in store:
                return httpx.Response(404)
            return httpx.Response(200, content=store[path])
        if request.method == "DELETE":
            store.pop(path, None)
            return httpx.Response(200, json={"message": "Deleted"})
        return httpx.Response(405)

    storage = SupabaseBinaryStorageAdapter(
        supabase_url="https://demo.supabase.co",
        service_role_key="svc-role-key",
        transport=httpx.MockTransport(handler),
    )

    athlete_a = uuid4()
    athlete_b = uuid4()

    key = await storage.put_athlete_object(
        athlete_id=athlete_a,
        relative_path="attachments/meal.jpg",
        data=b"jpeg-bytes",
        content_type="image/jpeg",
    )
    assert key == f"{athlete_a}/attachments/meal.jpg"
    assert await storage.get_athlete_object(athlete_id=athlete_a, storage_path=key) == b"jpeg-bytes"

    # Cross-athlete access blocked before hitting storage
    with pytest.raises(ForbiddenError):
        await storage.get_athlete_object(athlete_id=athlete_b, storage_path=key)

    await storage.delete_athlete_object(athlete_id=athlete_a, storage_path=key)
    with pytest.raises(FileNotFoundError):
        await storage.get_athlete_object(athlete_id=athlete_a, storage_path=key)

    # Curator PDF bucket roundtrip
    pdf_key = await storage.put_curator_pdf(relative_path="study.pdf", data=b"%PDF-1.4")
    assert await storage.get_curator_pdf(storage_path=pdf_key) == b"%PDF-1.4"


@pytest.mark.asyncio
async def test_create_app_wires_production_adapters_by_default() -> None:
    from fitness_coach.infrastructure.api.main import create_app
    from fitness_coach.infrastructure.scientific_sources.http_adapter import (
        HttpScientificSourcesAdapter,
    )
    from fitness_coach.infrastructure.storage.local_storage import InMemoryBinaryStorage
    from fitness_coach.infrastructure.storage.supabase_storage import SupabaseBinaryStorageAdapter

    dev_app = create_app(settings=Settings(environment="development"))
    assert isinstance(dev_app.state.scientific_sources, HttpScientificSourcesAdapter)
    assert isinstance(dev_app.state.binary_storage, InMemoryBinaryStorage)

    prod_app = create_app(
        settings=Settings(
            environment="production",
            supabase_jwt_secret="real-production-secret-at-least-32-chars",
            supabase_url="https://demo.supabase.co",
            supabase_service_role_key="svc-role-key",
        )
    )
    assert isinstance(prod_app.state.scientific_sources, HttpScientificSourcesAdapter)
    assert isinstance(prod_app.state.binary_storage, SupabaseBinaryStorageAdapter)


def test_settings_default_google_models_are_current() -> None:
    settings = Settings(_env_file=None)
    assert settings.ai_provider == "google_ai_studio"
    assert settings.ai_fast_model == "gemini-3.6-flash"
    assert settings.ai_reasoning_model == "gemini-4-hydrogen"
    assert settings.embedding_model == "gemini-embedding-001"


@pytest.mark.asyncio
async def test_google_ai_studio_error_redacts_api_key_and_surfaces_detail() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            404,
            json={
                "error": {
                    "code": 404,
                    "message": "models/gemini-3.1-pro is not found for API version v1beta",
                    "status": "NOT_FOUND",
                }
            },
        )

    transport = httpx.MockTransport(handler)
    settings = Settings(
        _env_file=None,
        ai_provider="google_ai_studio",
        ai_reasoning_model="gemini-3.1-pro",
        embedding_provider="google_ai_studio",
        embedding_model="text-embedding-004",
        google_api_key="super-secret-google-key",
    )
    provider = build_ai_provider(settings, transport=transport)

    with pytest.raises(RuntimeError) as gen_exc:
        await provider.generate(
            tier=ModelTier.REASONING,
            system_prompt="Coach",
            user_prompt="Hola",
        )
    assert "super-secret-google-key" not in str(gen_exc.value)
    assert "404" in str(gen_exc.value)
    assert "not found" in str(gen_exc.value)

    with pytest.raises(RuntimeError) as emb_exc:
        await provider.embed_texts(["Hola"])
    assert "super-secret-google-key" not in str(emb_exc.value)
    assert "404" in str(emb_exc.value)


