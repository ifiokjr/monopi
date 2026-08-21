# @monopi/extension-shared

<!-- {=sharedExtensionPackageOverview} -->

`@monopi/extension-shared` is an internal library of runtime utilities shared by monopi extension packages. Extension packages depend on it at build time; users never install it directly. It provides:

- runtime mode resolution and safe-mode state
- status bar and UI cache helpers
- watchdog runtime diagnostics formatting
- shared worktree helpers (repo context snapshots, managed worktree metadata, pi ownership)

<!-- {/sharedExtensionPackageOverview} -->

## Development

```bash
pnpm --filter @monopi/extension-shared test
```

## Attribution

Parts of this package's worktree helpers are adapted from [`mitsuhiko/agent-stuff`](https://github.com/mitsuhiko/agent-stuff). Adapted upstream code is Copyright Armin Ronacher and contributors and licensed under Apache-2.0. Monopi package metadata and surrounding repository files remain MIT licensed.
