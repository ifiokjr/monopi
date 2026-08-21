# Included Workflows

monopi's packages are designed around complete workflows rather than isolated commands. These are the main patterns available after a typical install.

## Work safely in git

The git guard creates recovery checkpoints and blocks interactive git commands that could hang an agent session. The worktree extension gives both you and the agent a managed place for isolated changes.

```text
/worktree status
/worktree create fix/example "repair the example"
/worktree list
/worktree cleanup fix/example
```

Pi-owned worktrees live under shared Pi storage and carry owner/purpose metadata. Manually created worktrees are left alone unless you explicitly act on them.

## Delegate focused tasks

`@monopi/subagents` supports three execution shapes:

- **single**: run one named specialist
- **chain**: pass each step's result to the next step
- **parallel**: fan independent work out concurrently

```text
/run scout Find where authentication is implemented
/chain scout -> planner -> worker
/parallel reviewer "Review API" | reviewer "Review tests"
/agents
```

The agent-facing `subagent` tool also manages reusable agents and `.chain.md` pipelines, supports background execution, and can report status through `subagent_status`.

Use delegation for bounded research, implementation, review, or cross-checking. Keep the main session responsible for integrating results and validating the final state.

## Keep long commands out of the foreground

`@monopi/background-tasks` tracks explicit long-lived shell processes such as dev servers, test watchers, and log tails.

```text
/bg
/bg watch --follow <id>
```

The agent can spawn, inspect, and stop tasks with `bg_task` and `bg_status`. Every task has a stable id and a log file; watched tasks can wake the agent when output arrives or the process exits.

## Check back later

The scheduler turns reminders and recurring monitors into first-class work:

```text
/remind in 45m Check the deployment
/loop 5m Check whether CI passed
/schedule
```

The agent can create the same tasks with `schedule_prompt`. Tasks run only while Pi is active and idle. Instance scope is the default; workspace scope is available for monitors that should be adoptable by another Pi instance.

Use `continueUntilComplete` for a bounded retry loop with a clear success marker, not for open-ended polling.

## Ask a side question without derailing the task

`/btw` and its `/qq` alias open a side conversation above the editor. Start a tangent, clear it, or inject either the full exchange or a generated summary back into the main thread.

```text
/btw Why did we choose this schema?
/btw summarize
/qq inject
```

This is useful for quick explanations, competing ideas, and questions you do not want to mix into the active implementation context.

## Observe cost, timing, and health

The default UI packages expose different levels of feedback:

- **custom footer**: model, thinking level, tokens, cost, context, cwd, branch, and worktree state
- **tool metadata**: start/end time, duration, approximate I/O size, and context snapshots
- **diagnostics**: prompt-level and per-turn timing
- **usage tracker**: provider quotas, rolling cost history, and per-model usage
- **watchdog**: CPU, memory, event-loop, startup, and blame reports with a reduced-churn safe mode

Common surfaces are `/status`, `/diagnostics`, `/usage`, `/watchdog`, and the `usage_report` tool.

## Share a session remotely

`@monopi/web-remote` provides `/remote` for browser-oriented session sharing. `@monopi/remote-tailscale` is a separate opt-in alternative for Tailscale HTTPS, token auth, QR codes, PTY access, and status widgets.

Install only one package that owns `/remote` unless you intentionally resolve the command overlap.

## Move from exploration to execution

The split extension packages also provide focused modes for planning, review, answers, goals, todos, file browsing, and prompt/model profiles. Discover their exact surfaces in [Commands, Tools, and Shortcuts](04-commands-tools-and-shortcuts.md), then choose package ownership in [Packages and Optional Add-ons](05-packages-and-optional-add-ons.md).
