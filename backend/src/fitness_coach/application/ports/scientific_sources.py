"""Seam 2: Scientific Sources (PubMed, Europe PMC, Crossref, SportRxiv) & Live Search."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Protocol


@dataclass(frozen=True, slots=True)
class ScientificArticleRecord:
    """Normalized record retrieved from primary scientific literature sources."""

    title: str
    source_name: str
    source_url: str
    doi: str | None = None
    pmid: str | None = None
    pmcid: str | None = None
    authors: list[str] = field(default_factory=list)
    journal: str | None = None
    published_year: int | None = None
    abstract: str | None = None
    full_text: str | None = None
    is_open_access: bool = False


@dataclass(frozen=True, slots=True)
class LiveSearchHit:
    """External live-search result subject to mandatory quarantine."""

    title: str
    url: str
    snippet: str
    doi: str | None = None
    pmid: str | None = None
    published_year: int | None = None


class ScientificSourcesPort(Protocol):
    """Single HTTP boundary for scientific literature collection and live search."""

    async def search_literature(
        self,
        *,
        query: str,
        date_from: date | None = None,
        date_to: date | None = None,
        max_results: int = 50,
    ) -> list[ScientificArticleRecord]: ...

    async def fetch_by_doi(self, doi: str) -> ScientificArticleRecord | None: ...

    async def live_web_search(self, *, query: str, max_results: int = 5) -> list[LiveSearchHit]: ...
