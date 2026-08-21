# @monopi/extension-git-guard

<!-- {=extensionsGitGuardOverview} -->

The git-guard extension adds four git safety features for git-managed repositories:

- interactive git guard: blocks git shell commands that are likely to open an editor and hang
- dirty repo warning: notifies you at session start when there are uncommitted changes
- turn checkpoints: creates a git stash snapshot before each agent turn
- terminal notification: sends a desktop or terminal notification when the agent finishes

It supports the Kitty (OSC 99) and generic terminal (OSC 777) notification protocols.

<!-- {/extensionsGitGuardOverview} -->

## Install

```bash
pi install npm:@monopi/extension-git-guard
```

## Behavior details

The interactive git guard inspects each `bash` and `native_shell` command before it runs. If a segment looks like an interactive git command (for example, a rebase without `--no-edit` or a commit without a message flag), the extension blocks it and suggests a non-interactive equivalent. Commands with an explicit editor override or message flag pass through.

Checkpoints stash the working tree before each agent turn and restore cleanly when the turn finishes, so a bad edit never costs you uncommitted work.
