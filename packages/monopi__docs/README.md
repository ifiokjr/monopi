# @monopi/docs

<!-- {=docsPackageOverview} -->

`@monopi/docs` is the private documentation site for monopi. It is a Vite and React app that renders the markdown files from `docs/` as MDX pages with a search index. `pnpm docs:sync` runs `scripts/sync-content.mjs`, which reads `docs/*.md`, strips the first H1, converts HTML comments to MDX comments, and regenerates a lazy-loaded JSON search index.

Run `pnpm docs:dev` to develop, `pnpm docs:build` to build, and `pnpm docs:sync` to sync content from the source markdown.

<!-- {/docsPackageOverview} -->

## Scripts

| Script          | What it does                                   |
| --------------- | ---------------------------------------------- |
| `pnpm docs:dev` | Start the Vite dev server.                     |
| `pnpm docs:build` | Build the site for production.               |
| `pnpm docs:sync` | Sync `docs/*.md` into `src/content/*.mdx`.     |
| `pnpm docs:check` | Verify all MDT consumer blocks are up to date. |

## Layout

```text
src/
├── content/    Generated MDX pages and search index (do not edit by hand)
├── components/ Site UI components
├── App.tsx     Router and layout
└── main.tsx    Entry point
```

Edit the source markdown in the repo root `docs/` directory, then run `pnpm docs:sync` to regenerate the pages and search index. The generated content under `src/content/` is committed so the site builds without a sync step.
