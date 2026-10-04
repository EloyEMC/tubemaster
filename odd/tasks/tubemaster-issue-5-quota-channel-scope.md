# TubeMaster issue #5 — channel-aware quota persistence slice

## Parent issue

`Gentleman-Programming/tubemaster#5` — Expand TubeMaster from playlist manager into channel operations platform.

## Focused slice

Make quota accounting and durable usage aggregation channel-aware without changing operation callers or reporting surfaces.

## Scope

- Store optional channel identity with quota usage records.
- Aggregate and filter usage by channel while preserving existing user/global behavior.
- Keep SQLite schema/index initialization safe and backward-compatible.
- Add focused accountant/repository/database tests.

## Non-goals

- Propagating active channel context through YouTube, playlist, or video-metadata operations.
- API, dashboard, CLI, or MCP contract changes.
- Mutation, analytics, audit, or authoritative Google quota balance behavior.

## Allowed edit surfaces

- `src/lib/db.ts`
- `src/lib/quota/accountant.ts`
- `src/lib/quota/accountant.test.ts`
- `src/lib/quota/repository.ts`
- This task document

## Implementation plan

- Add nullable `channel_id` to both quota table creation paths; detect and migrate older tables before creating the scope/bucket/channel index.
- Persist an optional channel ID from the durable accountant without changing `record()` or the existing scope shape.
- Keep omitted repository channel filters aggregating all rows; explicit IDs and `null` select their respective rows.
- Test channel separation, unfiltered legacy totals, and repeated initialization of an old table.

## Validation plan

- Focused quota test: `node --import tsx --test src/lib/quota/accountant.test.ts` — passed, 7 tests.
- Full test suite: `npm test` — passed, 171 tests.
- TypeScript: `npx tsc --noEmit` — passed with no diagnostics.
- Lint: `npm run lint` — passed with no errors.
- `git diff --check` — passed with exit code 0.
