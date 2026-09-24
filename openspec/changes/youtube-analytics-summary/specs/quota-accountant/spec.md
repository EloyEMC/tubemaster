# quota-accountant Specification (youtube-analytics-summary delta)

## Purpose

Define the addition of the `reports.query` quota cost entry for observational YouTube Analytics API accounting.

## Requirements

### Requirement: reports.query quota cost entry

The system MUST include a `"reports.query"` entry in `YOUTUBE_QUOTA_COSTS` with an estimated cost of `1` unit.

#### Scenario: Quota cost entry exists

- GIVEN the `YOUTUBE_QUOTA_COSTS` object
- THEN it includes a `"reports.query"` key with value `1`

#### Scenario: reports.query is a valid QuotaOperation

- GIVEN the `QuotaOperation` type derived from `keyof typeof YOUTUBE_QUOTA_COSTS`
- THEN `"reports.query"` is a valid value of that type

### Requirement: Quota cost is observational

The `"reports.query"` entry is observational only. The system MUST NOT enforce quota limits based on this entry.

#### Scenario: No enforcement logic added

- GIVEN the quota accountant after the change
- THEN no enforcement gate references `"reports.query"`
- AND recording a `"reports.query"` entry never blocks a subsequent call
