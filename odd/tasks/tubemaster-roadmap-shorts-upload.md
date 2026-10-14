# TubeMaster roadmap documentation — Shorts upload and scheduling

## Status

- State: published for review
- Branch: `docs/roadmap-shorts-upload`
- Base: `upstream/feature-2` at `21847a1`
- Source: client request and competitive-priorities roadmap

## Outcome

Add the roadmap to the repository documentation and document the proposed agent-controlled Shorts upload and scheduling capability without implementing runtime behavior.

## In scope

- Add a canonical `docs/roadmap.md` covering current status, phases, and future priorities.
- Document secure Shorts upload/scheduling requirements and implementation order.
- Link the roadmap from `README.md`.

## Out of scope

- Creating or approving a GitHub issue.
- Upload, scheduling, OAuth, API, CLI, MCP, or dashboard code.
- Claiming future capabilities are already implemented.

## Tasks

- [x] Add roadmap documentation and README link.
- [x] Validate links, consistency, and diff checks: 21/21 local links/images valid; content audit passed; trailing-whitespace audit passed.
- [x] Commit and publish a docs-only PR; merge requires explicit authorization.

## Evidence

- Work-unit commit: `9560877` (`docs(roadmap): document Shorts upload automation`).
- PR #63: https://github.com/Gentleman-Programming/tubemaster/pull/63.
- PR state: OPEN/MERGEABLE with exactly one `type:feature` label; no automated checks reported.
- Runtime code was not changed.
