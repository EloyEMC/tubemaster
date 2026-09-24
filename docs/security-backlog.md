# Security and Stability Backlog

This document records security follow-up work without publishing exploit payloads or unverified production claims. Use it to prepare a maintainer issue or private security report when the repository is ready.

## Current baseline

- Branch: `feature-2`
- Last audit baseline after the first remediation slice: **15 findings**
  - 0 critical
  - 6 high
  - 7 moderate
  - 2 low
- Validation completed:
  - `npm run test` — 164 tests passed
  - `npm run lint` — passed
  - development server startup — passed
  - `/api/auth/providers` — Google provider returned successfully

## Completed first remediation slice

- Upgraded `next` from `16.2.2` to `16.3.1`.
- Upgraded `eslint-config-next` from `16.2.2` to `16.3.1`.
- Upgraded `next-auth` from `4.24.13` to `4.24.15`.
- Updated `package-lock.json` consistently.
- Removed the previously reported critical audit finding.

## Deferred audit findings

The remaining findings are primarily transitive dependencies. `drizzle-kit` and its `esbuild` chain are development tooling and must be handled separately from production runtime dependencies.

| Area | Packages | Current decision |
| --- | --- | --- |
| Development tooling | `drizzle-kit`, `esbuild`, `@esbuild-kit/*` | Defer until a compatible migration/tooling upgrade is identified. Do not accept the suggested major downgrade blindly. |
| Transitive runtime/tooling packages | `brace-expansion`, `fast-uri`, `hono`, `ip-address`, `js-yaml`, `ws` | Trace dependency paths and review changelogs before upgrading. |
| Lower-severity transitive packages | `@babel/core`, `@hono/node-server`, `body-parser`, `express-rate-limit`, `qs` | Remediate in the same dependency review when compatibility is understood. |

## Product hardening backlog

These items are intentionally separate from the dependency patch:

- Keep read operations and write operations visibly separated in Web UI, CLI, MCP, and API contracts.
- Preserve fail-closed `expectedChannelId` and `dryRun` safeguards.
- Add YouTube quota accounting and clear quota-exhaustion errors.
- Improve structured logs and operation traceability without logging credentials or tokens.
- Add representative security and authorization tests for every write route and MCP mutation tool.
- Document the production deployment model and the exact runtime dependency installation mode.
- Add `SECURITY.md` with the preferred private reporting channel.

## Issue/report gate

Before opening a public issue:

- Confirm whether the affected dependency is installed in the production runtime.
- Confirm the deployed Next.js version and deployment URL with the maintainer.
- Confirm whether private vulnerability reporting is enabled.
- Do not publish exploit payloads, proof-of-concept code, credentials, or private deployment details.
- Record exact package versions, advisory URLs, validation commands, and remaining uncertainty.

Use a private security report when a finding is confirmed reachable in production or could expose users, credentials, or availability. Use a public maintenance issue for development-only findings or dependency upgrades after maintainers classify the risk.

## Candidate issue title

`security: remediate remaining dependency findings and harden YouTube operations`

## Candidate issue scope

- Review the remaining `npm audit` findings and dependency paths.
- Separate production runtime remediation from development-tooling remediation.
- Update only compatible versions with tests, lint, and lockfile review.
- Add the quota, logging, authorization-test, and deployment-documentation safeguards listed above.
- Report exact validation evidence and any findings that remain intentionally deferred.
