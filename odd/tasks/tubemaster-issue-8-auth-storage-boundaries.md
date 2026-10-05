# TubeMaster issue #8 — auth storage boundary normalization

## Parent issues

- `Gentleman-Programming/tubemaster#5` — Expand TubeMaster from playlist manager into channel operations platform.
- `Gentleman-Programming/tubemaster#8` — Harden flagged security and error boundaries.

## Focused slice

Normalize authentication storage failures into typed, stable boundary errors without exposing filesystem or platform details.

## Scope

- Map storage read/write/permission/serialization failures to existing auth error codes.
- Preserve successful auth context behavior and public CLI envelopes.
- Add focused storage and service regression tests.

## Non-goals

- Browser subprocess launching (merged in #36).
- YouTube/API/provider error boundaries.
- Quota, audit, analytics, or UI changes.
- Credentials/tokens in logs or errors.

## Allowed edit surfaces

- `src/lib/cli-auth/storage.ts`
- `src/lib/cli-auth/storage.test.ts`
- `src/lib/cli-auth/service.test.ts`
- This task document

## Validation

- Focused auth storage tests.
- Full test suite, TypeScript, lint, and `git diff --check`.
