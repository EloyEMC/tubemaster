# Contributing to TubeMaster

TubeMaster welcomes focused contributions that keep the Web UI, CLI, MCP server, and API contracts safe for people and automation. This document is the canonical collaboration guide for human contributors and AI coding agents.

## Quick path

1. Open or update an issue before implementation for a bug, security or dependency work, contract change, or larger feature. Small, understood documentation and maintenance changes may proceed directly.
2. Clarify the problem, acceptance criteria, scope, compatibility impact, and approval needed.
3. Choose the smallest implementation route: direct work for a clear, contained change; a short plan or spec for ambiguous or multi-area work. SDD is optional and requires explicit request or acceptance.
4. Make one focused work unit, validate it, and self-review the diff.
5. Open a focused PR with exact evidence, risks, and follow-up work.

## Local setup

Prerequisites and OAuth configuration are documented in [docs/getting-started.md](docs/getting-started.md). From the repository root:

```bash
npm install
npm run dev
```

The development app is available at `http://localhost:3000`. You may need a `.env.local` with the variables documented in the getting-started guide. Never commit credentials or local runtime state.

Useful interface commands:

```bash
npm run cli:video-metadata -- auth login
npm run cli:video-metadata -- auth whoami
npm run mcp:video-metadata
```

See [docs/interfaces.md](docs/interfaces.md) for supported CLI, MCP, and API operations.

## Choosing the work shape

| Change | Route |
| --- | --- |
| Small, well-understood fix, test, or documentation update | Direct work; state the files, make the focused edit, and validate it. |
| Ambiguous, multi-area, or behavior-spanning change | Write a short plan/spec covering scope, contracts, risks, acceptance criteria, and validation. |
| Breaking, security-sensitive, dependency, or product-decision change | Issue first; obtain the needed approval and document compatibility or mitigation before coding. |

Planning reduces ambiguity; it is not a ceremony for every small change. Do not start SDD unless it is explicitly requested or accepted.

## Branches, commits, and pull requests

Use descriptive, purpose-based branch names, for example `fix/cli-auth-error`, `feat/video-metadata-dry-run`, `docs/agent-workflow`, or `build/update-next`.

Use [Conventional Commits](https://www.conventionalcommits.org/), with a clear outcome rather than a file list:

```text
<type>(<scope>): <imperative outcome>
```

Relevant types include `feat`, `fix`, `docs`, `test`, `refactor`, `build`, `chore`, and `security` when appropriate. Do not add AI attribution or `Co-Authored-By` trailers.

Each commit should represent one coherent work unit that leaves the repository understandable and reasonably reversible. Keep PRs focused and target no more than 400 changed lines. Split larger work into independently reviewable, chained or sequential PRs; do not hide unrelated changes to meet the budget.

### Issue-isolated collaboration

When multiple contributors are working in parallel, each accepted issue gets its own implementation branch, focused commit set, and pull request. Stage changes selectively, never use `git add .` when unrelated work is present, and include only the code belonging to the linked issue. Document dependencies between PRs when workstreams overlap. Do not commit or open a PR without explicit human approval.

A PR should explain the problem, acceptance criteria, implementation, intentional non-goals, compatibility impact, and risks. Before requesting review, self-review the complete diff and confirm:

- [ ] The scope and acceptance criteria are clear, and the linked issue or approval is present when required.
- [ ] The diff is focused and the changed-line budget is respected or an explicit split is proposed.
- [ ] `npm run test`, `npm run lint`, and any relevant command or scenario were run and their exact results are recorded.
- [ ] CLI/MCP/API JSON envelopes, typed errors, exit codes, and backward compatibility are preserved or explicitly documented.
- [ ] Write safeguards, including `expectedChannelId` and `--dryRun`, remain fail-closed.
- [ ] Credentials, secrets, and `.atl` local state are not included.

For interface changes, exercise a representative read-only or dry-run scenario where practical, for example:

```bash
npm run cli:video-metadata -- auth whoami
npm run cli:video-metadata -- apply --videoId <VIDEO_ID> --finalTitle "Draft title" --description "Draft description" --expectedChannelId <CHANNEL_ID> --dryRun
```

Do not perform live mutations merely to demonstrate validation. If credentials, external services, or another required environment are unavailable, state that limitation and describe what was verified instead.

## Contracts, safety, and security

Preserve the CLI, MCP, and API contracts used by people and automation: JSON shapes and envelopes, `expectedChannelId` and dry-run safeguards, typed errors, exit codes, and documented behavior. Do not bypass a safety check to make a command succeed. Treat credentials, tokens, and local `.atl` state as sensitive; never commit them.

For a suspected security issue, do not publish exploitable details, proof-of-concept code, or reproduction steps in a public issue or PR before maintainers classify it. Contact the maintainers through the repository's private security channel, if provided, and share only the minimum useful detail. Dependency upgrades require review of the changelog, compatibility impact, tests, and lockfile diff; do not blindly apply `npm audit fix`.

## Working with an AI coding agent

The human owns scope, product and safety decisions, approvals, and final review. Give an agent the desired outcome, acceptance criteria, exact allowed files or directories, out-of-scope behavior, validation commands, and contract constraints.

An agent must read relevant files and conventions first, preserve unrelated changes, use one focused write thread, avoid dependency changes and drive-by refactors, and report exact changed files, commands, observed results, and remaining risks. It must stop when scope, ownership, acceptance criteria, or another human decision is ambiguous; it must not guess or claim evidence it did not obtain.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
