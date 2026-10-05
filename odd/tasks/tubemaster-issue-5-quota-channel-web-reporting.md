# TubeMaster issue #5: quota channel web reporting

## Goal

Add channel-aware filtering and display to the existing authenticated quota usage web surfaces on current `upstream/feature-2`, without recreating the already-merged quota API/dashboard base.

## Scope

- Extend `GET /api/quota/usage` with optional `channelId` filtering.
- Treat omitted and `channelId=all` as all channels, `channelId=null` as unassigned, and validate explicit channel identifiers.
- Display channel context in the existing quota dashboard while preserving authentication, loading/error/empty states, and the estimate disclaimer.
- Update the web interface contract and focused tests.

## Constraints

- Allowed edit surfaces are limited to the files named in the user request.
- Recovered commit `a61fbf1` and branch `feat/quota-channel-reporting-web` are read-only behavioral references.
- Do not change quota persistence/core, auth, CLI, MCP, or unrelated dashboard behavior.
- Do not commit changes.

## Tasks

- [x] Add validated channel filter parsing and focused API coverage.
- [x] Add channel-aware summary formatting/display and focused formatter coverage.
- [x] Update interface documentation.
- [ ] Run the requested verification commands (blocked by unavailable local dependencies).

## Verification

- `npm test` — exit 1; all 22 test files failed to start because `tsx` is missing (`ERR_MODULE_NOT_FOUND`).
- `npx tsc --noEmit` — exit 1; TypeScript is unavailable and `npx` printed “This is not the tsc command you are looking for.”
- `npm run lint` — exit 127; `eslint: command not found`.
- `git diff --check` — exit 0; no whitespace errors.
