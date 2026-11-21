# Development & Agent Workflow

Operational gotchas and verification commands that config files do not state on their own.

## Local environment check (Windows / Docker)

- **Shell (Windows PowerShell 5.1)**: chain commands with `;` (not `&&`), use `Get-ChildItem -Recurse` for recursive text searches, and exclude `node_modules`, `.venv`, and `__pycache__` when listing files.
- **Pre-commit guardrail**: enable repo hooks once per clone with `git config core.hooksPath .githooks` (runs staged frontend lint/typecheck and backend ruff checks before commit).
- **PostgreSQL**: before running backend integration tests, confirm `pgvector/pgvector:pg16` is reachable on `localhost:5432`:

```powershell
docker compose up -d postgres
```

## Parallel worktrees, dependencies & isolated test databases

- Multiple worktrees share the single Docker PostgreSQL container on `localhost:5432`. When running `pytest` in a worktree concurrently with another worktree, point `DATABASE_URL` to a dedicated database (e.g. `fitness_coach_test_<ticket>`) so migrations and truncations do not collide.
- Shared git worktrees do **not** inherit untracked files or `frontend/node_modules`. Confirm target files are tracked (`git ls-files <path>`) before delegating worktree edits, and run `npm ci` in `frontend/` inside a fresh worktree and in the main workspace after merging `package-lock.json` changes.

## Migrations (single Alembic head)

CI enforces a single Alembic head (`alembic heads`). When merging parallel branches that each added a migration, linearize `down_revision` so `alembic heads` prints exactly one revision.

## OpenAPI contract sync

Whenever FastAPI request/response schemas or routes change:

```powershell
cd backend; .\.venv\Scripts\python.exe scripts/export_openapi.py --output openapi.json
cd ..\frontend; npm run api:generate
```

## Architecture seams

- **Backend ports**: `backend/src/fitness_coach/application/ports/` (`AIProviderPort`, `ScientificSourcesPort`, `IdentityVerifierPort`, `BinaryStoragePort`). Production wiring lives in `backend/src/fitness_coach/infrastructure/api/main.py` and `backend/src/fitness_coach/infrastructure/cli/monthly_cut.py`.
- **Frontend HTTP client**: Always use `apiClient`, `coldStartAwareFetch`, and `extractApiErrorDetail` from `frontend/src/api/client.ts` (ESLint blocks raw `fetch()` in app/feature code so Render cold starts surface `ColdStartBanner`).
