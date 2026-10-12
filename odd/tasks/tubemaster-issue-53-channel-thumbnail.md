# TubeMaster issue #53 — channel thumbnail fallback

## Status

- State: implemented and validated; awaiting focused commit
- Issue: https://github.com/Gentleman-Programming/tubemaster/issues/53
- Branch: `fix/issue-53-channel-thumbnail`
- Base: `upstream/feature-2`
- Label: `type:bug`

## Scope

Restore robust active-channel thumbnail rendering in the dashboard.

### In scope

- Select ordered thumbnail candidates from the YouTube channel response.
- Return candidates from `/api/youtube/channel-info` while preserving the existing primary thumbnail field.
- Fall back through candidates when an image fails to load.
- Render no broken image when all candidates fail; retain channel metadata.
- Add focused route, component, and dashboard tests.

### Out of scope

- OAuth changes, channel data model changes, unrelated dashboard redesign, or YouTube API mutations.

## Tasks

- [x] Recover focused thumbnail candidate and fallback behavior without changing feature-2 quota accounting.
- [x] Focused route, component, and quota tests pass; quota fixture and response expectation now match the candidate contract without changing accounting assertions.
- [x] Full tests, TypeScript, lint, diff check, and production build pass.
- [ ] Parent to determine commit/review workflow; no push or PR requested.

## Evidence

- Historical focused fixes: `b30701f` and `95943a8`; candidate ordering uses high, medium, default per issue requirement.
- `node --import tsx --test src/app/api/youtube/channel-info/route.test.ts src/app/api/youtube/channel-info/route.quota.test.ts src/components/channel-thumbnail.test.ts`: 10 passed, 0 failed.
- `npm test`: passed (the complete suite; output suppressed in the combined command).
- `npx tsc --noEmit`: passed. `npm run lint`: passed. `git diff --check`: passed. `npm run build`: passed (Next.js 16.2.2, production compilation and static generation).
- Dashboard has no existing DOM test harness; route serialization and pure candidate progression/exhaustion tests cover separable behavior. Dashboard image-error event wiring remains a browser-level validation risk.
- Current bug issue: #53.
