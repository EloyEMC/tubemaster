# TubeMaster issue #71 — private Shorts dashboard workflow

## Status

- State: implementation complete; browser verification pending; ready for publication
- Issue: https://github.com/Gentleman-Programming/tubemaster/issues/71
- Approval: `status:approved` and `type:feature`
- Branch: `feat/issue-71-dashboard-upload`
- Base: `upstream/feature-2` at `694bf225d2118dde555542c2c40af7cc967587fb9`

## Outcome

Add the authenticated dashboard workflow for preparing and confirming a private Shorts upload through the merged adapter, with preview, explicit confirmation, safe statuses, and accessible responsive UX.

## Tasks

- [x] Add an accessible sidebar entry and upload form for controlled staging filename, title, description, and active expected channel.
- [x] Add dry-run/preview and distinct explicit confirmation states; keep private-only copy clear.
- [x] Show active channel identity and safe success, validation, provider, and uncertain-outcome states.
- [x] Add deterministic request/state helper tests. Node tests cannot verify DOM behavior.
- [x] Accessibility follow-up: focus the first invalid field on submission and announce active-channel loading, errors, and identity in a polite live region while keeping the text visible.
- [ ] Manually verify authenticated/unauthenticated navigation, keyboard focus, narrow viewport, channel switching, preview, confirm, and uncertain-response behavior on a server started from this worktree. Port 3102 may serve a different checkout.
- [ ] Parent-owned commit and PR.

## Decisions for this slice

- Use the existing `/api/youtube/upload` adapter; do not duplicate upload/auth logic in the UI.
- Use a controlled staging filename/reference, not arbitrary browser filesystem paths.
- Keep scheduling, public visibility, CLI, MCP, thumbnails, playlists, captions, and automatic retries out of scope.
- Preserve the current dashboard shell and existing Manual/Rules/Quota workflows.
- Explain that the first release uploads privately and does not schedule or publish publicly.

## Validation

- `node --import tsx --test src/components/dashboard-upload-form.test.tsx`: 3 passed.
- `./node_modules/.bin/tsc --noEmit`: passed.
- Full validation: 286/286 tests, TypeScript, lint, diff check, and build passed.
- Browser smoke remains required for focus movement and channel announcements; Node helper tests cannot verify DOM behavior.
