# TubeMaster issue #13 — safe confirmed batch execution

## Status

- State: implemented and validated
- Issue: https://github.com/Gentleman-Programming/tubemaster/issues/13
- Branch: `feat/issue-13-batch-apply`
- Base: `upstream/feature-2`
- Approval: `status:approved`, `type:feature`

## Scope

Implement authenticated, safe execution of confirmed metadata batches through `POST /api/video-metadata/batch-apply`.

### In scope

- Require write-scope authorization and expected-channel/write-channel guards.
- Revalidate confirmation identity before authentication/provider access.
- Bind confirmation to an original-metadata baseline so provider drift is detected.
- Preflight every item before the first write; stale metadata, ownership/channel mismatch, tampering, or authorization failure must produce zero writes.
- Execute confirmed writes sequentially through the existing provider proposal path.
- Return structured per-item provider failure outcomes without retry or rollback.
- Preserve existing single-video apply behavior.

### Out of scope

- Persistence, reports, UI, CLI/MCP, quota/analytics, transcripts, playlists, or new OAuth scopes.

## Tasks

- [x] Implement focused batch-apply route, signed baseline confirmation envelope, sequential preflight/write service, and service tests.
- [x] Validate focused and full test suites, TypeScript, lint, diff checks, and build. Dependencies were installed before this validation pass.
- [ ] Parent handles any commit; user requested no push or PR.

## Evidence

- Recovered implementation reference: `/Users/eloymartinezcuesta/Documents/Tubemaster-batch-apply-pr` (polluted historical worktree; use only focused batch-apply behavior).
- Historical source commit referenced in issue comments: `5915892` (unavailable in current object database).
- Implementation uses a deterministic SHA-256 confirmation identity over ordered items, proposed content, original title/description/localizations, channel and consent; credentials are excluded. Execution rejects invalid identity before auth, then guards channel and preflights all metadata before sequential proposal writes. Provider errors become per-item outcomes without retry/rollback.
- Focused `node --import tsx --test src/app/api/video-metadata/batch-apply/route.test.ts`: 3 passed; `node --import tsx --test src/app/api/video-metadata/batch-confirmation/route.test.ts`: 3 passed; `node --import tsx --test src/lib/video-metadata/services.test.ts`: 23 passed. An initial combined confirmation/service invocation encountered an asynchronous `SQLITE_BUSY` database lock after its tests passed; separate focused invocations passed.
- `npm test`: 249 passed; `npx tsc --noEmit`: passed after fixing test-only assertion narrowing; `npm run lint`: passed; `git diff --check`: passed; `npm run build`: passed, including TypeScript and static page generation. No build environment limitation observed.
- Manual local testing has not been requested; no push or PR is authorized.
