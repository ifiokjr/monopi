import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getAgentDir } = vi.hoisted(() => ({
	getAgentDir: vi.fn(() => "/mock-home/.pi/agent"),
}));

// Keep the real SettingsManager so restores exercise pi's actual write path, and only
// redirect the agent dir at the temp home the tests control.
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
	return {
		...actual,
		getAgentDir,
	};
});

vi.mock("@monopi/core", async () => {
	return await import("../monopi__core/src/model-intelligence.js");
});

vi.mock("@earendil-works/pi-ai/compat", () => ({
	completeSimple: vi.fn(async () => ({
		role: "assistant",
		content: [
			{
				type: "text",
				text: JSON.stringify({
					intent: "design",
					complexity: 4,
					risk: "high",
					expectedTurns: "few",
					toolIntensity: "medium",
					contextBreadth: "medium",
					recommendedTier: "premium",
					recommendedThinking: "high",
					confidence: 0.91,
					reason: "Design-heavy task.",
				}),
			},
		],
		api: "openai-responses",
		provider: "openai",
		model: "gpt-5-mini",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	})),
}));

import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

import { SettingsManager } from "@earendil-works/pi-coding-agent";

import { createExtensionHarness } from "../../test-utils/extension-runtime-harness.js";
import adaptiveRoutingExtension from "./index.js";
import { captureRoutedDefaults, restoreRoutedDefaults } from "./settings-defaults.js";

/**
 * Mimic pi (<=0.84.x) persistence: switching a model writes the provider/model pair
 * and the thinking level into the user's global settings.json. pi queues its writes,
 * so flush before returning to imitate its writer having drained.
 */
async function persistRoutedSwitch(
	agentDir: string,
	provider: string,
	model: string,
	thinking: ThinkingLevel,
): Promise<void> {
	const manager = SettingsManager.create(process.cwd(), agentDir);
	manager.setDefaultModelAndProvider(provider, model);
	manager.setDefaultThinkingLevel(thinking);
	await manager.flush();
}

function readSettingsFile(agentDir: string): Record<string, unknown> {
	return JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf-8")) as Record<string, unknown>;
}

describe("routed default settings save/restore", () => {
	let agentDir: string;

	beforeEach(() => {
		agentDir = mkdtempSync(join(tmpdir(), "adaptive-routing-defaults-"));
	});

	afterEach(() => {
		rmSync(agentDir, { recursive: true, force: true });
	});

	it("captures the user's configured defaults from the global settings file", () => {
		writeFileSync(
			join(agentDir, "settings.json"),
			`${JSON.stringify({ defaultModel: "glm-5.3-flash", defaultProvider: "ollama-cloud", defaultThinkingLevel: "xhigh" }, null, 2)}\n`,
		);

		expect(captureRoutedDefaults(agentDir)).toEqual({
			defaultModel: "glm-5.3-flash",
			defaultProvider: "ollama-cloud",
			defaultThinkingLevel: "xhigh",
		});
	});

	it("captures absent defaults so a routed switch cannot keep them", () => {
		expect(captureRoutedDefaults(agentDir)).toEqual({});
	});

	it("restores the user's defaults after a routed switch overwrote them", async () => {
		writeFileSync(
			join(agentDir, "settings.json"),
			`${JSON.stringify({ defaultModel: "glm-5.3-flash", defaultProvider: "ollama-cloud", defaultThinkingLevel: "xhigh" }, null, 2)}\n`,
		);
		const snapshot = captureRoutedDefaults(agentDir);

		await persistRoutedSwitch(agentDir, "github-copilot", "gemini-3-flash-preview", "minimal");
		expect(readSettingsFile(agentDir)).toMatchObject({ defaultModel: "gemini-3-flash-preview" });

		expect(await restoreRoutedDefaults(snapshot, agentDir)).toBe(true);
		expect(readSettingsFile(agentDir)).toMatchObject({
			defaultModel: "glm-5.3-flash",
			defaultProvider: "ollama-cloud",
			defaultThinkingLevel: "xhigh",
		});
	});

	it("removes fields the user never configured instead of keeping the routed pick", async () => {
		const snapshot = captureRoutedDefaults(agentDir);

		await persistRoutedSwitch(agentDir, "github-copilot", "gemini-3-flash-preview", "minimal");
		expect(await restoreRoutedDefaults(snapshot, agentDir)).toBe(true);

		const restored = readSettingsFile(agentDir);
		expect(restored.defaultModel).toBeUndefined();
		expect(restored.defaultProvider).toBeUndefined();
		expect(restored.defaultThinkingLevel).toBeUndefined();
	});

	it("leaves unrelated settings untouched while restoring", async () => {
		writeFileSync(
			join(agentDir, "settings.json"),
			`${JSON.stringify({ defaultModel: "glm-5.3-flash", defaultProvider: "ollama-cloud", theme: "dark" }, null, 2)}\n`,
		);
		const snapshot = captureRoutedDefaults(agentDir);

		await persistRoutedSwitch(agentDir, "github-copilot", "gemini-3-flash-preview", "minimal");
		await restoreRoutedDefaults(snapshot, agentDir);

		expect(readSettingsFile(agentDir)).toMatchObject({ theme: "dark" });
	});

	it("does not rewrite settings when pi switched without persisting", async () => {
		writeFileSync(
			join(agentDir, "settings.json"),
			`${JSON.stringify({ defaultModel: "glm-5.3-flash", defaultProvider: "ollama-cloud" }, null, 2)}\n`,
		);
		const snapshot = captureRoutedDefaults(agentDir);
		const before = readFileSync(join(agentDir, "settings.json"), "utf-8");

		expect(await restoreRoutedDefaults(snapshot, agentDir)).toBe(false);
		expect(readFileSync(join(agentDir, "settings.json"), "utf-8")).toBe(before);
	});

	it("reports nothing to restore without a snapshot or an unreadable settings file", async () => {
		expect(await restoreRoutedDefaults(undefined, agentDir)).toBe(false);
		expect(existsSync(join(agentDir, "settings.json"))).toBe(false);

		writeFileSync(join(agentDir, "settings.json"), "{ not json");
		expect(await restoreRoutedDefaults({ defaultModel: "glm-5.3-flash" }, agentDir)).toBe(false);
	});
});

