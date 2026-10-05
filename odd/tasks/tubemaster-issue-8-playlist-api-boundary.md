# TubeMaster issue #8 — playlists API error boundary

## Parent issues

- `Gentleman-Programming/tubemaster#5` — Expand TubeMaster from playlist manager into channel operations platform.
- `Gentleman-Programming/tubemaster#8` — Harden flagged security and error boundaries.

## Focused slice

Normalize unexpected failures at the YouTube playlists API route boundary while preserving stable public responses.

## Scope

- Map provider/domain failures to the repository's typed HTTP error envelopes.
- Sanitize unknown failures and avoid leaking raw provider details.
- Add deterministic route tests for validation, auth, not-found, and unexpected failures.

## Non-goals

- CLI auth, storage, provider adapter, or playlist mutation changes already merged.
- Other API routes.
- Quota, audit, analytics, or UI changes.

## Allowed edit surfaces

- `src/app/api/youtube/playlists/route.ts`
- `src/app/api/youtube/playlists/route.test.ts`
- This task document

## Validation

- Focused route tests.
- Full test suite, TypeScript, lint, and `git diff --check`.

## Implementation plan

- Add the existing typed `DomainError` HTTP envelope and status mapping at the playlists route boundary.
- Return a generic `internal_error` envelope for unexpected failures without provider or credential details.
- Cover success, auth, validation, not-found, typed auth, and unexpected failures with deterministic route tests.

## Status

- Exploration complete; recovered commit `a3b2618` confirms the intended boundary shape.
- Source implementation and deterministic tests complete.
- Required validation ran, but local dependencies are unavailable: `npm test` failed because `tsx` is missing; `npx tsc --noEmit` failed because TypeScript is unavailable; `npm run lint` failed because `eslint` is unavailable; `git diff --check` passed.
- No commit created, per request.
