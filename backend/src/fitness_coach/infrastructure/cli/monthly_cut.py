"""Autonomous CLI runner for Corte Mensual, checkpoint resume & idempotent Seed Batch (#5).

Executed outside the web server (GitHub Actions monthly cron / workflow_dispatch or manual CLI).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import date
from uuid import UUID

from fitness_coach.application.ports.ai_provider import AIProviderPort
from fitness_coach.application.ports.scientific_sources import ScientificSourcesPort
from fitness_coach.application.use_cases.monthly_cut import (
    LoadSeedBatchUseCase,
    ResumeMonthlyCutUseCase,
    RunMonthlyCutUseCase,
    SeedBatchResult,
)
from fitness_coach.domain.monthly_cut import (
    DEFAULT_MAX_CANDIDATES,
    MonthlyCutRun,
    MonthlyCutRunType,
)
from fitness_coach.infrastructure.config import get_settings
from fitness_coach.infrastructure.db.repositories.knowledge import SqlAlchemyKnowledgeRepository
from fitness_coach.infrastructure.db.repositories.monthly_cut import (
    SqlAlchemyMonthlyCutRepository,
)
from fitness_coach.infrastructure.db.session import create_engine, create_session_factory


async def run_cli_monthly_cut(
    *,
    database_url: str,
    ai_provider: AIProviderPort,
    scientific_sources: ScientificSourcesPort,
    date_from: date | None = None,
    date_to: date | None = None,
    query_override: str | None = None,
    max_candidates: int = DEFAULT_MAX_CANDIDATES,
    run_type: MonthlyCutRunType = MonthlyCutRunType.SCHEDULED,
) -> MonthlyCutRun:
    """Execute a Corte Mensual directly against PostgreSQL outside the FastAPI web server."""
    engine = create_engine(database_url)
    session_factory = create_session_factory(engine)
    try:
        async with session_factory() as session:
            mc_repo = SqlAlchemyMonthlyCutRepository(session)
            kb_repo = SqlAlchemyKnowledgeRepository(session)
            use_case = RunMonthlyCutUseCase(
                monthly_cut_repo=mc_repo,
                knowledge_repo=kb_repo,
                ai_provider=ai_provider,
                scientific_sources=scientific_sources,
            )
            return await use_case.execute(
                auth=None,
                run_type=run_type,
                date_from=date_from,
                date_to=date_to,
                query_override=query_override,
                max_candidates=max_candidates,
                commit=session.commit,
            )
    finally:
        await engine.dispose()


async def run_cli_resume(
    *,
    database_url: str,
    run_id: UUID,
    ai_provider: AIProviderPort,
    scientific_sources: ScientificSourcesPort,
) -> MonthlyCutRun:
    """Resume a paused_rate_limit or failed Corte Mensual from its durable checkpoint."""
    engine = create_engine(database_url)
    session_factory = create_session_factory(engine)
    try:
        async with session_factory() as session:
            mc_repo = SqlAlchemyMonthlyCutRepository(session)
            kb_repo = SqlAlchemyKnowledgeRepository(session)
            use_case = ResumeMonthlyCutUseCase(
                monthly_cut_repo=mc_repo,
                knowledge_repo=kb_repo,
                ai_provider=ai_provider,
                scientific_sources=scientific_sources,
            )
            return await use_case.execute(
                auth=None,
                run_id=run_id,
                commit=session.commit,
            )
    finally:
        await engine.dispose()


async def run_cli_seed(*, database_url: str) -> SeedBatchResult:
    """Idempotently load the foundational Seed Batch into pending CandidateStudies."""
    engine = create_engine(database_url)
    session_factory = create_session_factory(engine)
    try:
        async with session_factory() as session:
            mc_repo = SqlAlchemyMonthlyCutRepository(session)
            kb_repo = SqlAlchemyKnowledgeRepository(session)
            return await LoadSeedBatchUseCase(
                monthly_cut_repo=mc_repo,
                knowledge_repo=kb_repo,
            ).execute(auth=None, commit=session.commit)
    finally:
        await engine.dispose()


def _parse_date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m fitness_coach.infrastructure.cli.monthly_cut",
        description="Ejecutor autónomo de Corte Mensual y Lote Semilla (Fitness Coach).",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    run_p = sub.add_parser("run", help="Ejecutar un Corte Mensual programado o bajo demanda")
    run_p.add_argument("--date-from", default=None, help="Fecha inicio (YYYY-MM-DD)")
    run_p.add_argument("--date-to", default=None, help="Fecha fin (YYYY-MM-DD)")
    run_p.add_argument("--query", default=None, help="Consulta científica opcional")
    run_p.add_argument(
        "--max-candidates",
        type=int,
        default=DEFAULT_MAX_CANDIDATES,
        help="Tope de Estudios Candidatos (default: 12)",
    )

    resume_p = sub.add_parser("resume", help="Reanudar un Corte Mensual pausado por cuota")
    resume_p.add_argument("run_id", help="UUID de la ejecución a reanudar")

    sub.add_parser("seed", help="Cargar de forma idempotente el Lote Semilla fundacional")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    settings = get_settings()

    if args.command == "seed":
        result = asyncio.run(run_cli_seed(database_url=settings.database_url))
        print(
            json.dumps(
                {
                    "run_id": str(result.run_id),
                    "total_in_catalog": result.total_in_catalog,
                    "created_count": result.created_count,
                    "skipped_count": result.skipped_count,
                }
            )
        )
        return 0

    raise RuntimeError(
        "Configure AIProviderPort and ScientificSourcesPort adapters in production environment "
        "before invoking 'run' or 'resume' from CLI."
    )


if __name__ == "__main__":
    sys.exit(main())
