# TubeMaster issue #3 — current dashboard sidebar slice

## Status

- State: ready for publication
- Issue: https://github.com/Gentleman-Programming/tubemaster/issues/3
- Branch: `feat/issue-3-dashboard-sidebar`
- Base: `upstream/feature-2` at `34f4c4a`
- Approval: issue #3 now carries `status:approved`; this branch is the focused current-code replacement for the stale PR stack.

## Outcome

Replace the dashboard's inline Manual/Rules presentation with a shared authenticated dashboard shell and accessible sidebar navigation while preserving existing workflows and routes.

## Proposed slice

- Add a shared dashboard layout/navigation shell for `/dashboard` and `/dashboard/quota`.
- Keep the current Manual and Rules workflows available and clearly active.
- Keep active channel, Switch Channel, Sign Out, transcript dashboard, and quota access visible.
- Preserve `/dashboard/quota` loading, unauthorized, error, and data states.
- Add responsive keyboard-accessible navigation and active route indication.
- Avoid the stale PR #4 design-token/dependency stack; use current project styling conventions.

## Out of scope

- New upload, scheduling, Shorts, analytics, or metadata behavior.
- Changes to API/CLI/MCP contracts or auth/quota semantics.
- Autonomous publishing or broad visual redesign outside the dashboard shell.

## Tasks

- [x] Implement the focused shell and navigation: shared authenticated layout/header, responsive route links, existing Manual/Rules controls retained.
- [x] Run focused pure/UI-adjacent checks (10/10), isolated channel-info route checks (6/6), full suite (273/273), TypeScript, lint, diff check, and build. The current Node test setup has no DOM renderer.
- [ ] Run authenticated browser smoke for keyboard/responsive behavior.
- [ ] Publish a focused PR; merge requires explicit authorization.

## Evidence and risks

- Current `/dashboard` uses local Manual/Rules tabs; `/dashboard/quota` has a separate header/return link.
- Existing issue #3 references a stale four-PR stack; PR #2/#4 are not safe bases for direct merging.
- Main checkout is dirty; all work stays isolated in this worktree.
- Validation: focused pure/UI-adjacent checks 10/10, isolated channel-info route checks 6/6, full suite 273/273, TypeScript, lint, diff check, and build pass. Browser keyboard/responsive smoke remains pending because the Node setup has no DOM renderer.
- Issue #3 remains unlabelled/unapproved, so publication is blocked by repository governance until the issue is refined and approved.
