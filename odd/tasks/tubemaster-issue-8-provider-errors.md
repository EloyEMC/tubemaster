# TubeMaster issue #8 — YouTube provider error boundaries

## Parent issues

- `Gentleman-Programming/tubemaster#5` — Expand TubeMaster from playlist manager into channel operations platform.
- `Gentleman-Programming/tubemaster#8` — Harden flagged security and error boundaries.

## Focused slice

Normalize YouTube provider failures at the video-metadata adapter boundary without leaking raw provider details or changing public contracts.

## Scope

- Map authentication, permission, rate-limit, not-found, validation, and transient provider failures to typed errors.
- Sanitize provider reasons and preserve safe diagnostics.
- Add deterministic adapter and mapping tests.

## Non-goals

- Auth storage or browser launching.
- Playlist/API route boundaries.
- Quota, audit, analytics, or UI changes.
- Raw provider payloads, tokens, or credentials in errors/logs.

## Allowed edit surfaces

- `src/lib/provider-errors.ts`
- `src/lib/provider-errors.test.ts`
- `src/lib/video-metadata/adapters/youtube-api.ts`
- This task document

## Implementation tasks

- [x] Define a safe provider-error mapper with typed classification and bounded diagnostics.
- [x] Normalize every YouTube adapter provider call while preserving intentional domain errors.
- [x] Add deterministic mapper and adapter-boundary regression coverage.
- [x] Run the required full validation commands and record exact outcomes.

## Validation

- Focused provider-error tests.
- Full test suite, TypeScript, lint, and `git diff --check`.

## Evidence

- `npm test`: passed (207 tests).
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed.
- No commit created, per request.
