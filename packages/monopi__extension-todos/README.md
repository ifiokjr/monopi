# @monopi/extension-todos

Standalone pi extension package for `todos` — file-backed todo management.

```bash
pi install npm:@monopi/extension-todos
```

## Commands

- `/todos` — open the visual todo manager overlay.

## Tools

- `todo` — manage file-based todos: `list`, `list-all`, `get`, `create`, `update`, `append`, `delete`, `claim`, `release`.

Todos are stored as standalone markdown files under `<todo-dir>` (defaults to `.pi/todos`, overridable via the `PI_TODO_PATH` environment variable). Each file begins with a JSON front-matter block followed by an optional markdown body. Claim tasks before working on them to avoid conflicts.

## Attribution

This implementation is adapted from [`mitsuhiko/agent-stuff`](https://github.com/mitsuhiko/agent-stuff) `extensions/todos.ts`.
The adapted upstream code is Copyright Armin Ronacher and contributors and licensed under Apache-2.0.
Monopi package metadata and surrounding repository files remain MIT licensed.
