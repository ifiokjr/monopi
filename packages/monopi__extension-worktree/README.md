# @monopi/extension-worktree

<!-- {=extensionsWorktreeOverview} -->

The worktree extension adds centralized git worktree awareness to monopi. It detects whether the current checkout is the main repository or a linked worktree, shows when the current worktree is pi-owned, and tracks owner and purpose metadata for pi-created worktrees. It provides `/worktree` commands for status, listing, opening, creating, and cleaning up worktrees. Pi-owned worktrees are created under shared pi storage namespaced by the canonical repository root, and cleanup focuses on pi-owned worktrees while leaving external ones alone unless you explicitly intervene.

<!-- {/extensionsWorktreeOverview} -->

## Install

```bash
pi install npm:@monopi/extension-worktree
```

## Commands

- `/worktree` — show worktree status for the current repo.
- `/worktree status` — same as above.
- `/worktree list` — list linked worktrees and mark pi-owned ones.
- `/worktree open [branch|path]` — open an existing worktree.
- `/worktree create <branch> [purpose]` — create a pi-owned worktree.
- `/worktree cleanup <branch|path|id|all>` — remove pi-owned worktrees.
