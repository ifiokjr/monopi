/**
 * Shared SQLite database connection.
 *
 * All monopi extensions that need persistence use this single connection.
 * The database lives at ~/.pi/agent/monopi.db by default, but the path can be
 * overridden via setDatabasePath() (useful for testing).
 */

import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { getRegisteredSchemaModules } from "./registry.js";

let dbInstance: BetterSQLite3Database<Record<string, never>> | null = null;
let sqliteInstance: Database.Database | null = null;
let customPath: string | null = null;

function defaultDatabasePath(): string {
	return join(homedir(), ".pi", "agent", "monopi.db");
}

export function getDatabasePath(): string {
	return customPath ?? defaultDatabasePath();
}

export function setDatabasePath(path: string): void {
	if (dbInstance) {
		throw new Error("Cannot set database path after the database has been initialized.");
	}
	customPath = path;
}

export type SharedDatabase = BetterSQLite3Database<Record<string, never>>;

export function getSharedDatabase(): SharedDatabase {
	if (dbInstance) {
		return dbInstance;
	}

	const dbPath = getDatabasePath();
	mkdirSync(dirname(dbPath), { recursive: true });

	sqliteInstance = new Database(dbPath);
	sqliteInstance.pragma("journal_mode = WAL");
	sqliteInstance.pragma("foreign_keys = ON");

	dbInstance = drizzle(sqliteInstance);

	return dbInstance;
}

export function closeSharedDatabase(): void {
	if (sqliteInstance) {
		sqliteInstance.close();
		sqliteInstance = null;
	}
	dbInstance = null;
}
