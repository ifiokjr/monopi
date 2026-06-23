/**
 * Schema module registry.
 *
 * Extensions call registerSchemaModule() at load time to declare their SQLite
 * tables and migration SQL. The shared database applies all registered
 * migrations in registration order.
 */

export type SchemaModuleId = string;

export interface SchemaModule {
	/** Unique identifier for this module (e.g. "analytics", "context-kb"). */
	id: SchemaModuleId;
	/** Ordered SQL migration statements to create/update this module's tables. */
	migrations: string[];
	/** Optional: the table names this module owns, for introspection. */
	tables?: string[];
}

const modules = new Map<SchemaModuleId, SchemaModule>();

export function registerSchemaModule(mod: SchemaModule): void {
	if (modules.has(mod.id)) {
		return; // already registered — idempotent
	}
	modules.set(mod.id, mod);
}

export function getRegisteredSchemaModules(): SchemaModule[] {
	return Array.from(modules.values());
}
