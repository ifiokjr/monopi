# @monopi/db

Shared SQLite database for monopi extensions.

## Why

All monopi extensions that need persistence use this single database instead of
each opening a private `.db` file. This reduces file handles, simplifies backups,
and enables cross-extension queries.

## Usage

### Register a schema module

```ts
import { registerSchemaModule, runMigrations, getSharedDatabase } from "@monopi/db";

// Declare your extension's tables
registerSchemaModule({
	id: "analytics",
	migrations: [
		`CREATE TABLE IF NOT EXISTS analytics_sessions (
			id TEXT PRIMARY KEY,
			started_at INTEGER NOT NULL
		);`,
	],
	tables: ["analytics_sessions"],
});

// Run all pending migrations (call once at startup)
runMigrations();

// Use the shared database
const db = getSharedDatabase();
db.run`INSERT INTO analytics_sessions (id, started_at) VALUES (?, ?)`;
```

### Database path

The database lives at `~/.pi/agent/monopi.db` by default. Override for testing:

```ts
import { setDatabasePath } from "@monopi/db";

setDatabasePath("/tmp/test.db");
```
