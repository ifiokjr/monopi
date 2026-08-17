import { describe, expect, it, vi } from "vitest";

import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import gitGuardExtension, { detectInteractiveGitCommand, INTERACTIVE_GIT_WARNING_PREFIX } from "../index.js";

describe("detectInteractiveGitCommand", () => {
	it("detects git rebase --continue without non-interactive editor overrides", () => {
		const result = detectInteractiveGitCommand("git rebase --continue");
		expect(result).not.toBeNull();
		expect(result?.reason).toContain("rebase --continue");
		expect(result?.suggestion).toContain("GIT_EDITOR=true");
	});

	it("detects git commit without an explicit message", () => {
		const result = detectInteractiveGitCommand("git commit");
		expect(result).not.toBeNull();
		expect(result?.reason).toContain("git commit");
		expect(result?.suggestion).toContain("git commit -m");
		expect(detectInteractiveGitCommand("^git commit")?.reason).toContain("git commit");
	});

	it("ignores non-git shell text that merely mentions git", () => {
		expect(detectInteractiveGitCommand('echo "git commit"')).toBeNull();
		expect(detectInteractiveGitCommand("printf 'git rebase --continue'\n")).toBeNull();
		expect(detectInteractiveGitCommand("git merge-tree base head")).toBeNull();
	});

	it("detects git merge without --no-edit or explicit message", () => {
		const result = detectInteractiveGitCommand("git merge feature-branch");
		expect(result).not.toBeNull();
		expect(result?.reason).toContain("git merge");
		expect(result?.suggestion).toContain("--no-edit");
	});

	it("returns null for safe non-interactive git commands", () => {
		expect(detectInteractiveGitCommand('git commit -m "fix: test"')).toBeNull();
		expect(detectInteractiveGitCommand("git commit -C HEAD")).toBeNull();
		expect(detectInteractiveGitCommand("git commit --reuse-message HEAD")).toBeNull();
		expect(detectInteractiveGitCommand("GIT_EDITOR=true git rebase --continue")).toBeNull();
		expect(detectInteractiveGitCommand("git merge --no-edit feature-branch")).toBeNull();
		expect(detectInteractiveGitCommand('git tag -a v1.2.3 -m "release"')).toBeNull();
	});
});

describe("INTERACTIVE_GIT_WARNING_PREFIX", () => {
	it("stays stable for user-facing block messages", () => {
		expect(INTERACTIVE_GIT_WARNING_PREFIX).toBe("Interactive git command blocked");
	});
});

describe("git-guard extension", () => {
	it("guards interactive commands from Bash and native shell tools", async () => {
		const harness = createExtensionHarness();
		gitGuardExtension(harness.pi as never);

		for (const toolName of ["bash", "native_shell"]) {
			const results = await harness.emitAsync(
				"tool_call",
				{ input: { command: toolName === "native_shell" ? "^git commit" : "git commit" }, toolName },
				harness.ctx,
			);
			const blocked = results.find((result) => result !== undefined) as { block: boolean; reason: string };
			expect(blocked.block).toBe(true);
			expect(blocked.reason).toContain(INTERACTIVE_GIT_WARNING_PREFIX);
		}

		const unguarded = await harness.emitAsync(
			"tool_call",
			{ input: { command: "git commit" }, toolName: "unrelated_tool" },
			harness.ctx,
		);
		expect(unguarded.every((result) => result === undefined)).toBe(true);
	});

	it("defers dirty-repo startup checks until after the initial startup window", async () => {
		vi.useFakeTimers();
		try {
			const harness = createExtensionHarness();
			harness.pi.exec = vi.fn(async () => ({
				stdout: " M README.md\n?? notes.txt\n",
				stderr: "",
				exitCode: 0,
			}));

			gitGuardExtension(harness.pi as never);
			harness.emit("session_start", {}, harness.ctx);

			expect(harness.pi.exec).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(500);
			expect(harness.pi.exec).toHaveBeenCalledWith("git", ["status", "--porcelain"]);
			expect(harness.notifications.at(-1)?.msg).toContain("Dirty repo: 2 uncommitted change(s)");
		} finally {
			vi.useRealTimers();
		}
	});
});
