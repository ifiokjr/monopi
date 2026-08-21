# @monopi/extension-external-editor

<!-- {=extensionsExternalEditorOverview} -->

The external-editor extension adds an `/external-editor` command and a `ctrl+shift+e` shortcut for opening the current draft in your configured external editor (`$VISUAL` or `$EDITOR`). When you save the file, the updated text is synced back into pi's prompt input. It complements pi's built-in `app.editor.external` keybinding, which defaults to `Ctrl+G`.

<!-- {/extensionsExternalEditorOverview} -->

## Install

```bash
pi install npm:@monopi/extension-external-editor
```

## Commands

- `/external-editor`: open the current draft in `$VISUAL` or `$EDITOR`.
- `/external-editor status`: show which editor is configured and how to use the command.

## Notes

The extension complements pi's built-in `app.editor.external` keybinding (`Ctrl+G` by default). If you prefer a different primary key, remap that binding in `keybindings.json`.
