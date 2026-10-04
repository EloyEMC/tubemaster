# TubeMaster issue #5 — quota dashboard slice

## Parent issue

`Gentleman-Programming/tubemaster#5` — Expand TubeMaster from playlist manager into channel operations platform.

## Focused slice

Expose the reviewed read-only quota usage API through a separate dashboard page without changing existing Manual or Rules workflows.

## Scope

- Authenticated quota dashboard page.
- Loading, empty, unauthorized, and error states.
- Explicit estimate disclaimer and bucket formatting.
- Navigation link from the dashboard.
- Focused formatter/UI tests where supported.

## Non-goals

- New quota accounting or persistence behavior.
- CLI or MCP reporting.
- Analytics, audit trail, or mutation workflows.
- Claims about authoritative remaining Google quota.

## Implementation notes

- Separate `/dashboard/quota` client page reads `GET /api/quota/usage` only after authentication; 401 and signed-out sessions show an unauthorized message.
- Empty, loading, malformed/failed response, and populated table states are distinct. Fetch is aborted on unmount.
- Bucket dates remain UTC calendar labels; invalid dates render as “Unknown date.” Estimates are explicitly not authoritative Google usage or remaining quota.
- The existing Manual/Rules tabs remain unchanged; a link opens the quota page.

## Checklist

- [x] Read-only authenticated quota page and dashboard navigation
- [x] States, estimate disclaimer, and safe bucket formatting
- [x] Focused formatter tests
- [x] Validation results recorded in handoff

## Validation

- `node --import tsx --test src/app/dashboard/quota/format.test.ts` — 3 passed, 0 failed.
- `npx tsc --noEmit` — passed.
- `npm run lint` — passed.
- `git diff --check` — passed for tracked allowed files; untracked files were additionally inspected via focused formatter tests and TypeScript/lint.
- Preserve current dashboard Manual and Rules behavior.
