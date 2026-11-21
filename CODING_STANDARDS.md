# Coding Standards

Judgement-call rules for code review. Mechanical checks (Ruff, ESLint `no-restricted-globals`, `glossaryGuard.test.ts`, Alembic single-head, OpenAPI drift, production adapter smoke tests) are enforced by tooling and CI, not repeated here.

## Frontend

- **Decompose multi-workflow pages**: Split a feature screen into per-tab or per-workflow subcomponents once it coordinates more than two independent workflows or grows past ~350 lines (avoid monolithic pages like `TrainingPage.tsx` / `NutritionPage.tsx` absorbing unrelated modals and tabs).
- **Consistent domain language**: Keep all Spanish user-facing copy aligned with `GLOSSARY.md`.

## Backend

- **Provider parity across seams**: When adding or extending a capability on `AIProviderPort` (`json_schema`, `embed_texts`, `stream_text`, multimodal inputs), verify every configured provider (`gemini`, `openai`, `anthropic`) and decoupled API keys — never leave a second provider as a partial stub.
- **Share domain validation helpers**: Extract recurring cross-use-case checks (such as candidate DOI/PMID deduplication or rejection filtering) into a single domain/application helper rather than duplicating branches across use cases.
- **Centralize HTTP error translation**: Prefer FastAPI exception handlers or shared error-mapping helpers over repeating `try / session.rollback() / raise HTTPException` blocks across routers.
- **Production wiring parity**: Never default production (`app_env != "development"`) dependencies to `None` or in-memory fakes; every port in `domain/ports/` must resolve to a real adapter or fail fast at startup.
