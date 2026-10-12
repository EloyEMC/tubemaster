# TubeMaster issue #23 — recover explicit public transcript provider

## Status

- State: implementation recovered and validated locally
- Issue: https://github.com/Gentleman-Programming/tubemaster/issues/23 (closed dependency)
- Branch: `feat/issue-23-public-provider`
- Base: `upstream/feature-2`

## Problem

Issue #24's dashboard exposes `yt-dlp`, but current `feature-2` only implements `youtube-captions`; public-provider requests return `unsupported` despite issue #23 being closed on GitHub.

## Scope

Recover only the missing explicit public transcript provider boundary required by issue #24:

- Keep `youtube-captions` as the default.
- Add/compose the existing `yt-dlp` adapter without automatic fallback.
- Make explicit `yt-dlp` selection avoid Google OAuth credentials.
- Fail closed for unsupported provider values.
- Preserve transcript result, API/CLI/MCP, normalization, chunking, indexing, quota, and operation identity contracts.
- Document local `yt-dlp` setup and privacy/terms limitations.

## Tasks

- [x] Recover focused provider adapter/composition and tests onto current feature-2.
- [x] Run focused tests, full suite, TypeScript, lint, diff check, and build with installed dependencies.
- [ ] Parent to review and decide publication; no push or PR in this recovery transaction.

## Local validation

- `node --import tsx --test src/lib/video-metadata/adapters/yt-dlp-transcript-provider.test.ts src/lib/video-metadata/adapters/transcript-provider.test.ts src/lib/video-metadata/services.test.ts src/cli/video-metadata.test.ts`: 75 passed, 0 failed.
- `npm test`: 264 passed, 0 failed (before a test-only TypeScript cast correction; focused tests rerun afterward).
- `npx tsc --noEmit`: initial failure TS2352 in `src/cli/video-metadata.test.ts:19` (incomplete mock cast); corrected; rerun passed.
- `npm run lint`: passed.
- `git diff --check`: passed.
- `npm run build`: passed (Next.js 16.2.2, 22 static pages).
- `command -v yt-dlp`: `/opt/homebrew/bin/yt-dlp`; `yt-dlp --version`: `2026.08.19`.
- A live public-video smoke is possible without Google credentials using the installed executable and a public video ID, but requires a network request to YouTube; no live smoke was executed in this validation.

## Evidence

- Historical provider-core reference: `/Users/eloymartinezcuesta/Documents/Tubemaster-transcript-public-core-pr`.
- Historical provider-acquisition reference: `/Users/eloymartinezcuesta/Documents/Tubemaster-transcript-public-acquisition-pr`.
- Issue #23 comments identify the ordered chain through historical PRs #17 and #18.
