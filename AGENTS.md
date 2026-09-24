<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## AI Agent Operating Rules

`CONTRIBUTING.md` is the canonical collaboration guide. Read it before making repository changes.

- Confirm the requested outcome, acceptance criteria, allowed edit surface, and validation commands before editing.
- For bugs, security or dependency work, contract changes, and larger features, confirm the issue and required approval before implementation.
- Use the smallest route: direct work for clear, contained changes; a short plan/spec for ambiguous or multi-area changes. Use SDD only when explicitly requested or accepted.
- Inspect relevant files, package scripts, and conventions first; preserve unrelated working-tree changes and `.atl` local state.
- Keep work units and PRs focused, use Conventional Commits, and avoid AI attribution. Split work approaching 400 changed lines.
- Isolate implementation by issue: use one branch, focused commit set, and PR per accepted issue; stage changes selectively and never use `git add .` when unrelated work is present.
- Do not commit or open a PR without explicit human approval. After an issue is accepted, include only its code in the linked PR; document dependencies between PRs when workstreams overlap.
- Preserve CLI/MCP/API JSON contracts, typed errors, exit codes, backward compatibility, `expectedChannelId`, and dry-run safeguards. Never expose credentials or exploitable security details publicly before maintainer classification.
- Validate with actual package commands, self-review the diff, and report exact evidence and remaining risks.
- Human contributors own scope, decisions, approval, and final review. Stop and ask when anything material is ambiguous; never invent a command or claim an unrun check.
