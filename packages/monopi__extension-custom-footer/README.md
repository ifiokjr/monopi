# @monopi/extension-custom-footer

<!-- {=extensionsCustomFooterOverview} -->

The custom-footer extension replaces the default pi footer with a rich status bar. It shows the model name with its thinking-level indicator, input and output token counts, accumulated cost, context window usage as a color-coded percentage, elapsed session time, the abbreviated working directory, and the git branch when available. The footer auto-refreshes every 30 seconds and whenever the git branch changes.

<!-- {/extensionsCustomFooterOverview} -->

## Install

```bash
pi install npm:@monopi/extension-custom-footer
```

## Behavior

The status bar reads token and cost data from the active session, git state from the repo, and worktree context when the checkout is pi-owned. The context window percentage is color-coded so you can spot a nearly full window at a glance. When the watchdog extension is installed, the footer also reflects safe-mode state.
