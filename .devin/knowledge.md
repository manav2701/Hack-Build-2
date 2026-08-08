# Devin Knowledge Base & Rules — Dalal Project

## Architecture & Coding Guidelines

1. **Routes never contain business logic**:
   - All API endpoints in `apps/api/app/api/routes/` must delegate directly to domain services (`services/` or `adapters/`).

2. **Adapters never raise exceptions**:
   - Every source adapter (`adapters/sources/*.py`) MUST inherit from `SourceAdapter` and catch internal exceptions, returning `SourceResult(status='failed', error=str(exc))`.

3. **Separate Spoken Output from Visual Data**:
   - `Verdict.spoken_summary` MUST remain under 60 words for low-latency natural TTS reading.

4. **Testing Discipline**:
   - Every external service dependency MUST have a JSON fixture in `tests/fixtures/`.
   - Never call external live APIs during automated test runs. Use `USE_FIXTURES=true`.

5. **Monorepo Conventions**:
   - Backend logic lives in `apps/api`.
   - Frontend React/Next.js lives in `apps/web`.
   - Keep commits granular and scoped to a single workspace component per PR.
