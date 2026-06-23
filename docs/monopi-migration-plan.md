# monopi Migration Plan

Derived from the inventory review decisions. This is the target package layout for the skill-based rewrite under the `@monopi` npm org, released via `monochange`.

## Guiding principles

1. **Skill-first**: behavior that is guidance/methodology becomes a skill; only runtime hooks, tools, UI, and persistent state stay as extensions.
2. **Shared SQLite**: all extensions that need persistence use one SQLite database with a shared migration system (likely Drizzle). Extensions register their schemas/modules rather than each opening a private DB.
3. **Fewer packages**: merge small extensions into cohesive capability packages (`git-tools`, `bash-live-view`, `remote`, `provider-catalog`, `btw`).
4. **Lean skill set**: only skills that add behavior not covered by built-in tooling survive the rewrite.

## Target extension packages

### `@monopi/analytics-extension` — KEEP

Analytics tracking with SQLite persistence. Must adopt the shared SQLite DB + Drizzle migration system and register its schema as a module.

### `@monopi/background-tasks` — KEEP

Reactive background shell tasks, `/bg`, log viewing, agent wakeups.

### `@monopi/diagnostics` — KEEP

Prompt-completion diagnostics, timing, live widget.

### `@monopi/watchdog` — KEEP

Performance watchdog, safe-mode, alerts, overlays.

### `@monopi/status-footer` — KEEP (renamed from custom-footer)

Status overview and footer chrome. `/status`.

### `@monopi/external-editor` — KEEP

Open draft in `$EDITOR` and sync back.

### `@monopi/scheduler` — KEEP

`/loop`, `/remind`, `/schedule`, task adoption, scheduler tools.

### `@monopi/tool-metadata` — KEEP

Tool metadata display (completion time, context usage).

### `@monopi/usage-tracker` — KEEP

Provider usage dashboards, rate limits, `usage_report` tool.

### `@monopi/context` — KEEP (renamed from monopi-context)

SQLite FTS5 knowledge base, compression, terse mode, context analytics. Must adopt the shared SQLite DB.

### `@monopi/bash-live-view` — KEEP + MERGE

PTY-backed live bash rendering. Absorbs `@monopi/pretty` (syntax highlighting, colored output, tree listings, `/multi-grep`).

### `@monopi/provider-catalog` — KEEP + MERGE

Central provider integration surface. Absorbs:

- `@monopi/provider-cursor` (Cursor OAuth + AgentService streaming)
- `@monopi/provider-ollama` (local discovery + cloud login)
- adaptive-routing (merge into routing logic within this package)

### `@monopi/git-tools` — NEW (merged)

Absorbs `git-guard` + `worktree`. Git safety guardrails and worktree management in one package. _(Note: your comment on worktree was cut off at "integrate it here:" — please share the link/reference.)_

### `@monopi/remote` — NEW (merged)

Remote session sharing. Absorbs `remote-tailscale` + `web-remote`. _(Note: your comment was cut off at "We should make it possible" — and you want to evaluate how ironclaw integrates remote sessions before building from scratch.)_

### `@monopi/subagents` — KEEP + MERGE

Subagent orchestration. Absorbs `subagents-notify`.

### `@monopi/btw` — KEEP + MERGE

Side-conversation workflow (`/btw`, `/qq`). Merges the btw extension + btw skill into one package so runtime and guidance ship together.

### `@monopi/answer` — CONVERT

Keep the UI overlay as a thin extension; move methodology into a skill. **Open question**: how does auto-answer work without the extension's runtime hook? The extension likely must remain to detect questions in responses and drive auto-detection.

### `@monopi/chrome` — POSSIBLE (merge target for compact-header, shell-format)

`compact-header` and `shell-format` were both marked merge with no explicit target. They could fold into a `chrome`/shell-infrastructure package or into `status-footer`. **Decision needed.**

## Retired extensions

- `plan` — retire; planning methodology moves to skills if needed.
- `spec` — retire; spec-driven workflow moves to skills/CLI if needed.

## Target skills

Only 3 survive:

### `@monopi/skill-debug-helper` — KEEP

Flagship monostack debugging skill.

### `@monopi/skill-nushell` — KEEP

Default shell skill for this environment.

### `@monopi/skill-btw` — MERGE (into `@monopi/btw`)

Merges into the btw package.

## Retired skills (15)

claymorphism, context7, fish, flutter-serverpod-mvp, glassmorphism, grill-me, improve-codebase-architecture, liquid-glass, neubrutalism, pwsh, request-refactor-plan, rust-workspace-bootstrap, web-fetch, web-search, write-a-skill.

## quick-setup — MERGE

Folds into the monopi installer/bootstrap story rather than shipping as a standalone skill.

## Shared infrastructure to build

### `@monopi/db` (or `@monopi/sqlite`)

- Single SQLite database for all extensions.
- Drizzle-based migration system.
- Module/schema registration API so extensions declare their tables without owning the DB.

Consumers: analytics-extension, context, and any future persistence needs.

## Open questions

1. **answer**: how does auto-answer detection work without the extension? Does a minimal runtime extension remain?
2. **compact-header / shell-format**: which package do these merge into? `@monopi/chrome`? `@monopi/status-footer`?
3. **worktree**: your comment referenced a link ("integrate it here:") that didn't paste — please share it.
4. **remote**: your comment was cut off ("We should make it possible") — please complete the thought. Also: ironclaw evaluation outcome?
5. **adaptive-routing**: merge target confirmed as `provider-catalog`, or should it fold into a core routing module?

## Summary counts

| Category                                     | Count   |
| -------------------------------------------- | ------- |
| Extensions kept as-is                        | 13      |
| Extensions merged into other packages        | 11      |
| Extensions converted to skill + thin runtime | 1       |
| Extensions retired                           | 3       |
| Skills kept                                  | 2       |
| Skills merged                                | 2       |
| Skills retired                               | 15      |
| **Total target packages**                    | **~16** |
