# Issue 11 — Batch metadata preparation preview

## Goal
Publish the focused read-only batch metadata preparation and preview contract.

## Scope
- Add `POST /api/video-metadata/batch-preview`.
- Validate 1–50 unique video IDs and a non-empty editorial prompt.
- Scope credentials to the authenticated session user.
- Reuse existing read-only metadata preview behavior and preserve transcript states.
- Perform no metadata writes, persistence, scheduling, confirmation, or apply calls.

## Non-goals
- Confirmation or execution.
- Bulk mutation, persistence, scheduling, reporting, CLI, or MCP exposure.
- New OAuth scopes or changes to single-video preview behavior.

## Validation
- `node --import tsx --test src/app/api/video-metadata/batch-preview/route.test.ts src/lib/video-metadata/services.test.ts`: failed (22 passed, 1 file failed): shared SQLite initialization race produced an asynchronous `SQLITE_BUSY: database is locked` unhandled rejection after route tests passed. Run focused files separately to avoid the race.
- `node --import tsx --test src/app/api/video-metadata/batch-preview/route.test.ts`: passed (2/2).
- `node --import tsx --test src/lib/video-metadata/services.test.ts`: passed (20/20).
- `npm test`: passed (224/224 tests).
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed.

## Delivery evidence
- Issue: https://github.com/Gentleman-Programming/tubemaster/issues/11
- Original implementation identity in issue comments: `84266b0` (not present in this checkout or old worktree history).
- Recovery commit: `feat(video-metadata): add batch preview` (focused tests passed separately; commit hash recorded by Git on delivery).
- Pull request: not opened.
