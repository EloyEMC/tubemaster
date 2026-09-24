# Proposal: YouTube Analytics Summary

## Intent

Add a read-only `youtube-analytics-summary` module that exposes a single HTTP endpoint returning daily channel-level analytics (views, likes, comments, estimated minutes watched) over a date range. This is TubeMaster's first use of the YouTube Analytics API and the first endpoint requiring a scope (`yt-analytics.readonly`) that no existing session will have. The first slice is intentionally minimal: one `reports.query` call, fixed metrics, `day` dimension, observational quota accounting, and a typed 403 that tells the caller to reauthorize. Everything else—charts, exports, scheduling, persistence, comparisons, multi-channel UX, CLI/MCP surfaces, caching, and rate limiting—is deferred.

## Scope

### In Scope

- New `youtube-analytics-summary` core module under `src/lib/youtube-analytics-summary/`.
- Single service function: fetch daily channel analytics for the authenticated user's own channel.
- Input validation: `startDate` and `endDate` as `YYYY-MM-DD`, max 31-day range, `startDate <= endDate`, neither date in the future.
- Fixed metrics: `views`, `likes`, `comments`, `estimatedMinutesWatched`.
- Fixed dimension: `day`.
- Channel resolved from the authenticated session (no caller-supplied `channelId`).
- Scope gate: `yt-analytics.readonly` required. Existing sessions without this scope receive a **typed 403** (`AUTH_SCOPE_INSUFFICIENT`) with a machine-readable `requiredScopes` field and a human message directing reauthorization. No silent OAuth scope mutation or incremental consent.
- Observational quota accounting: record each `reports.query` call in the existing `QuotaAccountant` with a new `reports.query` entry (estimated 1 unit). Quota cost is observational, not enforced.
- Structured response contract and Zod schema.
- Unit tests for the service, schema validation, input validation, and scope-gate behavior.

### Out of Scope

- UI charts, visualizations, or any frontend rendering.
- CSV/JSON export endpoints or file generation.
- Scheduled or recurring analytics fetches.
- Persistent storage of analytics data (database, files, cache).
- Period-over-period or channel-over-channel comparisons.
- Multi-channel or Brand Account selection UX.
- CLI commands or MCP tools for analytics.
- Server-side caching or response deduplication.
- Rate limiting beyond YouTube's own API enforcement.
- Quota enforcement (blocking calls when quota is exhausted).
- Additional metrics, dimensions, filters, or sort options.
- Real-time or sub-daily granularity.

## Capabilities

### New Capabilities

- **`youtube-analytics-summary` (core)**: resolves the authenticated user's channel, calls YouTube Analytics `reports.query` with fixed metrics and `day` dimension over the requested date range, and returns a typed daily time-series response.

### Modified Capabilities

- **`auth`**: `yt-analytics.readonly` scope constant is defined for use in scope-gate checks but is **not** added to `YOUTUBE_SCOPES` (no silent scope expansion of existing sessions).
- **`quota/accountant`**: `YOUTUBE_QUOTA_COSTS` gains a `"reports.query"` entry (estimated 1 unit).

## Approach

### Module Structure

Follow the existing module pattern established by `video-metadata` and `playlist-management`:

- `src/lib/youtube-analytics-summary/contracts.ts` — public types.
- `src/lib/youtube-analytics-summary/schemas.ts` — Zod validation for inputs and outputs.
- `src/lib/youtube-analytics-summary/adapters/youtube-analytics-api.ts` — thin adapter wrapping the Google Analytics `reports.query` call.
- `src/lib/youtube-analytics-summary/services.ts` — orchestration: scope gate, credential resolution, channel lookup, analytics fetch, quota recording.
- `src/lib/youtube-analytics-summary/index.ts` — public barrel with injected dependencies.

### Auth & Scope Gate

1. Define `YOUTUBE_ANALYTICS_READ_SCOPE = "https://www.googleapis.com/auth/yt-analytics.readonly"` in `src/lib/auth.ts`.
2. Do **not** add it to `YOUTUBE_SCOPES` — existing sessions must not silently gain analytics access.
3. The service calls `authResolver.resolve()` with `requiredScopes: [YOUTUBE_ANALYTICS_READ_SCOPE]`, reusing the existing scope-insufficiency detection that returns `AUTH_SCOPE_INSUFFICIENT` with `missingScopes`.
4. On scope mismatch, the service returns a typed error result (not an exception) that the HTTP layer translates to 403 with `{ error: "AUTH_SCOPE_INSUFFICIENT", requiredScopes: ["yt-analytics.readonly"], message: "..." }`.

