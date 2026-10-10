# Dashboard playlist read-back

## Goal
Make authenticated manual playlist operations observable by showing the selected playlist's contents and refreshing them after add/remove operations.

## Scope
- Add read-only playlist-items service/API path with pagination.
- Show selected playlist contents in `ManualMode`.
- Refresh contents after successful or partial add/remove operations.
- Preserve OAuth, playlist mutation contracts, and shared SQLite boundaries.

## Tasks
1. Add paginated YouTube playlist-item read contract and adapter/service support. **Done**
2. Add authenticated `/api/youtube/playlist-items` route and focused tests. **Done**
3. Render and refresh playlist contents in the dashboard manual flow. **Done**
4. Run focused tests, diff checks, and isolated UI/API verification. **Done with caveat**

## Evidence
- Work-unit commit: `c8e57f0456463081891a0cf4568695f0f9240ced` on PR #10.
- ODD docs commit: `c19dcf95f1e06cba0f31e651a40bbd336e5e1c70` on PR #10.
- Stacked propagation: PR #15 head `764fe5010060be413efcbaffa531f94683265d6c`.
- Route/UI focused tests: **3 passed, 0 failed**.
- Playlist helper test: **1 passed, 0 failed**.
- `git diff --check`: passed.
- Broader service test invocation hit an existing SQLite `BUSY` initialization failure after 16 passing tests; no shared SQLite changes were intentionally made.

## Acceptance evidence
- Selected playlist contents are visible in the dashboard.
- Add/remove refreshes the read-back list.
- Unauthenticated and missing-playlist requests return stable errors.
- Tests pass without real YouTube calls or shared SQLite mutation.

## Non-goals
- No automatic playlist mutation, scheduling, persistence, or real provider execution in tests.
