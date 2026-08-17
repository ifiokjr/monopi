# @monopi/extension-shell-format

A pi extension that detects the user's login shell and keeps user-facing command examples in that shell's syntax without sending incompatible syntax to execution tools.

```nu
^pi install npm:@monopi/extension-shell-format
```

## Execution behavior

The extension keeps two concerns separate:

- Commands intended for the user to copy use the login shell's dialect.
- Tool calls use the dialect declared by each tool. In particular, the `bash` tool always receives Bash syntax.

For a supported non-Bash login shell with a matching `$SHELL` executable, the extension also registers `native_shell`. This tool invokes the login shell directly, so Nushell, Fish, Zsh, or PowerShell-specific syntax can be executed without a Bash quoting layer.

For example, with Nushell as the login shell:

- use `git status` in a `bash` tool call;
- use `^git status` in a `native_shell` tool call or a user-facing Nushell example.

Execution tools do not translate between shell dialects. Failed commands remain visible to the agent so it can correct the command and retry when safe.
