/* c8 ignore file */
import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts"],
	outDir: "dist",
	format: "esm",
	clean: true,
	platform: "node",
	dts: {
		sourcemap: true,
		tsgo: true,
	},
	external: ["better-sqlite3", "drizzle-orm", "drizzle-orm/better-sqlite3"],
	outExtensions() {
		return { js: ".js", dts: ".d.ts" };
	},
});
