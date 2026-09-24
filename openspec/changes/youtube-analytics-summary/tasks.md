# Tasks: YouTube Analytics Summary

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~230 (additions + deletions) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (first slice only) |
| Delivery strategy | single-pr |
| Chain strategy | N/A |

```
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: N/A
400-line budget risk: Low
```

## Line Estimate Breakdown

**New core module files (~290 lines total):**

- `src/lib/youtube-analytics-summary/contracts.ts`: ~40 lines (types)
- `src/lib/youtube-analytics-summary/schemas.ts`: ~40 lines (Zod schemas)
- `src/lib/youtube-analytics-summary/adapters/youtube-analytics-api.ts`: ~60 lines (adapter wrapper)
- `src/lib/youtube-analytics-summary/services.ts`: ~80 lines (service orchestration)
- `src/lib/youtube-analytics-summary/index.ts`: ~20 lines (barrel export)
- `src/app/api/youtube/analytics/route.ts`: ~50 lines (API route)

**Modified existing files (~5 lines total):**

- `src/lib/auth.ts`: +3 lines (add `YOUTUBE_ANALYTICS_READ_SCOPE` constant)
- `src/lib/quota/accountant.ts`: +2 lines (add `"reports.query": 1` to `YOUTUBE_QUOTA_COSTS`)

**Test files (~70 lines total):**

- `src/lib/youtube-analytics-summary/__tests__/contracts.test.ts`: ~10 lines
- `src/lib/youtube-analytics-summary/__tests__/schemas.test.ts`: ~25 lines
- `src/lib/youtube-analytics-summary/__tests__/adapters/youtube-analytics-api.test.ts`: ~30 lines
- `src/lib/youtube-analytics-summary/__tests__/services.test.ts`: ~40 lines (combined with service)
- `src/app/api/youtube/analytics/__tests__/route.test.ts`: ~25 lines

**Total estimate**: ~330-370 lines (well within the 400-line budget)

## Implementation Tasks

### Phase 1: Constants and Scope Preservation

- [x] Add `YOUTUBE_ANALYTICS_READ_SCOPE` constant to `src/lib/auth.ts` with value `"https://www.googleapis.com/auth/yt-analytics.readonly"` and export it. Verify `YOUTUBE_SCOPES` array remains unchanged (same length, no analytics scope added). <!-- sdd-owner: implementation -->
- [x] Add `"reports.query": 1` entry to `YOUTUBE_QUOTA_COSTS` in `src/lib/quota/accountant.ts`. Verify no enforcement logic references this new entry. <!-- sdd-owner: implementation -->

### Phase 2: Contracts and Schemas

- [x] Create `src/lib/youtube-analytics-summary/contracts.ts` with `AnalyticsSummaryInput`, `AnalyticsDayRow`, `AnalyticsSummaryResult`, `AnalyticsSummaryError`, `AnalyticsSummaryErrorCode`, and `AnalyticsSummaryDependencies` types. Ensure no `channelId` appears in any input contract. <!-- sdd-owner: implementation -->
- [x] Create `src/lib/youtube-analytics-summary/schemas.ts` with `analyticsSummaryInputSchema` (validating YYYY-MM-DD format) and `analyticsSummaryResultSchema` with `analyticsDayRowSchema` for output validation. <!-- sdd-owner: implementation -->
- [x] Write tests in `src/lib/youtube-analytics-summary/__tests__/contracts.test.ts` verifying exported types exist and `AnalyticsSummaryInput` contains only `startDate` and `endDate`. <!-- sdd-owner: implementation -->
- [x] Write tests in `src/lib/youtube-analytics-summary/__tests__/schemas.test.ts` for valid/invalid date formats, empty results, and required field validation. <!-- sdd-owner: implementation -->

### Phase 3: Date Validation

- [x] Implement strict date validation in `src/lib/youtube-analytics-summary/services.ts`: parse YYYY-MM-DD as UTC calendar date, reject impossible dates (e.g., `2025-02-30`), validate `startDate <= endDate`, ensure range ≤ 31 days, and reject future dates using injected `now()` (default `() => new Date()`). Inject `now` as dependency for testability. <!-- sdd-owner: implementation -->
- [x] Write date validation tests in `src/lib/youtube-analytics-summary/__tests__/services.test.ts`: valid ranges, invalid formats, impossible dates, `startDate > endDate`, 32-day rejection, exactly 31-day acceptance, and future date rejection. Verify no auth/provider/quota calls on validation failure. <!-- sdd-owner: implementation -->

### Phase 4: Analytics Adapter

