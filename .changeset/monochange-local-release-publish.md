---
monopi: patch
---

# Add local release and publish workflows

- Convert `cli.change`, `cli.release`, `cli.publish`, and `cli.get-version` in `monochange.toml` from array-of-tables to inline-table arrays.
- Restructure `cli.release` into an opt-in local release that plans bumps and syncs the lockfile by default, with `--commit`, `--push`, `--tag`, and `--publish-release` flags gating commit, push, tagging, and GitHub release publishing.
- Add `TagRelease` and `PublishRelease` steps plus matching `tag` and `publish_release` inputs to `cli.release`.
- Add `[source]` (`ifiokjr/monopi`) and `[source.releases]` so `PublishRelease` targets the correct GitHub repository.
- Update `package.json` scripts to invoke monochange via `pnpm monochange`, using `monochange run <command>` for user-defined workflows and `monochange step <name>` for built-in steps.