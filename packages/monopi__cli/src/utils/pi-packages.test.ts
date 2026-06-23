import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	detectPiPackageInstallScopes,
	findPiCommand,
	installPiPackages,
	parseNpmPackageName,
	resolveManagedPackageName,
} from "./pi-packages.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "oh-pi-pi-packages-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("parseNpmPackageName", () => {
	it("parses scoped and unscoped npm package sources", () => {
		expect(parseNpmPackageName("npm:@monopi/provider-ollama@0.4.4")).toBe("@monopi/provider-ollama");
		expect(parseNpmPackageName("npm:@monopi/provider-cursor")).toBe("@monopi/provider-cursor");
		expect(parseNpmPackageName("npm:chalk@5")).toBe("chalk");
		expect(parseNpmPackageName("npm:chalk")).toBe("chalk");
	});

	it("returns undefined for invalid npm sources", () => {
		expect(parseNpmPackageName("https://example.com/package.tgz")).toBeUndefined();
		expect(parseNpmPackageName("npm:")).toBeUndefined();
		expect(parseNpmPackageName("npm:@monopi")).toBeUndefined();
	});
});

describe("resolveManagedPackageName", () => {
	it("resolves local path package names and ignores unsupported sources", () => {
		const cwd = makeTempDir();
		const localPackageDir = join(cwd, "local-package");
		mkdirSync(localPackageDir, { recursive: true });
		writeFileSync(join(localPackageDir, "package.json"), JSON.stringify({ name: "@monopi/provider-catalog" }));

		expect(resolveManagedPackageName("./local-package", cwd)).toBe("@monopi/provider-catalog");
		expect(resolveManagedPackageName("git:https://example.com/repo.git", cwd)).toBeUndefined();
	});
});

describe("detectPiPackageInstallScopes", () => {
	it("detects user, project, both, and missing package scopes", () => {
		const homeDir = makeTempDir();
		const cwd = makeTempDir();
		mkdirSync(join(homeDir, ".pi", "agent"), { recursive: true });
		mkdirSync(join(cwd, ".pi"), { recursive: true });
		const localPackageDir = join(cwd, "local-provider");
		mkdirSync(localPackageDir, { recursive: true });
		writeFileSync(join(localPackageDir, "package.json"), JSON.stringify({ name: "@monopi/provider-catalog" }));
		writeFileSync(
			join(homeDir, ".pi", "agent", "settings.json"),
			JSON.stringify({
				packages: [
					"npm:@monopi/provider-ollama",
					{ source: "npm:@monopi/provider-cursor@0.4.4" },
					{ source: "./local-provider" },
					{},
				],
			}),
		);
		writeFileSync(
			join(cwd, ".pi", "settings.json"),
			JSON.stringify({
				packages: ["npm:@monopi/provider-cursor", "npm:@monopi/adaptive-routing", { source: "./local-provider" }],
			}),
		);

		const states = detectPiPackageInstallScopes(
			[
				"@monopi/provider-ollama",
				"@monopi/provider-cursor",
				"@monopi/provider-catalog",
				"@monopi/adaptive-routing",
				"@monopi/provider-missing",
			],
			{ cwd, homeDir },
		);

		expect(states).toEqual([
			{ packageName: "@monopi/provider-ollama", scope: "user" },
			{ packageName: "@monopi/provider-cursor", scope: "both" },
			{ packageName: "@monopi/provider-catalog", scope: "both" },
			{ packageName: "@monopi/adaptive-routing", scope: "project" },
			{ packageName: "@monopi/provider-missing", scope: "none" },
		]);
	});

	it("treats missing or invalid settings files as empty package lists", () => {
		const homeDir = makeTempDir();
		const cwd = makeTempDir();
		mkdirSync(join(cwd, ".pi"), { recursive: true });
		writeFileSync(join(cwd, ".pi", "settings.json"), "{not-json");

		const states = detectPiPackageInstallScopes(["@monopi/provider-ollama"], {
			cwd,
			homeDir,
		});

		expect(states).toEqual([
			{
				packageName: "@monopi/provider-ollama",
				scope: "none",
			},
		]);
	});
});

describe("findPiCommand", () => {
	it("returns the first working pi command", () => {
		const run = vi.fn(() => Buffer.from("pi 0.64.0"));

		expect(findPiCommand(run)).toBe("pi");
		expect(run).toHaveBeenCalledWith("pi", ["--version"], {
			stdio: "pipe",
			timeout: 3000,
			shell: false,
		});
	});

	it("throws when pi is not available", () => {
		const run = vi.fn(() => {
			throw new Error("missing");
		});

		expect(() => findPiCommand(run)).toThrow("pi not found");
	});
});

describe("installPiPackages", () => {
	it("installs requested packages and ignores already-installed responses", () => {
		const run = vi.fn((_file: string, args: string[]) => {
			if (args[0] === "--version") {
				return Buffer.from("pi 0.64.0");
			}
			if (args[1] === "npm:@monopi/provider-cursor") {
				const error = new Error("already installed") as Error & {
					stderr: Buffer;
				};
				error.stderr = Buffer.from("already installed");
				throw error;
			}
			return Buffer.from("");
		});

		installPiPackages(["@monopi/provider-ollama", "@monopi/provider-cursor"], "project", run);

		expect(run).toHaveBeenNthCalledWith(1, "pi", ["--version"], {
			stdio: "pipe",
			timeout: 3000,
			shell: false,
		});
		expect(run).toHaveBeenNthCalledWith(2, "pi", ["install", "npm:@monopi/provider-ollama", "-l"], {
			stdio: "pipe",
			timeout: 60000,
			shell: false,
		});
		expect(run).toHaveBeenNthCalledWith(3, "pi", ["install", "npm:@monopi/provider-cursor", "-l"], {
			stdio: "pipe",
			timeout: 60000,
			shell: false,
		});
	});

	it("returns early for an empty package list", () => {
		const run = vi.fn();

		installPiPackages([], "user", run);

		expect(run).not.toHaveBeenCalled();
	});

	it("throws a descriptive error when install fails", () => {
		const run = vi.fn((_file: string, args: string[]) => {
			if (args[0] === "--version") {
				return Buffer.from("pi 0.64.0");
			}
			const error = new Error("boom") as Error & { stderr: Buffer };
			error.stderr = Buffer.from("network unavailable\nextra output");
			throw error;
		});

		expect(() => installPiPackages(["@monopi/provider-ollama"], "user", run)).toThrow(
			"Failed to install @monopi/provider-ollama: network unavailable",
		);
	});

	it("includes a generic suffix when install failures have no stderr", () => {
		const run = vi.fn((_file: string, args: string[]) => {
			if (args[0] === "--version") {
				return Buffer.from("pi 0.64.0");
			}
			throw new Error("boom");
		});

		expect(() => installPiPackages(["@monopi/provider-ollama"], "user", run)).toThrow(
			"Failed to install @monopi/provider-ollama.",
		);
	});
});
