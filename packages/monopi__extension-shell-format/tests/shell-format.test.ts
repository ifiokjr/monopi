import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import shellFormatExtension, {
	NATIVE_SHELL_TOOL,
	buildShellInstruction,
	detectShell,
	resolveNativeShellPath,
	shellFormatInternals,
} from "../index.js";

describe("shell detection", () => {
	it("detects common shells without conflating login and execution dialects", () => {
		expect(detectShell({ NU_VERSION: "0.105.1", SHELL: "/opt/homebrew/bin/nu" })).toMatchObject({
			key: "nu",
			info: { name: "Nushell" },
		});
		expect(detectShell({ SHELL: "/bin/zsh-5.9" })).toMatchObject({ key: "zsh" });
		expect(detectShell({ SHELL: "C:\\Program Files\\PowerShell\\pwsh.exe" })).toMatchObject({ key: "pwsh" });
		expect(detectShell({ PSModulePath: "C:\\Program Files\\PowerShell\\Modules" })).toMatchObject({
			key: "pwsh",
		});
	});

	it("only resolves a native executable when it matches the detected shell", () => {
		const executable = () => true;
		expect(resolveNativeShellPath("nu", { SHELL: "/opt/homebrew/bin/nu" }, executable)).toBe("/opt/homebrew/bin/nu");
		expect(resolveNativeShellPath("nu", { SHELL: "/bin/bash" }, executable)).toBeUndefined();
		expect(resolveNativeShellPath("custom", { SHELL: "/tmp/custom" }, executable)).toBeUndefined();
		expect(resolveNativeShellPath("nu", {}, executable)).toBeUndefined();
		expect(resolveNativeShellPath("nu", { SHELL: "/missing/nu" }, () => false)).toBeUndefined();
	});

	it("checks executable access when no override is provided", () => {
		const directory = mkdtempSync(join(tmpdir(), "shell-format-"));
		const executablePath = join(directory, "nu");
		writeFileSync(executablePath, "#!/usr/bin/env nu\n");
		chmodSync(executablePath, 0o755);

		try {
			expect(resolveNativeShellPath("nu", { SHELL: executablePath })).toBe(executablePath);
			expect(resolveNativeShellPath("nu", { SHELL: join(directory, "missing", "nu") })).toBeUndefined();
		} finally {
			rmSync(directory, { recursive: true });
		}
	});
});

describe("shell instructions", () => {
	it("separates user-facing Nushell syntax from Bash tool syntax", () => {
		const instruction = buildShellInstruction(shellFormatInternals.SHELL_PROFILES.nu, true);

		expect(instruction).toContain("commands intended for the user");
		expect(instruction).toContain("The `bash` tool executes Bash syntax");
		expect(instruction).toContain("Never send Nushell-specific syntax to `bash`");
		expect(instruction).toContain("The `native_shell` tool executes Nushell syntax directly");
		expect(instruction).toContain("`^git status`");
		expect(instruction).not.toContain("execution backend handles compatibility");
		expect(instruction).not.toContain("commands passed to the `bash` tool");
	});

	it("does not claim native execution when the login-shell executable is unavailable", () => {
		const instruction = buildShellInstruction(shellFormatInternals.SHELL_PROFILES.fish, false);

		expect(instruction).toContain("No native Fish execution tool is available");
		expect(instruction).toContain("Use Bash syntax for `bash` tool calls");
	});
});

describe("extension registration", () => {
	it("registers a native shell tool and injects unambiguous guidance", async () => {
		const harness = createExtensionHarness();
		const executeShell = vi.fn(async (..._args: unknown[]) => ({ content: [{ type: "text", text: "ok" }] }));
		const createShellTool = vi.fn(() => ({ execute: executeShell }));
		shellFormatExtension(harness.pi as never, {
			env: { NU_VERSION: "0.105.1", SHELL: "/usr/local/bin/nu" },
			isExecutable: () => true,
			createShellTool: createShellTool as never,
		});

		await harness.emitAsync("session_start", {}, harness.ctx);
		expect(harness.statusMap.get("shell-format")).toBe("Nushell user syntax");
		expect(harness.notifications[0]?.msg).toContain("native_shell available");

		const nativeShell = harness.tools.get(NATIVE_SHELL_TOOL);
		expect(nativeShell).toMatchObject({
			label: "Nushell shell",
			description: expect.stringContaining("Accepts Nushell syntax"),
			parameters: {
				properties: {
					command: { description: expect.stringContaining("login shell syntax") },
				},
			},
		});

		const commands = [
			"^git status",
			"^gh api repos/owner/repo --jq '.[] | .name'",
			"ls | where type == file",
			"^git status; ^git branch --show-current",
			`^tool '{"nested":{"value":"quoted"}}'`,
		];
		const signal = new AbortController().signal;
		const onUpdate = () => {};
		for (const command of commands) {
			await nativeShell.execute("call-1", { command }, signal, onUpdate, harness.ctx);
		}

		expect(createShellTool).toHaveBeenCalledTimes(commands.length);
		for (let index = 0; index < commands.length; index++) {
			expect(createShellTool).toHaveBeenNthCalledWith(index + 1, harness.ctx.cwd, {
				shellPath: "/usr/local/bin/nu",
			});
			expect(executeShell.mock.calls[index]?.[1]).toEqual({ command: commands[index] });
		}

		const results = await harness.emitAsync("before_agent_start", { systemPrompt: "Base prompt" }, harness.ctx);
		const injected = results.find((result) => result !== undefined) as { systemPrompt: string };

		expect(injected.systemPrompt).toContain("Base prompt");
		expect(injected.systemPrompt).toContain("The `bash` tool executes Bash syntax");
		expect(injected.systemPrompt).toContain("native_shell");

		const duplicateResults = await harness.emitAsync(
			"before_agent_start",
			{ systemPrompt: injected.systemPrompt },
			harness.ctx,
		);
		expect(duplicateResults.every((result) => result === undefined)).toBe(true);
	});

	it("does not trust an unknown shell executable", async () => {
		const harness = createExtensionHarness();
		shellFormatExtension(harness.pi as never, {
			env: { SHELL: "/tmp/custom-shell" },
			isExecutable: () => true,
		});

		expect(harness.tools.has(NATIVE_SHELL_TOOL)).toBe(false);
		const results = await harness.emitAsync("before_agent_start", { systemPrompt: "Base prompt" }, harness.ctx);
		expect(results.every((result) => result === undefined)).toBe(true);
	});

	it("does not inject guidance or register a native tool for Bash", async () => {
		const harness = createExtensionHarness();
		shellFormatExtension(harness.pi as never, {
			env: { BASH_VERSION: "5.2", SHELL: "/bin/bash" },
			isExecutable: () => true,
		});

		expect(harness.tools.has(NATIVE_SHELL_TOOL)).toBe(false);
		await harness.emitAsync("session_start", {}, harness.ctx);
		expect(harness.statusMap.has("shell-format")).toBe(false);
		expect(harness.notifications).toEqual([]);
		const results = await harness.emitAsync("before_agent_start", { systemPrompt: "Base prompt" }, harness.ctx);
		expect(results.every((result) => result === undefined)).toBe(true);
	});
});
