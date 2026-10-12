# TubeMaster issue #24 — authenticated transcript dashboard UX

## Status

- State: in progress
- Issue: https://github.com/Gentleman-Programming/tubemaster/issues/24
- Branch: `feat/issue-24-transcript-dashboard-ux`
- Base: `upstream/feature-2`
- Approval: `status:approved`, `type:feature`
- Dependency: issue #23 is closed/merged

## Scope

Add an authenticated dashboard section for requesting transcripts from a YouTube URL or video ID with explicit provider selection.

### In scope

- Normalize a YouTube URL or 11-character video ID.
- Let users explicitly choose `youtube-captions` or `yt-dlp`.
- Send requests through the existing transcript API without changing envelopes.
- Show loading, available transcript text/language, no-captions, unsupported-provider, auth, and generic error states.
- Follow existing dashboard styling and add accessible labels/live regions where practical.
- Add component/API tests for parsing, provider selection, success, no-captions, and errors.

### Out of scope

- Embeddings, semantic search, indexing, persistence, metadata generation, scheduling, unauthenticated endpoints, automatic provider fallback, or OAuth changes.

## Tasks

- [x] Recover the focused dashboard transcript UX and tests onto current `feature-2`, preserving channel thumbnail fallbacks and quota link.
- [x] Validate focused/full tests, TypeScript, lint, diff checks, and build (results below).
- [ ] Complete authenticated local browser smoke after commit.
- [ ] Open a focused PR linked to issue #24 (not authorized yet).

## Evidence

- Recovered implementation reference: `/Users/eloymartinezcuesta/Documents/Tubemaster-transcript-dashboard-ux-pr`.
- Issue #23 dependency is merged into current feature-2 as PR #58 (`ed2c933`).
- Prior issue comments noted server smoke passed but authenticated browser verification was pending; local OAuth environment is now available for manual testing.
- `node --import tsx --test src/components/transcript-dashboard.test.tsx`: passed, 4/4.
- `node --import tsx --test src/app/api/video-metadata/transcript/route.test.ts`: passed, 6/6.
- `npm test`: passed, 265/265 (the configured glob covers `*.test.ts`; the component `*.test.tsx` ran separately above).
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed.
- `npm run build`: passed; `/dashboard` and the transcript API route included in route output.
- Authenticated browser smoke: pending after commit; explicit yt-dlp path is now wired through UI → transcript API → core → adapter.
- Live issue24 reproduction: `yt-dlp --output -` wrote `-.en.vtt` rather than subtitle text on stdout, yielding unavailable. Provider now uses a unique temporary output directory, reads generated VTT/SRT when stdout has no captions, and removes the directory after success or failure.
- `node --import tsx --test src/lib/video-metadata/adapters/yt-dlp-transcript-provider.test.ts src/lib/video-metadata/adapters/transcript-provider.test.ts src/app/api/video-metadata/transcript/route.test.ts src/components/transcript-dashboard.test.tsx`: passed, 28/28.
- `npm test`: passed, 268/268 (`*.test.ts`; component `*.test.tsx` included in focused command).
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed.
- `npm run build`: passed; transcript API and dashboard routes present. Manual local smoke still pending.
