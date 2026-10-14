# TubeMaster roadmap: guarded channel operations before automation

TubeMaster is evolving from a channel-operations workspace toward agent-assisted analysis and publishing. The six phases below are priorities, not a release commitment. In particular, Shorts upload and scheduling are a **future Phase 6 proposal**, not available today; no autonomous publishing is planned.

## Quick path

1. Check [current status](#current-status) before assuming a feature exists.
2. Use the [phases](#phases) to locate future work.
3. For the client's Shorts request, review the [proposal](#phase-6-proposal-agent-assisted-shorts-upload-and-scheduling) and [safety requirements](#safety-requirements) before scoping implementation.

## Current status

**Delivered foundations:** guarded writes (`expectedChannelId`, `dryRun` where supported, and confirmations), typed errors, estimated quota visibility and observational operation logs; video selection and local JSON/CSV export, batch/preview foundations and an authenticated analytics summary API; transcript acquisition (including public acquisition and local Whisper support), timestamps and transcript UI; positioning and interface documentation; and the channel-thumbnail variant/protocol-relative URL fix. These are foundations, not a complete analytics, reporting, transcription-intelligence or publishing product. See [interface boundaries](./interfaces.md) for what each surface actually exposes. Quota estimates are not authoritative usage, and logs are not a durable audit database. The optional analytics scope requires separate authorization.

**Future:** expanded analytics and periodic reports, semantic transcript search, editorial/SEO planning, and agent-assisted Shorts upload/scheduling remain proposed work. Existing metadata and playlist mutations do not imply an upload or publish capability.

## Phases

| Phase | Direction | Boundary |
| --- | --- | --- |
| 1. Secure foundation | Supported dependencies, read/write separation, channel checks, confirmations, quota and logging | Core guards and observability exist; continue hardening before adding sensitive writes. |
| 2. Analytics | Channel/video trends, retention, traffic, Shorts performance and comparisons | Only the authenticated summary API exists; expanded analysis is future work. |
| 3. Reporting | Filters, multi-video analysis, reviewed batch changes, CSV/JSON and periodic reports | Selection/export and batch/preview foundations exist; periodic reports and broader workflows are future work. |
| 4. Intelligent transcripts | Acquisition/fallback, language normalization, local indexing, embeddings and semantic search | Acquisition, local Whisper and timestamps exist; knowledge-base features are future work. |
| 5. Editorial intelligence / SEO | Title/description suggestions, keywords, related videos, ideas and editorial calendar | Planning and optimization beyond existing metadata workflows are future work. |
| 6. Advanced automation | Analyze → propose → preview → approve → execute → measure | Future, human-authorized actions only; includes the Shorts slice below. |

## Phase 6 proposal: agent-assisted Shorts upload and scheduling

The client wants an agent to prepare a Short, upload it to the intended channel and schedule publication. Treat upload and scheduling as sensitive, distinct mutations rather than hiding them in metadata apply. The safe path is **select file → validate → prepare metadata → preview → confirm channel and time → upload private → schedule → verify status**. Approval must be bound to that specific file, channel, metadata and schedule, and obtained immediately before mutation.

The proposed contract accepts an authorized video file plus title, description, tags, category, language and privacy settings. Validate format, codec, size, duration and applicable current Shorts orientation/aspect-ratio rules; verify platform support before promising custom thumbnails. Require `expectedChannelId` on every write and offer `dryRun` that checks inputs and previews the action without uploading or publishing. Upload privately first; apply metadata and any supported thumbnail or playlist association as separately reviewable steps. Scheduling accepts `publishAt` with an explicit timezone, displays its UTC conversion, rejects ambiguous or past times, and keeps the video private until the authorized publication time. Query status and allow cancellation or return to private where the platform permits it; distinguish a cancelled schedule from an already published video.

Expose preparation, validation, preview, upload, scheduling, status and cancellation as separate MCP tools and equivalent CLI commands. Read/status calls must not mutate. Do not expose a one-call publish tool or imply an agent's proposal constitutes human approval. Responses should identify channel, video ID when available, state, scheduled time, estimated quota cost, actionable errors and whether compensation is possible, without leaking private content.

## Safety requirements

- Use only necessary documented OAuth scopes; fail closed on missing scopes, mismatched `expectedChannelId`, stale confirmation or changed file/metadata/time. Keep upload disabled by default behind an explicit capability.
- Constrain files to an authorized workspace; reject nonexistent, changed or out-of-bounds paths and path traversal. Define size, duration and temporary-storage limits before enabling uploads. Never log credentials, tokens, local paths or video contents.
- Make retries idempotent or reconcile by operation identity and remote state. A timeout must never trigger a blind second upload. Record partial outcomes and provide recoverable status.
- Estimate and observe quota for `videos.insert` and separate metadata, thumbnail and playlist operations; do not present estimates as Google's authoritative remaining quota.
- Define cancellation, retry and timezone policy; log who approved which channel, file identity and publication time without sensitive payloads. Reconfirm any changed candidate; measure the final outcome.

## Implementation order

1. Agree on states (`draft`, `validated`, `uploading`, `uploaded-private`, `scheduled`, `published`, `cancelled`, `failed`), authorization boundaries and operation identity.
2. Add local validation and side-effect-free `dryRun`/preview; test malformed files, stale approvals and wrong channels.
3. Add confirmed single-video private upload with reconciliation after timeouts; keep metadata, thumbnail and playlist actions separate.
4. Add `publishAt` scheduling, timezone conversion, status and cancellation/recovery rules.
5. Expose separate CLI/MCP operations and a review/history UI; exercise quota, scope failures, retries and cancellation on a test channel before production enablement.

## Non-goals

No autonomous publishing, bulk Shorts upload without per-item preview and confirmation, automatic video/audio/script generation, timezone-free scheduling, or upload disguised as a generic metadata update. This document does not authorize implementation or promise a delivery date.

## Next step

Review the Phase 6 contract and safety gates with the client, then scope small, approved implementation slices; keep expanded analytics, reporting, transcript intelligence and SEO on their respective phase tracks. No runtime change is part of this documentation update.