describe("adaptive routing keeps the user's startup defaults", () => {
	let tempAgentDir: string;

	beforeEach(() => {
		vi.useFakeTimers();
		tempAgentDir = mkdtempSync(join(tmpdir(), "adaptive-routing-defaults-ext-"));
		getAgentDir.mockReturnValue(tempAgentDir);
		mkdirSync(join(tempAgentDir, "extensions", "adaptive-routing"), { recursive: true });
	});

	afterEach(() => {
		vi.useRealTimers();
		rmSync(tempAgentDir, { recursive: true, force: true });
		vi.clearAllMocks();
	});

	function sampleModel(provider: string, id: string, name = id) {
		return {
			provider,
			id,
			name,
			api: provider === "anthropic" ? "anthropic-messages" : "openai-responses",
			baseUrl: "https://example.com",
			reasoning: true,
			input: ["text"],
			cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 200000,
			maxTokens: 32768,
		};
	}

	it("restores global defaults after a routed switch persists them like pi does", async () => {
		writeFileSync(
			join(tempAgentDir, "extensions", "adaptive-routing", "config.json"),
			`${JSON.stringify({ mode: "auto", models: { ranked: ["anthropic/claude-opus-4.6"] } }, null, 2)}\n`,
		);
		writeFileSync(
			join(tempAgentDir, "settings.json"),
			`${JSON.stringify({ defaultModel: "gemini-2.5-flash", defaultProvider: "google", defaultThinkingLevel: "xhigh" }, null, 2)}\n`,
		);
		const harness = createExtensionHarness();
		harness.ctx.model = sampleModel("google", "gemini-2.5-flash", "Gemini 2.5 Flash") as never;
		harness.ctx.modelRegistry = {
			getAvailable: () => [
				sampleModel("google", "gemini-2.5-flash", "Gemini 2.5 Flash"),
				sampleModel("anthropic", "claude-opus-4.6", "Claude Opus 4.6"),
			],
			getApiKeyForProvider: async () => "key",
		} as never;

		// Route the switch through pi's persisting behavior: every model change rewrites
		// the user's global startup defaults (pi <=0.84.x semantics).
		harness.pi.setModel = async (model: { id: string; provider: string }) => {
			harness.ctx.model = model;
			await persistRoutedSwitch(tempAgentDir, model.provider, model.id, "minimal");
			return true;
		};
		const setBaseThinking = harness.pi.setThinkingLevel.bind(harness.pi);
		harness.pi.setThinkingLevel = (level: Parameters<typeof setBaseThinking>[0]) => {
			setBaseThinking(level);
			const manager = SettingsManager.create(process.cwd(), tempAgentDir);
			manager.setDefaultThinkingLevel(level as ThinkingLevel);
			void manager.flush();
		};

		adaptiveRoutingExtension(harness.pi as never);
		await harness.emitAsync(
			"before_agent_start",
			{
				type: "before_agent_start",
				prompt: "Design a better settings page UI.",
				systemPrompt: "system",
			},
			harness.ctx,
		);

		expect(harness.ctx.model).toMatchObject({ provider: "anthropic", id: "claude-opus-4.6" });
		expect(readSettingsFile(tempAgentDir)).toMatchObject({
			defaultModel: "gemini-2.5-flash",
			defaultProvider: "google",
			defaultThinkingLevel: "xhigh",
		});
	});
});
