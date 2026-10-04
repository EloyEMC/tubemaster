# TubeMaster issue #5 — active channel scope propagation slice

## Parent issue

`Gentleman-Programming/tubemaster#5` — Expand TubeMaster from playlist manager into channel operations platform.

## Focused slice

Propagate a resolved active channel identity from operation callers into quota accounting, without changing public reporting contracts.

## Scope

- Carry optional `channelId` through YouTube, playlist-management, and video-metadata quota call paths.
- Record channel identity on quota entries when known.
- Preserve existing behavior when channel identity is absent.
- Add focused propagation and accounting tests.

## Non-goals

- Web, CLI, or MCP reporting filters.
- New API contracts.
- Mutation semantics, analytics, audit, or authoritative Google quota balances.

## Allowed edit surfaces

- `src/lib/youtube.ts`
- `src/lib/playlist-management/adapters/youtube-api.ts`
- `src/lib/playlist-management/services.ts`
- `src/lib/playlist-management/services.test.ts`
- `src/lib/video-metadata/adapters/transcript-provider.ts`
- `src/lib/video-metadata/services.ts`
- `src/lib/video-metadata/services.test.ts`
- `src/lib/quota/accountant.ts`
- `src/lib/quota/accountant.test.ts`
- This task document

## Validation

- Focused propagation/accounting tests.
- Full test suite, TypeScript, lint, and `git diff --check`.
