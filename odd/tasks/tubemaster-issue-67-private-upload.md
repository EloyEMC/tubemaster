# TubeMaster issue #67 — private Shorts upload contract

## Status

- State: implementation complete; work-unit committed; awaiting review
- Issue: https://github.com/Gentleman-Programming/tubemaster/issues/67
- Approval: `status:approved` and `type:feature`
- Branch: `feat/issue-67-private-upload`
- Base: `upstream/feature-2` at `5daf0654373bb368c95ac1b037b8314ffe7653f9`

## Outcome

Add the first core boundary for Shorts uploads: a validated, auditable, private-first YouTube video upload operation reusable by future dashboard, CLI, and MCP adapters.

## Tasks

- [x] Define typed upload request/result using existing domain errors and a reconciliation operation ID.
- [x] Implement file/metadata/channel validation, `dryRun`, explicit confirmation, private-only upload, quota accounting, and provider error mapping.
- [x] Add deterministic mocked service tests for validation, no-write paths, successful private upload, quota, and failures; update the exhaustive quota-cost test.
- [x] Run focused tests, TypeScript, lint, full tests, and build.
- [x] Fix verifier finding: wire the production upload factory to user-scoped durable quota accounting and fail closed before provider writes when construction fails.

## Decisions for this slice

- Uploads are private-only; public and scheduled visibility remain out of scope.
- `expectedChannelId` is mandatory and checked through the existing write-channel guard.
- `dryRun` and confirmation are enforced before any YouTube write call.
- Resumable upload and durable idempotency storage are not invented in this slice; the result exposes a reconciliation seam and provider failures remain explicit.
- No dashboard, CLI, MCP, thumbnail, playlist, captions, or post-upload metadata surface is added.

## Evidence

- Existing auth scopes, write-channel guard, YouTube client, provider-error mapper, and quota accountant are reusable.
- No existing `videos.insert` or upload implementation was found.
- Validation: focused upload/quota tests 10 passed; `tsc --noEmit` and focused ESLint passed; full test suite 277 passed; `npm run lint` and `npm run build` passed.
- The local file adapter checks regular-file status, nonzero size, and readability; the provider performs one private `videos.insert`. Provider errors carry an operation ID and `outcome: unknown` for manual reconciliation, not automatic retries.
- Production now uses `quotaClient` and `createDurableQuotaAccountant`, scoped to the resolved user credential; token-only credentials cannot upload through the default factory. Factory wiring and fail-closed behavior have deterministic tests.
- Validation after the quota-wiring fix: focused upload/quota tests 14 passed; full suite 281 passed; TypeScript, lint, diff check, and build passed.
- The pre-existing `.atl/skill-registry.md` modification was preserved untouched.
