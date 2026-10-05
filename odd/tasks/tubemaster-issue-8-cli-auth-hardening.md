# TubeMaster issue #8 — CLI auth subprocess hardening

## Parent issues

- `Gentleman-Programming/tubemaster#5` — Expand TubeMaster from playlist manager into channel operations platform.
- `Gentleman-Programming/tubemaster#8` — Harden flagged security and error boundaries.

## Focused slice

Harden the CLI authentication browser-launch subprocess invocation with an explicit platform policy and regression coverage.

## Scope

- Avoid shell interpretation for browser launch arguments.
- Preserve supported macOS, Linux, and Windows behavior.
- Keep existing CLI auth envelopes and error behavior compatible.
- Add deterministic subprocess invocation tests.

## Non-goals

- Auth storage boundary normalization.
- YouTube/API error-boundary changes.
- Quota, audit, analytics, or UI changes.
- Credential/token logging.

## Allowed edit surfaces

- `src/lib/cli-auth/service.ts`
- `src/lib/cli-auth/service.test.ts`
- This task document

## Validation

- Focused CLI auth tests.
- Full test suite, TypeScript, lint, and `git diff --check`.

## Implementation Evidence

- Browser launch now uses explicit `open`, `xdg-open`, or `rundll32.exe` argument vectors with `shell: false`.
- Deterministic tests cover platform command selection, literal URL argument preservation, spawn options, and spawn errors.
- No auth envelopes or non-auth boundaries were changed.

## Verification Results

- `npm test` — exit 1: all 25 test files failed to load because `tsx` is not installed.
- `npx tsc --noEmit` — exit 1: TypeScript compiler unavailable (`This is not the tsc command you are looking for`).
- `npm run lint` — exit 127: `eslint: command not found`.
- `git diff --check` — exit 0.
- No commit created, per request.
