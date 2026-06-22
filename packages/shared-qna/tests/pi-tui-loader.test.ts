import { describe, expect, it } from "vitest";

import { getPiTuiFallbackPaths, requirePiTuiModule } from "../pi-tui-loader.js";

describe("getPiTuiFallbackPaths", () => {
	it("includes BUN_INSTALL and the default home fallback without duplicates", () => {
		const paths = getPiTuiFallbackPaths({
			homeDir: "/Users/tester",
			bunInstallDir: "/custom-bun",
		});
		expect(paths).toEqual([
			"/custom-bun/install/global/node_modules/@earendil-works/pi-tui",
			"/Users/tester/.bun/install/global/node_modules/@earendil-works/pi-tui",
		]);
	});

	it("deduplicates the default bun root when BUN_INSTALL matches it", () => {
		const paths = getPiTuiFallbackPaths({
			homeDir: "/Users/tester",
			bunInstallDir: "/Users/tester/.bun",
		});
		expect(paths).toEqual(["/Users/tester/.bun/install/global/node_modules/@earendil-works/pi-tui"]);
	});
});

describe("requirePiTuiModule", () => {
	it("uses the regular package resolution path first", () => {
		const calls: string[] = [];
		const resolved = requirePiTuiModule({
			requireFn(specifier) {
				calls.push(specifier);
				return { source: specifier };
			},
		});
		expect(resolved).toEqual({ source: "@earendil-works/pi-tui" });
		expect(calls).toEqual(["@earendil-works/pi-tui"]);
	});

	it("falls back to Bun global paths on module-not-found", () => {
		const calls: string[] = [];
		const resolved = requirePiTuiModule({
			homeDir: "/Users/tester",
			bunInstallDir: "/custom-bun",
			requireFn(specifier) {
				calls.push(specifier);
				if (specifier === "@earendil-works/pi-tui") {
					const error = new Error("missing");
					(error as Error & { code?: string }).code = "MODULE_NOT_FOUND";
					throw error;
				}
				if (specifier.includes("/custom-bun/")) {
					return { source: specifier };
				}
				const error = new Error("missing");
				(error as Error & { code?: string }).code = "MODULE_NOT_FOUND";
				throw error;
			},
		});
		expect(resolved).toEqual({
			source: "/custom-bun/install/global/node_modules/@earendil-works/pi-tui",
		});
		expect(calls[0]).toBe("@earendil-works/pi-tui");
		expect(calls[1]).toBe("/custom-bun/install/global/node_modules/@earendil-works/pi-tui");
	});

	it("throws a helpful error when no location resolves", () => {
		expect(() =>
			requirePiTuiModule({
				homeDir: "/Users/tester",
				requireFn() {
					const error = new Error("missing");
					(error as Error & { code?: string }).code = "MODULE_NOT_FOUND";
					throw error;
				},
			}),
		).toThrow(/Unable to load @earendil-works\/pi-tui/);
	});
});
