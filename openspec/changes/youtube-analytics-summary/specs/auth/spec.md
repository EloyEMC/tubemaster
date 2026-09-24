# auth Specification (youtube-analytics-summary delta)

## Purpose

Define the scope constant addition and YOUTUBE_SCOPES preservation for the YouTube Analytics Summary feature.

## Requirements

### Requirement: Analytics read scope constant

The system MUST define a `YOUTUBE_ANALYTICS_READ_SCOPE` constant equal to `"https://www.googleapis.com/auth/yt-analytics.readonly"` for use in scope-gate checks.

#### Scenario: Scope constant is exported

- GIVEN the `auth` module
- THEN `YOUTUBE_ANALYTICS_READ_SCOPE` is exported with value `"https://www.googleapis.com/auth/yt-analytics.readonly"`

### Requirement: YOUTUBE_SCOPES array unchanged

The system MUST NOT add `YOUTUBE_ANALYTICS_READ_SCOPE` to the `YOUTUBE_SCOPES` array. Existing sessions MUST NOT silently gain analytics access.

#### Scenario: YOUTUBE_SCOPES does not contain analytics scope

- GIVEN the `YOUTUBE_SCOPES` array after the change
- THEN it does not include `"https://www.googleapis.com/auth/yt-analytics.readonly"`
- AND its length is unchanged from before the change

#### Scenario: Existing session tokens are unaffected

- GIVEN an existing session created before this change
- WHEN the session token is inspected
- THEN its granted scopes are unchanged
