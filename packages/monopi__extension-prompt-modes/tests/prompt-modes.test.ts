import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import promptModesExtension from "../index.js";

describe("prompt-modes extension registration", () => {
	it("registers the /mode command and shortcuts", () => {
		const harness = createExtensionHarness();
		promptModesExtension(harness.pi);

		expect(Array.from(harness.commands.keys()).sort()).toEqual(["mode"]);
		expect(Array.from(harness.shortcuts.keys()).sort()).toEqual(["ctrl+shift+m", "ctrl+space"]);
	});

	it("exposes the mode command handler and shortcut handlers", () => {
		const harness = createExtensionHarness();
		promptModesExtension(harness.pi);

		expect(typeof harness.commands.get("mode").handler).toBe("function");
		expect(typeof harness.shortcuts.get("ctrl+shift+m").handler).toBe("function");
		expect(typeof harness.shortcuts.get("ctrl+space").handler).toBe("function");
	});
});

function sampleModel(provider: string, id: string, name = id) {
	return {
		provider,
		id,
		name,
		api: "openai-responses",
		baseUrl: "https://example.com",
		reasoning: true,
		input: ["text"],
		cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 32768,
	};
}

describe("prompt-modes model_select handling", () => {
	let tempAgentDir: string;
	let selectTitles: string[];

	beforeEach(() => {
		tempAgentDir = mkdtempSync(join(tmpdir(), "prompt-modes-ext-"));
		process.env.PI_CODING_AGENT_DIR = tempAgentDir;
		selectTitles = [];
	});

	afterEach(() => {
		delete process.env.PI_CODING_AGENT_DIR;
		rmSync(tempAgentDir, { recursive: true, force: true });
	});

	function createHarness() {
		const harness = createExtensionHarness();
		promptModesExtension(harness.pi);
		harness.ctx.cwd = tempAgentDir;
		harness.ctx.ui.select = (async (title: string) => {
			selectTitles.push(title);
			return null;
		}) as never;
		return harness;
	}

	async function startSession(harness: ReturnType<typeof createExtensionHarness>, model: unknown) {
		harness.ctx.model = model as never;
		await harness.emitAsync("session_start", { type: "session_start", reason: "startup" }, harness.ctx);
	}

	/** Read the current mode through the /mode selector title, like a user would see it. */
	async function currentMode(harness: ReturnType<typeof createExtensionHarness>): Promise<string> {
		await harness.commands.get("mode").handler("", harness.ctx);
		const title = selectTitles.at(-1) ?? "";
		return /^Mode \(current: (.+)\)$/.exec(title)?.[1] ?? title;
	}

	it("falls back to the custom overlay on a manual model change", async () => {
		const harness = createHarness();
		await startSession(harness, sampleModel("zai", "glm-5.3-flash"));

		await harness.emitAsync("model_select", { model: { provider: "anthropic", id: "claude-opus-4.6" } }, harness.ctx);

		expect(await currentMode(harness)).toBe("custom");
	});

	it("keeps the selected mode when a routed switch is announced on the event bus", async () => {
		const harness = createHarness();
		await startSession(harness, sampleModel("zai", "glm-5.3-flash"));

		// Mirror pi: model_select is emitted inside the awaited setModel call, wrapped by
		// adaptive-routing's "routing:applying" window.
		harness.pi.events.emit("routing:applying", { active: true });
		await harness.emitAsync("model_select", { model: { provider: "anthropic", id: "claude-opus-4.6" } }, harness.ctx);
		harness.pi.events.emit("routing:applying", { active: false });

		expect(await currentMode(harness)).toBe("default");

		// Once the window closes, a manual change still falls back to the overlay.
		await harness.emitAsync("model_select", { model: { provider: "google", id: "gemini-2.5-flash" } }, harness.ctx);
		expect(await currentMode(harness)).toBe("custom");
	});
});
