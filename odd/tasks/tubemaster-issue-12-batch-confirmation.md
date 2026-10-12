# TubeMaster issue #12 — batch proposal confirmation

## Status

- State: in progress
- Issue: https://github.com/Gentleman-Programming/tubemaster/issues/12
- Branch: `feat/issue-12-batch-confirmation`
- Base: `upstream/feature-2`
- Approval: `status:approved`, `type:feature`

## Scope

Implement the stateless, authenticated `POST /api/video-metadata/batch-confirmation` boundary.

### In scope

- Validate ordered unique YouTube video IDs and proposed title/description metadata.
- Validate the expected channel ID and explicit `confirmed: true`.
- Produce a deterministic SHA-256 identity from the canonical confirmation payload.
- Preserve item ordering and return a stable serializable confirmation envelope.
- Keep the boundary read-only: no YouTube mutation, persistence, scheduling, execution, reporting, or write-scope authorization.
- Preserve existing batch-preview and single-video contracts.

### Out of scope

- Applying metadata or calling `videos.update`.
- Persistence, scheduling, execution, reporting, or OAuth changes.

## Tasks

- [x] Recover the focused confirmation route, schemas, service, and tests onto current `feature-2`.
- [x] Validate focused tests, full test suite, TypeScript, lint, and diff checks.
- [x] Commit the work unit; no push or PR requested.

## Evidence

- Recovered implementation reference: `/Users/eloymartinezcuesta/Documents/Tubemaster-confirmation-pr`.
- Historical source commit referenced in issue comments: `d0561c6` (unavailable in current object database).
- Implementation: session-gated route overrides client credentials; strict schema enforces unique ordered IDs, metadata, channel, and explicit confirmation; service hashes the schema-ordered JSON payload excluding credentials and returns a serializable envelope without invoking adapters.
- Validation: `node --import tsx --test src/app/api/video-metadata/batch-confirmation/route.test.ts` (3 passed); `node --import tsx --test src/lib/video-metadata/services.test.ts` (22 passed); `npm test` (245 passed); `npx tsc --noEmit` (passed); `npm run lint` (passed); `git diff --check` (passed). Existing batch-preview and single-video code was left intact.
- No push or PR was performed.
