# @monopi/extension-compact-header

<!-- {=extensionsCompactHeaderOverview} -->

The compact-header extension replaces pi's verbose startup header with a table-style summary showing the model, provider, thinking level, extension count, and other session details in one compact block. It also bootstraps the plain-icons setting: it reads `plainIcons` from settings.json and the `--plain-icons` CLI flag, then bridges the value to the `OH_PI_PLAIN_ICONS` environment variable so every monopi package picks it up consistently.

<!-- {/extensionsCompactHeaderOverview} -->

## Install

```bash
pi install npm:@monopi/extension-compact-header
```

## Configuration

The extension honors `plainIcons` in `settings.json` (global or project-local) and the `--plain-icons` CLI flag. When either is set, it exports `OH_PI_PLAIN_ICONS=1` so every monopi package renders ASCII-safe icons instead of emoji.
