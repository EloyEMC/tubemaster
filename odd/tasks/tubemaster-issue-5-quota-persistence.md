# TubeMaster issue #5 — quota persistence slice

## Parent issue

`Gentleman-Programming/tubemaster#5` — Expand TubeMaster from playlist manager into channel operations platform.

## Focused slice

Add durable quota usage persistence and safe aggregation on top of the reviewed in-memory accounting core.

## Scope

- SQLite-backed append-only quota usage repository.
- Durable accountant adapter with user/global scope and failure isolation.
- Bucketed usage aggregation needed by later read-only reporting.
- Focused tests and schema/database support only.

## Non-goals

- CLI, MCP, dashboard, or API reporting surfaces.
- Audit trail events.
- Analytics, metadata, playlist, or transcript integrations.
- Public contract changes or live mutations.

## Validation

- Focused persistence/accountant tests.
- Full test suite, TypeScript, lint, and `git diff --check`.
- Confirm the diff remains reviewable and based on `feat/quota-accounting-core`.
