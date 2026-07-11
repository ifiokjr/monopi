# @monopi/extension-btw

Standalone pi extension package for `btw` side conversations.

```bash
pi install npm:@monopi/extension-btw
```

## Commands

- `/btw` — open the side chat. When saved conversations exist, this opens a conversation picker.
- `/btw <question>` — start a new side conversation and ask immediately without interrupting the main thread.

Questions entered inside an open overlay continue that conversation. Conversations are persisted independently as custom session
entries, so you can switch between previous threads and restore them as the session tree changes.

## Navigation

- Conversation picker: `↑` / `↓` moves one item, `PageUp` / `PageDown` moves one page, `Enter` selects, and `Esc`
  cancels. The picker uses a fixed percentage of the terminal height and scrolls when conversations overflow it.
- Conversation overlay: `PageUp` / `PageDown` scrolls through long responses, `Enter` submits, and `Esc` closes. The
  position indicator shows the visible transcript range.

## Attribution

This implementation is adapted from [`mitsuhiko/agent-stuff`](https://github.com/mitsuhiko/agent-stuff) `extensions/btw.ts`.
The adapted upstream code is Copyright Armin Ronacher and contributors and licensed under Apache-2.0.
Monopi package metadata and surrounding repository files remain MIT licensed.
