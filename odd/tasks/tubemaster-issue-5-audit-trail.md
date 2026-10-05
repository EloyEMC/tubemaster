# TubeMaster issue #5 — privacy-safe operation audit trail slice

## Parent issue

`Gentleman-Programming/tubemaster#5` — Expand TubeMaster from playlist manager into channel operations platform.

## Child issue

`Gentleman-Programming/tubemaster#6` — Add privacy-safe operation audit trail for YouTube workflows.

## Focused slice

Introduce a stable, privacy-safe lifecycle event model for supported YouTube operations without changing public response contracts.

## Scope

- Stable operation start, dry-run, success, and failure event vocabulary.
- Correlation by operation ID and affected channel where available.
- Safe target identifiers, bounded metadata, dry-run state, and typed error codes.
- Logger failure isolation and event ordering tests.
- Metadata, playlist, and transcript workflows incrementally.
- Documentation of event shape and retention/storage behavior.

## Non-goals

- Audit-history UI.
- Durable SQLite audit storage before the event model is proven.
- Secrets, full descriptions, transcript content, or raw provider errors.
- Public CLI/MCP/API response schema changes.

## Allowed edit surfaces

- `src/lib/video-metadata/adapters/logger.ts`
- `src/lib/video-metadata/adapters/logger.test.ts`
- `src/lib/video-metadata/services.ts`
- `src/lib/video-metadata/services.test.ts`
- `src/lib/playlist-management/services.ts`
- `src/lib/playlist-management/services.test.ts`
- `README.md`
- `docs/interfaces.md`
- This task document

## Implementation plan

1. Define an allowlisted logger event/context model with recursive privacy filtering and failure isolation.
2. Instrument metadata, transcript, and playlist service lifecycles with correlated start, dry-run, success, and failure events while preserving existing outputs and guardrails.
3. Add ordering, privacy, logger-failure, provider-failure, dry-run, and guardrail coverage; document the event model and retention behavior.

## Validation

- Focused audit workflow tests.
- Full test suite, TypeScript, lint, and `git diff --check`.
- No route, CLI/MCP, quota-storage, SQLite, or OpenSpec changes.

## Implementation status

Implemented across the allowed source, test, and documentation surfaces. Initial verification was blocked by missing local `tsx`, TypeScript compiler, and ESLint dependencies. After dependencies became available, a regression test used invalid `{}` credential inputs and incorrectly expected service-level mappings; those test fixtures were corrected without changing implementation mapping.

Final verification: `npx tsc --noEmit` exit 0; `npm run lint` exit 0; `npm test` exit 0 with 193 passed and 0 failed; `git diff --check` exit 0. Node emitted existing `DEP0205` deprecation warnings. No files were staged or committed.
