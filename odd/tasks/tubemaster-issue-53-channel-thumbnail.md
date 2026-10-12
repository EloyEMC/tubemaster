# TubeMaster issue #53 — channel thumbnail fallback

## Status

- State: refined and validated; awaiting follow-up commit
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
- Use a distinct valid HTTPS session profile image after YouTube candidates fail; hide the image if it also fails, retaining channel metadata.
- Add focused route, component, and dashboard tests.

### Out of scope

- OAuth changes, channel data model changes, unrelated dashboard redesign, or YouTube API mutations.

## Tasks

- [x] Recover focused thumbnail candidate and fallback behavior without changing feature-2 quota accounting.
- [x] Focused route, component, and quota tests pass; quota fixture and response expectation now match the candidate contract without changing accounting assertions.
- [x] Full tests, TypeScript, lint, diff check, and production build pass after adding the session profile image as the final fallback.
- [ ] Parent to determine commit/review workflow; no push or PR requested.

## Evidence

- Historical focused fixes: `b30701f` and `95943a8`; candidate ordering uses high, medium, default per issue requirement.
- `node --import tsx --test src/app/api/youtube/channel-info/route.test.ts src/app/api/youtube/channel-info/route.quota.test.ts src/components/channel-thumbnail.test.ts`: 11 passed, 0 failed (includes profile fallback and exhaustion).
- `npm test`: passed (the complete suite; output suppressed in the combined command).
- `npx tsc --noEmit`: passed. `npm run lint`: passed. `git diff --check`: passed. `npm run build`: passed (Next.js 16.2.2, production compilation and static generation).
- Dashboard has no existing DOM test harness; route serialization and pure candidate progression/profile fallback/exhaustion tests cover separable behavior. Dashboard image-error event wiring remains a browser-level validation risk.
- Manual check after the original commit found all YouTube candidates failing; this follow-up restores the HTTPS session-profile image as final fallback.
- Current bug issue: #53.
