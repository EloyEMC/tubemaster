# TubeMaster issue #73 — preserve staging server errors

- Issue: https://github.com/Gentleman-Programming/tubemaster/issues/73
- Branch: `fix/issue-73-staging-errors`
- Base: `feature-2`
- Status: complete

## Goal

Keep expected upload validation failures as HTTP 400 while preserving unexpected session, filesystem, and staging failures as HTTP 500 with safe user-facing messaging.

## Tasks

- [x] Add regression coverage for expected and unexpected error classification.
- [x] Narrow route and staging error boundaries without leaking internal details.
- [x] Run focused checks and record a work-unit commit.

## Scope

- `src/app/api/youtube/upload/stage/route.ts`
- `src/app/api/youtube/upload/stage/route.test.ts`
- `src/lib/video-upload/staging.ts`
- `src/lib/video-upload/staging.test.ts`
- `src/components/dashboard-upload-form.tsx` only if the existing error mapping needs a safe internal-error state.

## Non-goals

- No upload contract changes.
- No retry behavior.
- No logging of credentials, local paths, or video contents.

## Evidence

Fleet review on PR #72 identified the blanket catch in the staging route as mapping unexpected failures to `validation_failed`/400. Follow-up issue #73 was opened from that review.

## Validation

- Focused tests: 12/12 passed.
- TypeScript: `tsc --noEmit --incremental false` passed.
- ESLint: focused changed-file command passed.
- `git diff --check` passed.
- Additional hardening: cleanup path is recorded only after exclusive file open succeeds, preventing an EEXIST collision from unlinking an existing file.

## Commit

Work-unit commit: `5152605` (`fix(upload): preserve staging server errors`).