- [x] Create `src/lib/youtube-analytics-summary/adapters/youtube-analytics-api.ts` with a `createYoutubeAnalyticsApi()` factory that accepts `credentials` and returns a `query()` method. The method constructs `google.youtubeAnalytics({ version: "v2", auth })` and makes an exact `reports.query` call with fixed parameters: `ids: "channel==MINE"`, metrics `views,likes,comments,estimatedMinutesWatched`, dimensions `day`, sort `day`, and dates from arguments. Map `response.rows ?? []` using `columnHeaders` names (not array positions) to `AnalyticsDayRow[]`, converting metrics to finite numbers. <!-- sdd-owner: implementation -->
- [x] Write adapter tests in `src/lib/youtube-analytics-summary/__tests__/adapters/youtube-analytics-api.test.ts`: mock `google.youtubeAnalytics` to assert exact v2 request shape with all fixed parameters, test header-ordered row mapping, empty rows handling, malformed rows returning `ANALYTICS_API_ERROR`, and 403/5xx/network failures mapping to provider errors. <!-- sdd-owner: implementation -->

### Phase 5: Service Orchestration

- [x] Implement the service function in `src/lib/youtube-analytics-summary/services.ts` that: (1) validates dates first (no downstream calls if invalid), (2) resolves credentials via `authResolver.resolve()` with `requiredScopes: [YOUTUBE_ANALYTICS_READ_SCOPE]`, (3) maps scope-insufficiency to `AUTH_SCOPE_INSUFFICIENT` with `requiredScopes: ["yt-analytics.readonly"]` and reauth message, (4) calls `youtubeAnalyticsApi.query()` with resolved credentials and validated dates, (5) records quota via `safeAccount()` with operation `"reports.query"` in a finally block (including failures), (6) maps provider errors to `ANALYTICS_API_ERROR`, (7) validates final output via schema, and (8) returns typed success/error. Ensure quota recording failures never alter the result. <!-- sdd-owner: implementation -->
- [x] Write service tests in `src/lib/youtube-analytics-summary/__tests__/services.test.ts`: unauthenticated (`AUTH_REQUIRED`), missing scope (`AUTH_SCOPE_INSUFFICIENT`) with `requiredScopes`, valid success with row normalization, empty results as success, provider 403/5xx/network as `ANALYTICS_API_ERROR`, quota recording on success and failure, and accountant throw isolation. Assert exact fixed adapter arguments and no calls before validation passes. <!-- sdd-owner: implementation -->

### Phase 6: Module Index and Barrel

- [x] Create `src/lib/youtube-analytics-summary/index.ts` exporting the public service factory `createYoutubeAnalyticsSummary()` which accepts injected dependencies (authResolver, youtubeAnalyticsApi, quotaAccountant, quotaAccountantFactory, operationIdFactory, now). Wire `resolveGoogleCredentials`, `createYoutubeAnalyticsApi`, and `createDurableQuotaAccountantFactory` as defaults. <!-- sdd-owner: implementation -->

### Phase 7: API Route and Status Mappings

- [x] Create `src/app/api/youtube/analytics/route.ts` as a Next.js API route handler that: (1) extracts session from `getServerSession()`, (2) returns 401 with `AUTH_REQUIRED` if no session, (3) parses `startDate` and `endDate` from query parameters, (4) calls the core service with `credentialRef: session.user.id`, (5) maps success to 200, `AUTH_REQUIRED` to 401, `AUTH_SCOPE_INSUFFICIENT` to 403 with `requiredScopes`, `INVALID_INPUT` to 422, and `ANALYTICS_API_ERROR` to 502, (6) logs unexpected failures and returns 500 without exposing details. Use the public service factory from the index barrel. <!-- sdd-owner: implementation -->
- [x] Write route tests in `src/app/api/youtube/analytics/__tests__/route.test.ts`: unauthenticated 401, query parsing and 422 on invalid input, scope 403 with `requiredScopes`, successful 200 response with correct shape, and provider failure 502. Mock the core factory or inject a route-level callable to avoid NextAuth/Google dependencies. <!-- sdd-owner: implementation -->

### Phase 8: Auth and Quota Verification Tests

- [x] Add test in existing `src/lib/auth/__tests__/auth.test.ts` verifying `YOUTUBE_ANALYTICS_READ_SCOPE` equals the exact scope value and `YOUTUBE_SCOPES` array length is unchanged (no analytics scope added). <!-- sdd-owner: implementation -->
- [x] Add test in existing `src/lib/quota/__tests__/accountant.test.ts` verifying `YOUTUBE_QUOTA_COSTS["reports.query"] === 1` and `"reports.query"` is a valid `QuotaOperation`. Verify no enforcement gate references it. <!-- sdd-owner: implementation -->

### Phase 9: Final Validation

- [x] Run all tests and verify no regressions in existing auth/quota/video/playlist modules. Confirm `YOUTUBE_SCOPES` is semantically unchanged and all new tests pass. <!-- sdd-owner: implementation -->
- [x] Document manual live endpoint verification as deferred because no reauthorized external YouTube session is available; automated adapter/service/route contract tests cover the behavior. <!-- sdd-owner: implementation -->
- [x] Document manual live scope-gate verification as deferred because no reauthorized external YouTube session is available; automated scope-gate and route tests cover the behavior. <!-- sdd-owner: implementation -->
