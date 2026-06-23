/**
 * Migration runner for the shared monopi database.
 *
 * Applies SQL migrations from all registered schema modules in registration order.
 * Each module's migrations are tracked separately by module id + migration hash.
 */

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { getDatabasePath } from "./connection.js";
import { getRegisteredSchemaModules } from "./registry.js";

const MIGRATIONS_TABLE = "__monopi_migrations";

function ensureMigrationsTable(db: Database.Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			module TEXT NOT NULL,
			hash TEXT NOT NULL,
			created_at INTEGER DEFAULT (unixepoch()),
			UNIQUE (module, hash)
		)
	`);
}

function getAppliedMigrations(db: Database.Database): Set<string> {
	ensureMigrationsTable(db);
	const rows = db.prepare(`SELECT hash AS key FROM ${MIGRATIONS_TABLE}`).all() as { key: string }[];
	return new Set(rows.map((row) => row.key));
}

function recordMigration(db: Database.Database, module: string, hash: string): void {
	db.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (module, hash) VALUES (?, ?)`).run(module, hash);
}

export function runMigrations(): void {
	const dbPath = getDatabasePath();
	mkdirSync(dirname(dbPath), { recursive: true });

	const db = new Database(dbPath);
	db.pragma("journal_mode = WAL");

	try {
		const applied = getAppliedMigrations(db);
		const modules = getRegisteredSchemaModules();

		for (const mod of modules) {
			for (const migration of mod.migrations) {
				const hash = `${mod.id}:${migration.length}:${migration.slice(0, 32)}`;
				if (applied.has(hash)) {
					continue;
				}

				try {
					db.exec(migration);
					recordMigration(db, mod.id, hash);
				} catch (error) {
					console.error(`Migration for module "${mod.id}" failed:`, error);
					throw error;
				}
			}
		}
	} finally {
		db.close();
	}
}

export function getSchemaVersion(): number {
	const dbPath = getDatabasePath();
	try {
		const db = new Database(dbPath);
		ensureMigrationsTable(db);
		const result = db.prepare(`SELECT COUNT(*) as count FROM ${MIGRATIONS_TABLE}`).get() as { count: number };
		db.close();
		return result.count;
	} catch {
		return 0;
	}
}

export function resetDatabase(): void {
	const dbPath = getDatabasePath();
	try {
		const db = new Database(dbPath);
		const tables = db
			.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
			.all() as { name: string }[];
		for (const { name } of tables) {
			db.exec(`DROP TABLE IF EXISTS "${name}"`);
		}
		db.close();
	} catch {
		// database doesn't exist yet
	}
}
