# TubeMaster issue #16 — deterministic caption-track selection

## Status

- State: implemented and validated
- Issue: https://github.com/Gentleman-Programming/tubemaster/issues/16
- Branch: `feat/issue-16-transcript-track`
- Base: `upstream/feature-2`
- Approval: `status:approved`, `type:feature`

## Scope

Select YouTube caption tracks deterministically without changing public transcript behavior.

### In scope

- Ignore caption entries without an id.
- Select the first valid caption track in YouTube response order.
- Download exactly one selected track.
- Preserve selected language when present and omit it when absent.
- Preserve existing TranscriptResult variants, fallback behavior, diagnostics, auth, `YOUTUBE_READ_SCOPE`, quota behavior, and API/CLI/MCP envelopes.

### Out of scope

- Public language options, metadata fetch, sorting, additional providers, translation, normalization, persistence, indexing, embeddings, or semantic search.

## Tasks

- [x] Recover focused caption-track selection implementation and tests in the current adapter.
- [x] Validate focused and full tests, TypeScript, lint, diff checks, and build.
- [ ] Publish a focused PR linked to issue #16 (not authorized yet).

## Evidence

- Recovered implementation reference: `/Users/eloymartinezcuesta/Documents/Tubemaster-transcript-track-pr`.
- Historical source commit referenced in issue comments: `cab2140`.
- Selection uses the first caption with an id in response order, downloads it once, and only includes its language when present. No unrelated recovery changes were copied.

## Validation

- `node --import tsx --test src/lib/video-metadata/adapters/transcript-provider.test.ts`: passed (11/11).
- `npm test`: passed (258/258), including transcript API/CLI/MCP contracts.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed.
- `npm run build`: passed; no build limitation observed. Node emitted a `module.register()` deprecation warning during tests/build.
