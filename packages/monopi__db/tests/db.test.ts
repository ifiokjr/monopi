import Database from "better-sqlite3";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	closeSharedDatabase,
	getDatabasePath,
	getRegisteredSchemaModules,
	getSchemaVersion,
	getSharedDatabase,
	registerSchemaModule,
	resetDatabase,
	runMigrations,
	setDatabasePath,
} from "../src/index.js";

const tempDirs: string[] = [];

function createTempDbPath() {
	const dir = mkdtempSync(join(tmpdir(), "monopi-db-test-"));
	tempDirs.push(dir);
	return join(dir, "nested", "monopi.db");
}

function queryRows(dbPath: string, sql: string) {
	const db = new Database(dbPath);
	try {
		return db.prepare(sql).all() as Record<string, unknown>[];
	} finally {
		db.close();
	}
}

describe("@monopi/db", () => {
	afterEach(() => {
		closeSharedDatabase();
		for (const dir of tempDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("uses a configurable shared SQLite connection and closes idempotently", () => {
		const dbPath = createTempDbPath();
		setDatabasePath(dbPath);

		expect(getDatabasePath()).toBe(dbPath);
		expect(existsSync(dbPath)).toBe(false);

		const first = getSharedDatabase();
		const second = getSharedDatabase();
		expect(second).toBe(first);
		expect(existsSync(dbPath)).toBe(true);
		expect(() => setDatabasePath(createTempDbPath())).toThrow(
			"Cannot set database path after the database has been initialized.",
		);

		closeSharedDatabase();
		closeSharedDatabase();
	});

	it("registers schema modules once and applies migrations once", () => {
		const dbPath = createTempDbPath();
		setDatabasePath(dbPath);

		const mod = {
			id: `unit-${Date.now()}`,
			migrations: [
				`CREATE TABLE unit_items (id INTEGER PRIMARY KEY, label TEXT NOT NULL)`,
				`INSERT INTO unit_items (label) VALUES ('first')`,
			],
			tables: ["unit_items"],
		};
		registerSchemaModule(mod);
		registerSchemaModule({ ...mod, migrations: [`CREATE TABLE should_not_run (id INTEGER)`] });

		expect(getRegisteredSchemaModules()).toContain(mod);

		runMigrations();
		expect(getSchemaVersion()).toBeGreaterThanOrEqual(2);
		expect(queryRows(dbPath, "SELECT label FROM unit_items")).toEqual([{ label: "first" }]);

		runMigrations();
		expect(queryRows(dbPath, "SELECT label FROM unit_items")).toEqual([{ label: "first" }]);
	});

	it("resets existing tables and handles missing databases", () => {
		const dbPath = createTempDbPath();
		setDatabasePath(dbPath);

		expect(getSchemaVersion()).toBe(0);
		resetDatabase();

		mkdirSync(dirname(dbPath), { recursive: true });
		const db = new Database(dbPath);
		try {
			db.exec("CREATE TABLE temp_items (id INTEGER PRIMARY KEY)");
		} finally {
			db.close();
		}

		resetDatabase();
		expect(queryRows(dbPath, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'temp_items'")).toEqual(
			[],
		);
	});

	it("surfaces failed migrations after logging module context", () => {
		const dbPath = createTempDbPath();
		setDatabasePath(dbPath);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const id = `failing-${Date.now()}`;
		registerSchemaModule({ id, migrations: ["CREATE TABLE broken ("], tables: ["broken"] });

		expect(() => runMigrations()).toThrow();
		expect(errorSpy).toHaveBeenCalledWith(`Migration for module "${id}" failed:`, expect.any(Error));
		errorSpy.mockRestore();
	});
});
