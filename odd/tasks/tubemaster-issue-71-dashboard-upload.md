# TubeMaster issue #71 — private Shorts dashboard workflow

## Status

- State: implementation complete; browser smoke passed; ready for review
- Issue: https://github.com/Gentleman-Programming/tubemaster/issues/71
- Approval: `status:approved` and `type:feature`
- Branch: `feat/issue-71-dashboard-upload`
- Base: `upstream/feature-2` at `694bf225d2118dde555542c2c40af7cc967587fb9`

## Outcome

Add the authenticated dashboard workflow for preparing and confirming a private Shorts upload through the merged adapter, with preview, explicit confirmation, safe statuses, and accessible responsive UX.

## Tasks

- [x] Add an accessible sidebar entry and upload form with a native video file picker, title, description, and active expected channel.
- [x] Add dry-run/preview and distinct explicit confirmation states; keep private-only copy clear.
- [x] Show active channel identity and safe success, validation, provider, and uncertain-outcome states.
- [x] Add deterministic request/state helper tests. Node tests cannot verify DOM behavior.
- [x] Accessibility follow-up: focus the first invalid field on submission and announce active-channel loading, errors, and identity in a polite live region while keeping the text visible.
- [x] Stage the chosen video through an authenticated, bounded multipart endpoint with an opaque randomized reference before preview.
- [x] Browser smoke on port 3102 from this worktree: authenticated dashboard navigation, native Finder picker, staged filename display, preview with no YouTube upload, and confirmed private upload returned a video ID and operation ID. No credentials or local paths were exposed.
- [x] Parent commit `1fa96ea` pushed to PR #72; merge remains separately authorized.

## Decisions for this slice

- Use the existing `/api/youtube/upload` adapter; do not duplicate upload/auth logic in the UI.
- Use a native file picker and upload bytes only to the controlled staging endpoint; the existing YouTube adapter receives the generated opaque staging reference, never a browser filesystem path.
- Keep scheduling, public visibility, CLI, MCP, thumbnails, playlists, captions, and automatic retries out of scope.
- Preserve the current dashboard shell and existing Manual/Rules/Quota workflows.
- Explain that the first release uploads privately and does not schedule or publish publicly.

## Validation

- `node --import tsx --test src/lib/video-upload/staging.test.ts src/app/api/youtube/upload/stage/route.test.ts src/components/dashboard-upload-form.test.tsx`: 7 passed.
- `./node_modules/.bin/tsc --noEmit`: passed.
- Full validation: 290/290 tests, TypeScript, lint, diff check, and build passed. Build emitted a non-blocking Turbopack whole-project tracing warning involving `src/lib/video-upload/staging.ts`.
- Browser smoke passed for native chooser, staging/preview transitions, channel identity, and confirmed private upload. Detailed screen-reader/focus and narrow-layout coverage remains limited to visual/manual verification; Node helper tests cannot verify DOM behavior.
