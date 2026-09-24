# youtube-analytics-summary Specification

## Purpose

Expose a read-only service that fetches daily channel-level YouTube Analytics (views, likes, comments, estimated minutes watched) over a validated date range for the authenticated user's own channel.

## Requirements

### Requirement: Strict date input validation

The system MUST accept `startDate` and `endDate` as `YYYY-MM-DD` strings and SHALL reject any request where the format is invalid, `startDate > endDate`, the range exceeds 31 days, or either date is in the future (relative to the server's current date). Rejection MUST produce an `INVALID_INPUT` error.

#### Scenario: Valid date range

- GIVEN an authenticated session with `yt-analytics.readonly` scope
- WHEN `startDate="2025-01-01"` and `endDate="2025-01-15"` are provided
- THEN the request proceeds to the analytics fetch

#### Scenario: Start date after end date

- GIVEN an authenticated session
- WHEN `startDate="2025-01-20"` and `endDate="2025-01-10"` are provided
- THEN the system returns an `INVALID_INPUT` error
- AND no YouTube API call is made

#### Scenario: Range exceeds 31 days

- GIVEN an authenticated session
- WHEN `startDate="2025-01-01"` and `endDate="2025-02-02"` are provided (33 days)
- THEN the system returns an `INVALID_INPUT` error
- AND no YouTube API call is made

#### Scenario: Exactly 31-day range is accepted

- GIVEN an authenticated session
- WHEN `startDate="2025-01-01"` and `endDate="2025-01-31"` are provided
- THEN the request proceeds to the analytics fetch

#### Scenario: Future start date

- GIVEN today is `2025-06-15` and an authenticated session
- WHEN `startDate="2025-06-16"` is provided
- THEN the system returns an `INVALID_INPUT` error

#### Scenario: Future end date

- GIVEN today is `2025-06-15` and an authenticated session
- WHEN `endDate="2025-06-16"` is provided
- THEN the system returns an `INVALID_INPUT` error

#### Scenario: Invalid date format

- GIVEN an authenticated session
- WHEN `startDate="01/01/2025"` is provided
- THEN the system returns an `INVALID_INPUT` error

### Requirement: Authenticated session required

The system MUST require an authenticated session to fetch analytics. An unauthenticated request MUST return an `AUTH_REQUIRED` error.

#### Scenario: No session present

- GIVEN no authenticated session is available
- WHEN a summary is requested
- THEN the system returns an `AUTH_REQUIRED` error
- AND no YouTube API call is made

### Requirement: Scope-gated access with typed 403

The system MUST require the `yt-analytics.readonly` scope (`https://www.googleapis.com/auth/yt-analytics.readonly`). When the resolved credentials lack this scope, the system SHALL return an `AUTH_SCOPE_INSUFFICIENT` error with a machine-readable `requiredScopes` field containing `"yt-analytics.readonly"` and a human-readable message directing reauthorization. The system MUST NOT silently mutate OAuth scopes or perform incremental consent.

#### Scenario: Session missing analytics scope

- GIVEN an authenticated session whose token lacks `yt-analytics.readonly`
- WHEN a summary is requested
- THEN the system returns an `AUTH_SCOPE_INSUFFICIENT` error
- AND `requiredScopes` includes `"yt-analytics.readonly"`
- AND the message directs the user to reauthorize
- AND no YouTube API call is made

#### Scenario: Session with analytics scope

- GIVEN an authenticated session whose token includes `yt-analytics.readonly`
- WHEN a valid summary is requested
- THEN the system proceeds to the analytics fetch

### Requirement: Fixed channel==MINE reports.query request

The system MUST use `ids=channel==MINE` in the YouTube Analytics `reports.query` call, resolving the channel from the authenticated session's token. The system MUST NOT accept a caller-supplied `channelId` parameter.

#### Scenario: reports.query uses channel==MINE

- GIVEN an authenticated session with required scope and valid date range
- WHEN the analytics fetch executes
- THEN the `reports.query` request includes `ids=channel==MINE`
- AND no separate `channels.list` call is made

### Requirement: Fixed metrics, dimension, and sort

The system MUST request exactly the metrics `views,likes,comments,estimatedMinutesWatched`, dimension `day`, and sort `day` in the `reports.query` call. No additional metrics, dimensions, filters, or sort options are permitted.

#### Scenario: reports.query parameters are fixed

- GIVEN an authenticated session with required scope and valid date range
- WHEN the analytics fetch executes
- THEN the `reports.query` request includes `metrics=views,likes,comments,estimatedMinutesWatched`
- AND `dimensions=day`
- AND `sort=day`

### Requirement: Response normalization and empty rows

The system MUST map the raw YouTube Analytics response rows into a typed `AnalyticsDayRow[]` contract where each row contains `date` (YYYY-MM-DD), `views`, `likes`, `comments`, and `estimatedMinutesWatched`. When the API returns no rows (new channel, no activity in range), the system MUST return an empty `days` array and MUST NOT treat it as an error.

#### Scenario: Non-empty analytics response

- GIVEN the YouTube Analytics API returns rows for the requested range
- WHEN the response is normalized
- THEN each row is mapped to an `AnalyticsDayRow` with `date`, `views`, `likes`, `comments`, `estimatedMinutesWatched`
- AND the result `kind` is `"analytics-summary"`
- AND `startDate` and `endDate` reflect the requested range

#### Scenario: Empty analytics response

- GIVEN the YouTube Analytics API returns zero rows for the requested range
- WHEN the response is normalized
- THEN `days` is an empty array
- AND the result `kind` is `"analytics-summary"`
- AND no error is returned

### Requirement: Observational quota recording with failure isolation

The system MUST record each `reports.query` call in `QuotaAccountant` with operation `"reports.query"` (estimated 1 unit). Quota recording is observational only — it MUST NOT block or reject calls based on quota exhaustion. A failed `reports.query` call MUST still be recorded as a quota entry.

#### Scenario: Quota recorded on successful analytics fetch

- GIVEN a `QuotaAccountant` is available
- AND the `reports.query` call succeeds
- WHEN the analytics fetch completes
- THEN a `"reports.query"` entry is recorded in the accountant

#### Scenario: Quota recorded on failed analytics fetch

- GIVEN a `QuotaAccountant` is available
- AND the `reports.query` call fails with a YouTube API error
- WHEN the analytics fetch completes
- THEN a `"reports.query"` entry is still recorded in the accountant

#### Scenario: Quota recording failure does not affect response

- GIVEN a `QuotaAccountant` that throws on record
- WHEN the analytics fetch succeeds
- THEN the successful result is still returned
- AND the quota recording failure is isolated

### Requirement: API status and error mappings

The system MUST map YouTube Analytics API errors to typed `AnalyticsSummaryError` codes. A 403 from YouTube with insufficient permissions MUST map to `ANALYTICS_API_ERROR`. A network failure or 5xx MUST map to `ANALYTICS_API_ERROR`. The error response MUST always include `kind: "analytics-summary-error"` and a human-readable `message`.

#### Scenario: YouTube API returns 403

- GIVEN the YouTube Analytics API returns HTTP 403
- WHEN the response is processed
- THEN the system returns `ANALYTICS_API_ERROR`
- AND `kind` is `"analytics-summary-error"`

#### Scenario: YouTube API returns 5xx

- GIVEN the YouTube Analytics API returns HTTP 500 or 503
- WHEN the response is processed
- THEN the system returns `ANALYTICS_API_ERROR`

#### Scenario: Network error during API call

- GIVEN the YouTube Analytics API call fails with a network error
- WHEN the failure is caught
- THEN the system returns `ANALYTICS_API_ERROR`

### Requirement: No caller-supplied channelId

The system MUST NOT expose a `channelId` parameter in its input contract. The channel is resolved exclusively from the authenticated session via `channel==MINE`.

#### Scenario: Input contract has no channelId

- GIVEN the `AnalyticsSummaryInput` type definition
- THEN it contains only `startDate` and `endDate`
- AND it does not contain `channelId`
