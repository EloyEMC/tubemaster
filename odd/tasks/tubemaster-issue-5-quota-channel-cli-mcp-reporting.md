# TubeMaster issue #5 — channel-filtered CLI/MCP quota reporting

## Goal

Implement standalone, read-only CLI and MCP quota reporting with optional channel filtering on the merged `upstream/feature-2` base.

## Scope

- `src/cli/quota.ts` and focused tests.
- `src/mcp/quota.ts` and focused tests.
- Interface documentation for invocation, filtering semantics, authentication, stable envelopes, and estimate notices.

## Semantics

- Omitted `channelId` and `channelId=all` include all channels.
- `channelId=null` and MCP `channelId: null` select unassigned/legacy usage.
- Explicit channel IDs are non-empty and match `[A-Za-z0-9_-]+`.
- Reports remain scoped to the active authenticated user; caller scope overrides are rejected.
- Success and failure envelopes remain stable and estimates remain explicitly non-authoritative.

## Non-goals

No changes to core accounting, persistence, callers, web/server registration, or mutations. No commit.

## Tasks

1. Implement standalone CLI filtering and envelopes.
2. Implement standalone MCP filtering and envelopes.
3. Add focused tests and docs.
4. Run `npm test`, `npx tsc --noEmit`, `npm run lint`, and `git diff --check`.

## Status

Standalone CLI/MCP handlers, focused tests, and interface documentation implemented. Registration and caller wiring remain out of scope. Runtime channel-aware reporting depends on the separate channel persistence slice adding `channel_id` to `quota_entries`; the current base schema does not contain it.

## Evidence

Behavioral references only: branch `feat/quota-channel-reporting-cli-mcp` and recovered commit `18c9a36`.
