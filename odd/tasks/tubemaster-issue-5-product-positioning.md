# TubeMaster issue #5 — product positioning

## Status

- State: ready for publication
- Issue: https://github.com/Gentleman-Programming/tubemaster/issues/5
- Branch: `feat/issue-5-product-positioning`
- Base: `upstream/feature-2` at `50f8b9b`
- Approval: `status:approved`
- Slice: product positioning and documentation

## Outcome

Align the README, getting-started guide, and interface documentation with TubeMaster's current channel-operations product scope, without changing runtime behavior.

## In scope

- Make the product positioning consistent across README, getting-started, and interface documentation; the runtime dashboard heading remains unchanged in this docs-only slice.
- Describe current supported workflows and their interfaces accurately.
- Distinguish the existing authenticated analytics summary API and local selected-video export from expanded analytics/reporting and future metadata/transcript increments.

## Out of scope

- New dashboard workflows or runtime behavior.
- API, CLI, MCP, authentication, quota, or safety contract changes.
- Autonomous publishing, semantic search, or broad roadmap implementation.

## Tasks

- [x] Update README, getting-started, and interfaces with the channel-operations answer, current workflows, interface boundaries, and roadmap limits.
- [x] Validate links, content consistency, and diff checks: 26/26 relative references valid, 5/5 anchors valid, and no consistency discrepancies remain.
- [x] Correct the publication blocker in docs only: add CLI playlist mutation confirmation and expected-channel flags, identify stderr for CLI errors, match add/remove partial-result fields, and distinguish existing analytics API/local export from roadmap reporting. Revalidate the corrected docs before publication.
- [x] Document the final analytics scope blocker: core OAuth defaults omit `yt-analytics.readonly`; the optional analytics summary API requires that scope in the authenticated grant, and existing users must re-authenticate after adding it to the authorization request. No OAuth code changed.
- [ ] Commit and publish a focused PR linked to issue #5.
