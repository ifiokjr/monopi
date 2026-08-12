# Skills, Agents, and Appearance

monopi customizes both how Pi reasons about a project and how the terminal session presents itself.

## Included skills

`@monopi/skills` installs three maintained, on-demand instruction packs:

| Skill          | Use it for                                                                |
| -------------- | ------------------------------------------------------------------------- |
| `btw`          | Use the `/btw` or `/qq` side-conversation workflow effectively            |
| `debug-helper` | Analyze errors, logs, crashes, and performance problems                   |
| `nushell`      | Write correct Nushell commands, pipelines, variables, and data transforms |

Each skill is a directory containing `SKILL.md` and any supporting resources. Pi can load it when a request matches its description, or you can invoke it explicitly with `/<skill-name>`.

```nu
pi install npm:@monopi/skills
```

The skills package is already part of the public installer inventory.

## Project agent templates

`@monopi/agents` provides starting points for project-level `AGENTS.md` instructions:

| Template              | Focus                                                    |
| --------------------- | -------------------------------------------------------- |
| `general-developer`   | Safe defaults for everyday development                   |
| `fullstack-developer` | Frontend/backend architecture and quality                |
| `security-researcher` | Ethical security testing and reporting                   |
| `data-ai-engineer`    | Data, ML, reproducibility, and infrastructure discipline |

The configurator copies the selected template to `AGENTS.md`. Treat that file as a starting point: edit it to match the project's commands, conventions, architecture, and safety constraints.

These templates are different from **subagent definitions**. `AGENTS.md` guides the main Pi session for a project; `@monopi/subagents` definitions describe named delegated workers and reusable chains.

## Subagent definitions

Open `/agents` or press `Ctrl+Shift+A` to browse and manage named specialists. The package includes built-in roles such as scout, planner, worker, reviewer, researcher, context builder, and frontend-oriented specialists.

Definitions use Markdown with YAML frontmatter. Chains use `.chain.md` files. They can live at user or project scope and can specify tools, model overrides, skills, output files, and progress behavior.

## Appearance

### Header and footer

- `extension-compact-header` replaces Pi's verbose startup area with a dense summary.
- `extension-custom-footer` shows model, thinking level, tokens, cost, context, elapsed time, cwd, branch, and worktree state.
- `extension-tool-metadata` and `@monopi/diagnostics` add timing details without changing the underlying tool behavior.

### Themes

The configurator writes the selected theme name into Pi's `settings.json`. Its registry offers Pi dark/light plus several named dark palettes. Theme rendering and custom theme file formats belong to Pi; use [Pi's current theme documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/themes.md) before creating or modifying a theme.

### Keybindings

The configurator supports default, Vim-style, and Emacs-style schemes and writes overrides to `keybindings.json`. monopi extensions add their own shortcuts, listed in [Commands, Tools, and Shortcuts](04-commands-tools-and-shortcuts.md).

If a terminal intercepts a key combination, use the slash command or adjust the terminal mapping. See [Pi's keybinding documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/keybindings.md) for the authoritative action names and file format.

## Build your own customization

For Pi-owned extension, skill, prompt template, package, theme, and TUI APIs, follow the upstream documentation and examples:

- [Pi extension docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- [Pi skills docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md)
- [Pi package docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md)
- [Pi examples](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples)

When a customization becomes broadly useful, consider contributing it as a focused monopi package rather than expanding an unrelated extension.