### Channel Resolution

The YouTube Analytics API `reports.query` accepts `ids=channel==MINE` when using the authenticated user's token. No separate `channels.list` call or caller-supplied `channelId` is needed. This avoids an extra quota cost and sidesteps Brand Account ambiguity in the first slice.

### YouTube Analytics API Call

Single `reports.query` request:

- `ids`: `channel==MINE`
- `startDate` / `endDate`: from validated input
- `metrics`: `views,likes,comments,estimatedMinutesWatched`
- `dimensions`: `day`
- `sort`: `day`

The adapter maps the raw Google API response rows into the typed `AnalyticsDayRow[]` contract. Empty results (channel has no data for the range) return an empty array, not an error.

### Quota Accounting

Add `"reports.query": 1` to `YOUTUBE_QUOTA_COSTS`. The YouTube Analytics API quota model differs from Data API v3 (it uses a daily reset and reports.query costs 1 unit per the official documentation). This is observational only—no enforcement logic.

### Response Contract

```typescript
type AnalyticsSummaryInput = {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
};

type AnalyticsDayRow = {
  date: string;       // YYYY-MM-DD
  views: number;
  likes: number;
  comments: number;
  estimatedMinutesWatched: number;
};

type AnalyticsSummaryResult = {
  kind: "analytics-summary";
  startDate: string;
  endDate: string;
  days: AnalyticsDayRow[];
};

type AnalyticsSummaryError = {
  kind: "analytics-summary-error";
  code: "INVALID_INPUT" | "AUTH_SCOPE_INSUFFICIENT" | "AUTH_REQUIRED" | "ANALYTICS_API_ERROR";
  message: string;
  requiredScopes?: string[];
};
```

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/auth.ts` | Modified | Add `YOUTUBE_ANALYTICS_READ_SCOPE` constant. |
| `src/lib/quota/accountant.ts` | Modified | Add `"reports.query": 1` to `YOUTUBE_QUOTA_COSTS`. |
| `src/lib/youtube-analytics-summary/*` | New | Entire new module: contracts, schemas, adapter, services, index, tests. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing users hit 403 on first analytics call | High (certain) | Typed error with `requiredScopes` and clear reauth message; documented in getting-started. |
| YouTube Analytics API returns empty rows for new/small channels | Med | Return empty `days[]` array; not an error condition. |
| `reports.query` quota cost is not 1 in practice | Low | Observational only; if cost differs, update the constant—no enforcement depends on it. |
| Google API client lacks `youtubeAnalytics` discovery | Low | Use `googleapis` package which includes YouTube Analytics; verify in adapter tests. |
| `channel==MINE` fails for Brand Accounts without explicit channel selection | Med | Acceptable for first slice; Brand Account UX is out of scope and documented as a follow-up. |

## Rollback Plan

Delete `src/lib/youtube-analytics-summary/`, revert the two-line changes to `auth.ts` (scope constant) and `accountant.ts` (quota cost entry). No database migrations, no schema migrations, no persistent state to clean up.

## Dependencies

- `googleapis` npm package (already in project) — must include `youtubeAnalytics` discovery document.
- Existing `authResolver` pattern from `video-metadata` / `playlist-management` for scope-gated credential resolution.
- Existing `QuotaAccountant` / `InMemoryQuotaAccountant` for observational quota recording.
- Zod (already in project) for input/output schema validation.

## Success Criteria

- [ ] `GET /api/youtube/analytics?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` returns a typed `AnalyticsSummaryResult` with daily rows for the authenticated user's channel.
- [ ] Request with `startDate > endDate`, range > 31 days, or future dates returns 422 with `INVALID_INPUT`.
- [ ] Session missing `yt-analytics.readonly` scope returns 403 with `AUTH_SCOPE_INSUFFICIENT` and `requiredScopes: ["yt-analytics.readonly"]`.
- [ ] `reports.query` call is recorded in `QuotaAccountant` with operation `"reports.query"`.
- [ ] Empty analytics data returns `{ days: [] }`, not an error.
- [ ] All existing tests continue to pass; `YOUTUBE_SCOPES` array is unchanged.
