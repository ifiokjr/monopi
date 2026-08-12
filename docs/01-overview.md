# Overview

monopi is a curated, lockstep-versioned toolkit for [Pi Coding Agent](https://github.com/badlogic/pi-mono). It adds practical workflows, terminal UI improvements, reusable skills, agent profiles, and optional provider integrations without replacing Pi itself.

Think of it as **oh-my-zsh for Pi**: Pi remains the coding agent and runtime; monopi supplies an opinionated collection of packages that make daily work safer, easier to observe, and easier to automate.

## Start in 30 seconds

```nu
npx @monopi/monopi
pi
```

The first command launches the monopi configurator. It can install Pi when needed, backs up existing managed configuration, lets you choose extensions, and writes the selected setup into Pi's agent directory.

## What monopi adds

| Area                  | Highlights                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------ |
| Safer coding          | Git checkpoints, guarded commands, managed worktrees, file-backed goals and todos          |
| Long-running work     | Background processes, scheduled follow-ups, watchdog health checks                         |
| Delegation            | Named subagents, sequential chains, parallel fan-out, reusable agent definitions           |
| Better feedback       | Compact header, rich footer, prompt/tool timing, usage and quota reporting                 |
| Focused workflows     | Side conversations, code review, answer-only mode, prompt modes                            |
| Remote access         | Browser session sharing, with an optional Tailscale-backed alternative                     |
| Content               | Skills, project `AGENTS.md` templates, themes, and keybinding presets                      |
| Optional integrations | Adaptive routing, provider catalog, Cursor, Ollama, analytics, and enhanced terminal tools |

## How the pieces fit together

```text
Pi Coding Agent
└── monopi
    ├── @monopi/monopi       public npx entrypoint
    ├── @monopi/cli          interactive configurator
    ├── runtime extensions   commands, tools, shortcuts, and UI
    ├── content packages     skills and agent templates
    ├── optional add-ons     providers, routing, analytics, remote access
    └── shared libraries     core, database, web client/server, TUI helpers
```

`@monopi/monopi` is the command most users run. It is a thin compatibility entrypoint; `@monopi/cli` owns the actual configurator. Runtime capabilities are published as separate packages so Pi can load only the features you install.

## Choose your path

- **New user:** continue to [Install and Configure](02-install-and-configure.md).
- **Want to know what daily use feels like:** read [Included Workflows](03-included-workflows.md).
- **Looking for a command or shortcut:** use [Commands, Tools, and Shortcuts](04-commands-tools-and-shortcuts.md).
- **Choosing packages:** see [Packages and Optional Add-ons](05-packages-and-optional-add-ons.md).
- **Customizing behavior and appearance:** see [Skills, Agents, and Appearance](06-skills-agents-and-appearance.md).
- **Contributing or checking compatibility:** see [Contributing and Compatibility](07-contributing-and-compatibility.md).

## What stays upstream

monopi deliberately does not duplicate Pi's complete reference manual. For Pi-owned concepts such as sessions, core settings, the extension API, SDK, RPC mode, TUI components, custom providers, and package loading, use the [upstream Pi documentation](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/docs).

This documentation focuses on what monopi installs, how its packages fit together, and which monopi surface to use for a task.
