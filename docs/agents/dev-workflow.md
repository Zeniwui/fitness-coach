# Development & Agent Workflow

Operational gotchas and verification commands that config files do not state on their own.

## Local environment check (Windows / Docker)

Before running backend integration tests, confirm PostgreSQL (`pgvector/pgvector:pg16`) is reachable on `localhost:5432`:

```powershell
docker compose up -d postgres
```

## Parallel worktrees & isolated test databases

Multiple worktrees share the single Docker PostgreSQL container on `localhost:5432`. When running `pytest` in a worktree concurrently with another worktree, point `DATABASE_URL` to a dedicated database (e.g. `fitness_coach_test_<ticket>`) so migrations and truncations do not collide.

## Migrations (single Alembic head)

CI enforces a single Alembic head (`alembic heads`). When merging parallel branches that each added a migration, linearize `down_revision` so `alembic heads` prints exactly one revision.

## OpenAPI contract sync

Whenever FastAPI request/response schemas or routes change:

```powershell
cd backend; .\.venv\Scripts\python.exe scripts/export_openapi.py --output openapi.json
cd ..\frontend; npm run api:generate
```

## Architecture seams

- **Backend ports**: `backend/src/fitness_coach/domain/ports/` (`AIProviderPort`, `ScientificSourcesPort`, `IdentityVerifierPort`, `BinaryStoragePort`). Production wiring lives in `backend/src/fitness_coach/infrastructure/api/main.py` and `backend/src/fitness_coach/infrastructure/cli/monthly_cut.py`.
- **Frontend HTTP client**: Always use `apiClient` or `coldStartAwareFetch` from `frontend/src/api/client.ts` (ESLint blocks raw `fetch()` in app/feature code so Render cold starts surface `ColdStartBanner`).
