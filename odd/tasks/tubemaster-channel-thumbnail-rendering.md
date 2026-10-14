# Channel thumbnail rendering fix

## Status

- State: ready for publication
- Branch: `fix/channel-thumbnail-rendering`
- Base: `upstream/feature-2` at `88c240e`
- Report: channel title/video count render, but channel image is absent in authenticated dashboard screenshot.

## Scope

Restore reliable channel image rendering from YouTube thumbnail variants while preserving existing fallback behavior and API contracts.

## Tasks

- [x] Add focused regression coverage for YouTube `standard`/`maxres` variants and protocol-relative thumbnail URLs, including the channel-info response.
- [x] Extend candidate normalization without changing the route response shape or dashboard fallback behavior.
- [x] Run focused tests, full suite, type checking, lint, diff check, and build; authenticated browser smoke remains pending because the existing server uses a different worktree.

## Diagnosis and validation

The screenshot establishes that channel-info returned title and count, but does not expose the provider's thumbnail payload. The candidate helper previously considered only `high`, `medium`, and `default` and rejected protocol-relative URLs. Either an otherwise valid thumbnail in an omitted variant or a protocol-relative URL would leave the candidate list empty and suppress the dashboard `<img>`. The route already passes the provider thumbnails to that helper; no API response or auth/quota change is needed. The exact thumbnail payload behind the screenshot remains unverified. Validation: focused thumbnail/channel-info/dashboard tests 19/19 after a rerun; full suite 273/273; TypeScript, lint, diff check, and build pass. Authenticated browser verification remains pending because the existing server uses `/tmp/tubemaster-issue24`, not this candidate worktree.
