/**
 * Shared SQLite database for monopi extensions.
 *
 * Provides a single SQLite database connection with Drizzle ORM, a migration
 * system, and a schema module registration API so extensions can declare their
 * tables without each owning a private database file.
 */

export { getSharedDatabase, closeSharedDatabase, getDatabasePath, setDatabasePath } from "./connection.js";
export type { SharedDatabase } from "./connection.js";
export { runMigrations, getSchemaVersion, resetDatabase } from "./migrations.js";
export type { SchemaModule, SchemaModuleId } from "./registry.js";
export { registerSchemaModule, getRegisteredSchemaModules } from "./registry.js";
