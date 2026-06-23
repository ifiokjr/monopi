# @monopi/cli

Interactive TUI configurator for `pi-coding-agent`.

## What it does

`@monopi/cli` powers the interactive `monopi` setup experience. It helps configure:

- providers and auth
- models
- provider/routing dashboard views for session, subagents
- direct optional package installs from the routing dashboard with a user/project scope toggle
- extensions
- prompts
- skills
- themes
- agent templates
- installer presets

## Usage

Run the CLI with:

```bash
npx @monopi/cli
```

Most users will want the meta-installer instead:

```bash
npx @monopi/monopi
```

## Package role

This is a compiled Node.js CLI package. It is part of the monopi monorepo and depends on the other workspace packages for content and installation targets.

## Development

```bash
pnpm --filter @monopi/cli build
pnpm --filter @monopi/cli typecheck
```

## Related packages

- `@monopi/monopi` — one-command installer
- `@monopi/core` — shared registries and types
