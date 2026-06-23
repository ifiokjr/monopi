/* c8 ignore file */
import { defineConfig } from "drizzle-kit";
import { homedir } from "node:os";
import { join } from "node:path";

function getDatabasePath(): string {
	return join(homedir(), ".pi", "agent", "monopi.db");
}

export default defineConfig({
	dbCredentials: {
		url: getDatabasePath(),
	},
	dialect: "sqlite",
	out: "./migrations",
	schema: "./src/index.ts",
});
