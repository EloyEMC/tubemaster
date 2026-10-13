# TubeMaster issue #26 — local Whisper transcript timestamps

## Status

- State: published for review
- Issue: https://github.com/Gentleman-Programming/tubemaster/issues/26
- Branch: `feat/issue-26-whisper-timestamps`
- Base: `upstream/feature-2`
- Approval: `status:approved`, `type:feature`
- Dependency: issue #25 is closed

## Scope

Format local Whisper transcript segments with readable timestamps in the dashboard while preserving segment timing metadata for future navigation/search.

### In scope

- Format local Whisper segment timestamps readably.
- Preserve segment timing metadata.
- Keep existing plain-text response backward-compatible where possible.
- Add tests for timestamp formatting and segment ordering.

### Out of scope

- Embeddings, search, persistence, or unrelated transcript behavior.

## Tasks

- [x] Recover focused Whisper timestamp formatting and tests onto current feature-2; retain plain-text fallback and segment timing contract.
- [x] Validate focused/full tests, TypeScript, lint, diff check, and build; local browser smoke is not applicable without a local Whisper acquisition provider in this slice.
- [x] Commit locally and publish a focused PR linked to issue #26.

## Evidence

- Issue #25 dependency is closed.
- Historical local Whisper implementation reference: `/Users/eloymartinezcuesta/Documents/Tubemaster-transcript-local-whisper-pr`.
- Validation: focused transcript tests 13/13; full suite 271/271; TypeScript, lint, diff check, and build pass; build generated 22/22 static pages.
- Next.js route-handler and Server/Client Component guides were read before validation.
- No local Whisper acquisition provider was copied; only rendering and response metadata were recovered, so browser acquisition smoke is not applicable.
- Work-unit commit: `2be82ae` (`feat(transcripts): format local Whisper timestamps`).
- Published PR: #60, https://github.com/Gentleman-Programming/tubemaster/pull/60; OPEN/MERGEABLE with `type:feature`; no automated GitHub checks reported.
