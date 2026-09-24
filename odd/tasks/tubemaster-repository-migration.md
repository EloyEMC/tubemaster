# TubeMaster repository migration

## Goal
Publish the current TubeMaster project under `EloyEMC/tubemaster` without losing local history, uncommitted work, or the existing remote branch.

## Scope
- Preserve the current local Git history.
- Preserve the existing public target repository branch.
- Publish the local state to a separate migration branch first.
- Do not force-push or delete remote history.
- Do not include credentials, `.env` files, or local runtime state.

## Tasks
- [ ] Snapshot local migration state and compare histories.
- [ ] Publish the local state safely to `EloyEMC/tubemaster`.
- [ ] Verify the remote branch and document how to continue work.

## Evidence
- Source repository: `Gentleman-Programming/tubemaster`
- Target repository: `EloyEMC/tubemaster`
- Local branch at planning time: `feature-2`
- Target branch at planning time: `feature-2`
- Migration commit: `6db339e5c64a600836245ec832b4c9f5720a1cda`
- Target `feature-2` points to the migration commit.
- Verification: `npm test` — 326 passed, 0 failed, 0 skipped.

## Risks
The target repository is public and already contains a divergent history. Existing uncommitted changes must be preserved without staging unrelated files or exposing secrets.
