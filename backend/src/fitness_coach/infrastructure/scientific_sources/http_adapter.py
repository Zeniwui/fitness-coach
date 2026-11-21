"""Production ScientificSourcesPort HTTP adapter (PubMed, Europe PMC, Crossref, SportRxiv).

Respects clean timeouts, detects open-access full text vs abstract-only paywall, and degrades
gracefully if an upstream scientific source is temporarily unavailable.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import date
from typing import Any
from urllib.parse import quote

import httpx

from fitness_coach.application.ports.scientific_sources import (
    LiveSearchHit,
    ScientificArticleRecord,
)

_TAG_RE = re.compile(r"<[^>]+>")


def _strip_tags(raw: str | None) -> str | None:
    if not raw:
        return None
    cleaned = " ".join(_TAG_RE.sub(" ", raw).split()).strip()
    return cleaned or None


def _parse_int(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


class HttpScientificSourcesAdapter:
    """Async httpx adapter implementing ScientificSourcesPort across primary literature APIs."""

    EUROPE_PMC_BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest"
    PUBMED_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
    CROSSREF_BASE = "https://api.crossref.org"

    def __init__(
        self,
        *,
        timeout_seconds: float = 20.0,
        user_agent: str = "FitnessCoach/0.1 (mailto:curator@fitness-coach.app)",
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._timeout = timeout_seconds
        self._headers = {"User-Agent": user_agent}
        self._transport = transport

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=self._timeout,
            headers=self._headers,
            transport=self._transport,
            follow_redirects=True,
        )

    async def search_literature(
        self,
        *,
        query: str,
        date_from: date | None = None,
        date_to: date | None = None,
        max_results: int = 50,
    ) -> list[ScientificArticleRecord]:
        per_source = max(5, min(max_results, 25))
        records: list[ScientificArticleRecord] = []

        async with self._client() as client:
            epmc_records = await self._search_europe_pmc(
                client=client,
                query=query,
                date_from=date_from,
                date_to=date_to,
                limit=per_source,
            )
            records.extend(epmc_records)

            pubmed_records = await self._search_pubmed(
                client=client,
                query=query,
                date_from=date_from,
                date_to=date_to,
                limit=per_source,
            )
            records.extend(pubmed_records)

            crossref_records = await self._search_crossref_and_sportrxiv(
                client=client,
                query=query,
                date_from=date_from,
                date_to=date_to,
                limit=per_source,
            )
            records.extend(crossref_records)

        return self._deduplicate_records(records)[:max_results]

    async def fetch_by_doi(self, doi: str) -> ScientificArticleRecord | None:
        clean_doi = doi.strip()
        if not clean_doi:
            return None

        async with self._client() as client:
            # 1. Try Europe PMC first (gives PMID, PMCID, OA status & full text XML)
            epmc = await self._search_europe_pmc(
                client=client,
                query=f'DOI:"{clean_doi}"',
                date_from=None,
                date_to=None,
                limit=1,
            )
            if epmc:
                return epmc[0]

            # 2. Fallback to Crossref (covers SportRxiv 10.51224/* and publisher DOIs)
            return await self._fetch_crossref_doi(client=client, doi=clean_doi)

    async def live_web_search(self, *, query: str, max_results: int = 5) -> list[LiveSearchHit]:
        """Quarantined live search over Europe PMC & Crossref for recent studies/preprints."""
        hits: list[LiveSearchHit] = []
        async with self._client() as client:
            records = await self._search_europe_pmc(
                client=client,
                query=query,
                date_from=None,
                date_to=None,
                limit=max_results,
                fetch_full_text=False,
            )
            if len(records) < max_results:
                records.extend(
                    await self._search_crossref_and_sportrxiv(
                        client=client,
                        query=query,
                        date_from=None,
                        date_to=None,
                        limit=max_results,
                    )
                )
        for rec in self._deduplicate_records(records)[:max_results]:
            snippet = (rec.abstract or rec.title)[:500]
            hits.append(
                LiveSearchHit(
                    title=rec.title,
                    url=rec.source_url,
                    snippet=snippet,
                    doi=rec.doi,
                    pmid=rec.pmid,
                    published_year=rec.published_year,
                )
            )
        return hits

    async def _search_europe_pmc(
        self,
        *,
        client: httpx.AsyncClient,
        query: str,
        date_from: date | None,
        date_to: date | None,
        limit: int,
        fetch_full_text: bool = True,
    ) -> list[ScientificArticleRecord]:
        q = query.strip()
        if date_from and date_to:
            q = f"({q}) AND FIRST_PDATE:[{date_from.isoformat()} TO {date_to.isoformat()}]"
        elif date_from:
            q = f"({q}) AND FIRST_PDATE:[{date_from.isoformat()} TO 2999-12-31]"
        try:
            resp = await client.get(
                f"{self.EUROPE_PMC_BASE}/search",
                params={"query": q, "format": "json", "resultType": "core", "pageSize": limit},
            )
            if resp.status_code != 200:
                return []
            items = resp.json().get("resultList", {}).get("result", [])
        except (httpx.HTTPError, ValueError):
            return []

        records: list[ScientificArticleRecord] = []
        for item in items:
            title = str(item.get("title") or "").strip().rstrip(".")
            if not title:
                continue
            doi = str(item.get("doi") or "").strip() or None
            pmid = str(item.get("pmid") or "").strip() or None
            pmcid = str(item.get("pmcid") or "").strip() or None
            is_oa_flag = str(item.get("isOpenAccess") or "").upper() == "Y"
            abstract = _strip_tags(item.get("abstractText"))
            authors_raw = str(item.get("authorString") or "")
            authors = [a.strip().rstrip(".") for a in authors_raw.split(",") if a.strip()]
            journal = str(item.get("journalTitle") or "").strip() or None
            pub_year = _parse_int(item.get("pubYear"))

            full_text: str | None = None
            if fetch_full_text and is_oa_flag and pmcid:
                full_text = await self._fetch_europe_pmc_full_text(client=client, pmcid=pmcid)

            is_open_access = bool(is_oa_flag and full_text)
            if doi:
                source_url = f"https://doi.org/{doi}"
            elif pmid:
                source_url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
            elif pmcid:
                source_url = f"https://europepmc.org/article/PMC/{pmcid}"
            else:
                source_url = "https://europepmc.org/"

            records.append(
                ScientificArticleRecord(
                    title=title,
                    source_name="Europe PMC",
                    source_url=source_url,
                    doi=doi,
                    pmid=pmid,
                    pmcid=pmcid,
                    authors=authors,
                    journal=journal,
                    published_year=pub_year,
                    abstract=abstract,
                    full_text=full_text,
                    is_open_access=is_open_access,
                )
            )
        return records

    async def _fetch_europe_pmc_full_text(
        self, *, client: httpx.AsyncClient, pmcid: str
    ) -> str | None:
        try:
            resp = await client.get(f"{self.EUROPE_PMC_BASE}/{pmcid}/fullTextXML")
            if resp.status_code != 200 or not resp.text.strip():
                return None
            return _strip_tags(resp.text)
        except httpx.HTTPError:
            return None

    async def _search_pubmed(
        self,
        *,
        client: httpx.AsyncClient,
        query: str,
        date_from: date | None,
        date_to: date | None,
        limit: int,
    ) -> list[ScientificArticleRecord]:
        params: dict[str, Any] = {
            "db": "pubmed",
            "term": query.strip(),
            "retmode": "json",
            "retmax": limit,
        }
        if date_from:
            params["mindate"] = date_from.strftime("%Y/%m/%d")
            params["datetype"] = "pdat"
        if date_to:
            params["maxdate"] = date_to.strftime("%Y/%m/%d")
            params["datetype"] = "pdat"

        try:
            search_resp = await client.get(f"{self.PUBMED_BASE}/esearch.fcgi", params=params)
            if search_resp.status_code != 200:
                return []
            pmids = search_resp.json().get("esearchresult", {}).get("idlist", [])
            if not pmids:
                return []
            fetch_resp = await client.get(
                f"{self.PUBMED_BASE}/efetch.fcgi",
                params={"db": "pubmed", "id": ",".join(pmids), "retmode": "xml"},
            )
            if fetch_resp.status_code != 200:
                return []
            return self._parse_pubmed_xml(fetch_resp.text)
        except (httpx.HTTPError, ValueError, ET.ParseError):
            return []

    def _parse_pubmed_xml(self, xml_text: str) -> list[ScientificArticleRecord]:
        root = ET.fromstring(xml_text)
        records: list[ScientificArticleRecord] = []
        for article_el in root.findall(".//PubmedArticle"):
            pmid = (article_el.findtext(".//MedlineCitation/PMID") or "").strip() or None
            title = "".join(
                article_el.find(".//ArticleTitle").itertext()
                if article_el.find(".//ArticleTitle") is not None
                else []
            ).strip().rstrip(".")
            if not title:
                continue

            abstract_parts = [
                "".join(el.itertext()).strip()
                for el in article_el.findall(".//Abstract/AbstractText")
                if "".join(el.itertext()).strip()
            ]
            abstract = " ".join(abstract_parts) or None
            journal = (article_el.findtext(".//Journal/Title") or "").strip() or None
            pub_year = _parse_int(article_el.findtext(".//JournalIssue/PubDate/Year"))

            authors: list[str] = []
            for author_el in article_el.findall(".//AuthorList/Author"):
                last = (author_el.findtext("LastName") or "").strip()
                initials = (author_el.findtext("Initials") or "").strip()
                if last:
                    authors.append(f"{last} {initials}".strip())

            doi: str | None = None
            pmcid: str | None = None
            for aid in article_el.findall(".//PubmedData/ArticleIdList/ArticleId"):
                id_type = aid.attrib.get("IdType")
                val = (aid.text or "").strip()
                if id_type == "doi" and val:
                    doi = val
                elif id_type == "pmc" and val:
                    pmcid = val

            source_url = (
                f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
                if pmid
                else (f"https://doi.org/{doi}" if doi else "https://pubmed.ncbi.nlm.nih.gov/")
            )
            records.append(
                ScientificArticleRecord(
                    title=title,
                    source_name="PubMed",
                    source_url=source_url,
                    doi=doi,
                    pmid=pmid,
                    pmcid=pmcid,
                    authors=authors,
                    journal=journal,
                    published_year=pub_year,
                    abstract=abstract,
                    full_text=None,
                    is_open_access=False,
                )
            )
        return records

    async def _search_crossref_and_sportrxiv(
        self,
        *,
        client: httpx.AsyncClient,
        query: str,
        date_from: date | None,
        date_to: date | None,
        limit: int,
    ) -> list[ScientificArticleRecord]:
        params: dict[str, Any] = {"query": query.strip(), "rows": limit}
        filters: list[str] = []
        if date_from:
            filters.append(f"from-pub-date:{date_from.isoformat()}")
        if date_to:
            filters.append(f"until-pub-date:{date_to.isoformat()}")
        if filters:
            params["filter"] = ",".join(filters)

        try:
            resp = await client.get(f"{self.CROSSREF_BASE}/works", params=params)
            if resp.status_code != 200:
                return []
            items = resp.json().get("message", {}).get("items", [])
        except (httpx.HTTPError, ValueError):
            return []

        return [rec for item in items if (rec := self._parse_crossref_item(item)) is not None]

    async def _fetch_crossref_doi(
        self, *, client: httpx.AsyncClient, doi: str
    ) -> ScientificArticleRecord | None:
        try:
            resp = await client.get(f"{self.CROSSREF_BASE}/works/{quote(doi, safe='')}")
            if resp.status_code != 200:
                return None
            message = resp.json().get("message")
            if not isinstance(message, dict):
                return None
            return self._parse_crossref_item(message)
        except (httpx.HTTPError, ValueError):
            return None

    def _parse_crossref_item(self, item: dict[str, Any]) -> ScientificArticleRecord | None:
        titles = item.get("title") or []
        title = str(titles[0]).strip() if titles else ""
        if not title:
            return None
        doi = str(item.get("DOI") or "").strip() or None
        containers = item.get("container-title") or []
        journal = str(containers[0]).strip() if containers else None
        is_sportrxiv = bool(
            (doi and doi.lower().startswith("10.51224/"))
            or (journal and "sportrxiv" in journal.lower())
        )
        source_name = "SportRxiv" if is_sportrxiv else "Crossref"
        source_url = str(item.get("URL") or "").strip() or (
            f"https://doi.org/{doi}" if doi else "https://api.crossref.org/"
        )

        authors: list[str] = []
        for a in item.get("author") or []:
            family = str(a.get("family") or "").strip()
            given = str(a.get("given") or "").strip()
            if family:
                authors.append(f"{family} {given}".strip())

        pub_year: int | None = None
        for key in ("published", "published-print", "published-online", "created"):
            parts = (item.get(key) or {}).get("date-parts") or []
            if parts and parts[0]:
                pub_year = _parse_int(parts[0][0])
                if pub_year:
                    break

        abstract = _strip_tags(item.get("abstract"))
        return ScientificArticleRecord(
            title=title,
            source_name=source_name,
            source_url=source_url,
            doi=doi,
            pmid=None,
            pmcid=None,
            authors=authors,
            journal=journal or ("SportRxiv" if is_sportrxiv else None),
            published_year=pub_year,
            abstract=abstract,
            full_text=None,
            is_open_access=False,
        )

    @staticmethod
    def _deduplicate_records(
        records: list[ScientificArticleRecord],
    ) -> list[ScientificArticleRecord]:
        seen: dict[str, ScientificArticleRecord] = {}
        order: list[str] = []
        for rec in records:
            key = (
                f"doi:{rec.doi.strip().lower()}"
                if rec.doi
                else (
                    f"pmid:{rec.pmid.strip()}"
                    if rec.pmid
                    else f"title:{rec.title.strip().lower()}"
                )
            )
            existing = seen.get(key)
            if existing is None:
                seen[key] = rec
                order.append(key)
            elif not existing.is_open_access and rec.is_open_access:
                seen[key] = rec
        return [seen[k] for k in order]
