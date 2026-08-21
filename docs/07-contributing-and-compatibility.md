# Contributing and Compatibility

## Compatibility baseline

The current monopi workspace targets:

- Node.js `>=22.19.0` for repository development
- pnpm `10.33.0`
- `@earendil-works/pi-coding-agent` `0.84.1` for Pi-facing packages

monopi follows Pi closely because extensions depend on Pi's runtime and SDK contracts. New releases target the pinned Pi family first; compatibility with older Pi versions is best-effort unless a package explicitly documents a wider range.

Provider packages are especially sensitive to registry, credential, and model-refresh API changes. Use Pi's public APIs, keep peer requirements aligned, and add smoke tests when changing authentication or provider behavior.

## Repository setup

```nu
git clone https://github.com/ifiokjr/monopi.git
cd monopi
pnpm install
pnpm build
pnpm test
```

Use pnpm for every workspace command.

## Test local packages in Pi

```nu
pnpm pi:local
pi
```

`pnpm pi:local` points a real Pi installation at the current checkout. Fully restart Pi after switching sources; `/reload` can retain modules from the previously loaded package source.

Return to published packages with:

```nu
pnpm pi:published
```

## Find the owning package

Start with [Packages and Optional Add-ons](05-packages-and-optional-add-ons.md), then open the package README and implementation. The repository's [feature catalog](https://github.com/ifiokjr/monopi/blob/main/docs/feature-catalog.md) remains the long-form package ownership inventory.

Most Pi runtime packages ship raw TypeScript that Pi can load directly. Contributor-facing packages such as `core`, `cli`, `db`, `web-client`, and `web-server` emit `dist/` output and should be built when changed directly.

## Required checks

Run the checks appropriate to the change:

```nu
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm mdt check
pnpm mc check
```

Executable changes should also satisfy the repository's coverage requirements. Documentation-site work should run the docs sync/build and inspect generated routes in a browser.

## Changesets

Every non-release change needs a MonoChange changeset:

```nu
pnpm mc create
```

This repository is lockstep-versioned. Changeset frontmatter must use only the `monopi-group`:

```md
---
monopi-group: patch
---
```

Use `patch` for docs, fixes, and internal refactors; `minor` for new capabilities; and `major` for breaking changes.

## Documentation workflow

Root files under `docs/` are canonical. The site content under `packages/monopi__docs/src/content/` is generated.

```nu
pnpm docs:sync
pnpm docs:update
pnpm docs:check
pnpm --filter @monopi/docs build
```

Edit the root Markdown first, run the sync script, and commit both source and generated MDX. Use MDT through `pnpm mdt ...`, never a globally installed binary.

## Git and pull requests

- create a focused branch from `main` using a conventional prefix such as `feat/`, `fix/`, `test/`, `ci/`, `build/`, `chore/`, or `refactor/`
- use Conventional Commits
- keep one concern per pull request
- include the changeset
- wait for required checks before merging
- squash-merge through GitHub

See the repository's [Contributing Guide](https://github.com/ifiokjr/monopi/blob/main/CONTRIBUTING.md) and package-specific README for the detailed workflow.

## Upstream boundaries

When changing a Pi-owned concept, consult the exact Pi version used by the workspace and the [upstream documentation](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/docs). monopi documentation should explain its own behavior and link upstream instead of copying a versioned Pi reference that will drift.
