# TubeMaster issue #5 — quota usage API slice

## Parent issue

`Gentleman-Programming/tubemaster#5` — Expand TubeMaster from playlist manager into channel operations platform.

## Focused slice

Expose a read-only, authenticated quota usage API on top of the reviewed persistence slice.

## Scope

- Safe aggregation/query helpers for persisted quota entries.
- Authenticated `GET /api/quota/usage` route.
- Explicit scope and filter validation.
- Stable response shape and sanitized errors.
- Focused route and repository tests.

## Non-goals

- Dashboard UI.
- CLI or MCP reporting.
- Audit trail, analytics, or operation integrations.
- Authoritative Google quota balance claims.

## Tasks

1. Add safe, scope-aware aggregation and filter helpers to `SQLiteQuotaRepository` without exposing ledger rows or credentials.
2. Add an authenticated `GET /api/quota/usage` route with explicit query validation, stable `{ summaries }` success responses, and sanitized errors; cover the route and repository contracts with focused tests.
3. Run focused tests, TypeScript, lint, and `git diff --check`.

## Validation

- Focused route/repository tests.
- Full test suite, TypeScript, lint, and `git diff --check`.
- Review diff size and compatibility against `feat/quota-persistence`.

## Evidence

- Status: implemented; dependency-limited verification.
- Focused test command: `node --import tsx --test src/app/api/quota/usage/route.test.ts` — blocked because `tsx` is not installed.
- TypeScript command: `npx tsc --noEmit` — blocked; no local compiler and `npx` resolved unsupported `tsc@2.0.4`.
- Lint command: `npm run lint -- --file ...` — blocked because `eslint` is not installed.
- `git diff --check` — passed.
- Next 16 route docs: unavailable because `node_modules/next/dist/docs/` is absent.
- Commit: not applicable; user explicitly requested no commit.
