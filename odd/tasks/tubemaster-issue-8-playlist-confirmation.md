# TubeMaster issue #8 — playlist mutation confirmation hardening

## Focused slice

Require explicit expected-channel confirmation for every remote playlist mutation while preserving existing contracts and guardrails.

## Scope

- Enforce presence-only `--confirmed` and required `--expectedChannelId` for playlist create, update, delete, add, and remove commands.
- Fail closed before invoking the playlist core on missing or malformed confirmation or missing expected channel.
- Preserve stable CLI success/error envelopes and playlist list read behavior.
- Add focused mutation confirmation and regression tests.

## Non-goals

- Auth/provider error mapping.
- API/MCP mutation contract redesign.
- Quota, audit, analytics, or UI changes.

## Allowed edit surfaces

- `src/cli/video-metadata.ts`
- `src/cli/video-metadata.test.ts`
- This task document

## Validation

- Focused CLI mutation tests.
- `npm test`
- `npx tsc --noEmit`
- `npm run lint`
- `git diff --check`

## Progress

- [x] Add the shared presence-only confirmation guard and wire all remote playlist mutations.
- [x] Add focused tests proving fail-closed behavior and stable envelopes.
- [ ] Run and record all required validation results; blocked by missing local tooling.

## Validation evidence

- `npm test` — exit 1: `ERR_MODULE_NOT_FOUND: Cannot find package 'tsx'`; 0 passed, 26 failed before tests could run.
- `npx tsc --noEmit` — exit 1: `This is not the tsc command you are looking for`; TypeScript compiler unavailable.
- `npm run lint` — exit 127: `eslint: command not found`.
- `git diff --check` — exit 0: no output.
