"""Seam 2 Fake: Fixture-backed Scientific Sources & Live Web Search."""

from __future__ import annotations

from datetime import date

from fitness_coach.application.ports.scientific_sources import (
    LiveSearchHit,
    ScientificArticleRecord,
)


class FakeScientificSources:
    """Deterministic offline fake for PubMed, Europe PMC, Crossref, SportRxiv, and live search."""

    def __init__(
        self,
        *,
        articles: list[ScientificArticleRecord] | None = None,
        live_hits: list[LiveSearchHit] | None = None,
    ) -> None:
        self.articles: list[ScientificArticleRecord] = list(articles or [])
        self.live_hits: list[LiveSearchHit] = list(live_hits or [])
        self.fail_next_search: bool = False

    async def search_literature(
        self,
        *,
        query: str,
        date_from: date | None = None,
        date_to: date | None = None,
        max_results: int = 50,
    ) -> list[ScientificArticleRecord]:
        if self.fail_next_search:
            self.fail_next_search = False
            raise RuntimeError("Simulated transient scientific source error")
        return self.articles[:max_results]

    async def fetch_by_doi(self, doi: str) -> ScientificArticleRecord | None:
        normalized = doi.strip().lower()
        for article in self.articles:
            if article.doi and article.doi.strip().lower() == normalized:
                return article
        return None

    async def live_web_search(self, *, query: str, max_results: int = 5) -> list[LiveSearchHit]:
        return self.live_hits[:max_results]
