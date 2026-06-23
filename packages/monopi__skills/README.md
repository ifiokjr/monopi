# `@monopi/skills`

> Curated on-demand skill packs bundled with monopi.

## Included skills

| Skill          | What it does                                              |
| -------------- | --------------------------------------------------------- |
| `btw` (`/qq`)  | Run side conversations without interrupting main work.    |
| `debug-helper` | Analyze errors, logs, crashes, and performance issues.    |
| `nushell`      | Nushell syntax reference for commands and shell snippets. |

## Installation

```bash
pi install npm:@monopi/skills
```

> Installed by default with `npx @monopi/monopi`.

## How skills work

- Each skill lives in its own directory under `skills/<skill-name>/`.
- Each directory contains a `SKILL.md` file with instructions for pi.
- Pi loads the skill when the user's request matches the skill's description.
- Skills stay loaded for the duration of the task.
- You can explicitly invoke a skill with `/<skill-name>`.

## Package layout

```text
skills/
├── btw/SKILL.md
├── debug-helper/SKILL.md
└── nushell/SKILL.md
```
