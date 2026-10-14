# TubeMaster issue #69 — authenticated private-upload adapter

## Status

- State: implementation complete; ready for publication
- Issue: https://github.com/Gentleman-Programming/tubemaster/issues/69
- Approval: `status:approved` and `type:feature`
- Branch: `feat/issue-69-upload-adapter`
- Base: `upstream/feature-2` at `356ba53a4c7d177691988ba13404b0160b84a2f9`

## Outcome

Expose the merged private-first upload core through one authenticated production API adapter using controlled server-side staging references rather than arbitrary client filesystem paths.

## Tasks

- [x] Define the adapter request/response boundary and controlled staging configuration (`VIDEO_UPLOAD_STAGING_ROOT`, `VIDEO_UPLOAD_MAX_BYTES`).
- [x] Enforce authentication, staging-root confinement, regular-file/readability, supported media extension, and size limits before invoking the core.
- [x] Preserve `expectedChannelId`, `dryRun`, and explicit confirmation; map stable core outcomes without secrets or local paths.
- [x] Add deterministic route/adapter tests for auth, traversal/symlink/size rejection, no-write paths, success, and errors.
- [x] Bind confirmed uploads to a private streamed snapshot of the validated descriptor; clean up after the core settles. Dry runs remain read-only.
- [x] Resolve snapshot stream hang by transferring both descriptors to auto-closing pipeline streams; focused adapter tests pass (`node --import tsx --test src/lib/video-upload/adapter.test.ts`, 3/3).
- [x] Full validation: focused 19/19, full suite 286/286, TypeScript, lint, diff check, and build passed. No real credentialed YouTube upload was run.
- [ ] Commit one work unit and publish an issue-linked PR.

## Decisions for this slice

- Use an authenticated API route as the single production adapter; CLI, MCP, and dashboard adapters remain separate.
- Accept a controlled staging filename/reference, not an arbitrary filesystem path or remote URL.
- Resolve and validate the staged file under the configured root; for confirmed uploads, stream from the checked `O_NOFOLLOW` descriptor into a private snapshot and pass only that snapshot path to the core. Remove it on success or failure. Dry runs do not create snapshots.
- Keep private-only, `expectedChannelId`, `dryRun`, confirmation, and no-automatic-retry semantics from issue #67 unchanged.
- Do not add durable reconciliation or public/scheduled visibility in this slice.

## Validation risks

- Media support is extension-based rather than content-sniffed.
- A failure during snapshot cleanup after a successful provider write could mask success; the core operation ID remains the reconciliation signal.
- Concurrent mutation during the initial copy is not fully ruled out; size and descriptor identity checks are applied before snapshot use.
