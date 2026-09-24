import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { PromptRouteClassification } from "./types.js";

import { classifyPromptHeuristically, parseClassifierResponse } from "./classifier.js";
import { DEFAULT_ADAPTIVE_ROUTING_CONFIG } from "./defaults.js";
import { decideRoute } from "./engine.js";
import { normalizeRouteCandidates } from "./normalize.js";

type CorpusEntry = {
	name: string;
	prompt: string;
	expectedIntent: string;
	expectedComplexity: number;
	expectedRisk: string;
	expectedTurns: string;
	expectedToolIntensity: string;
	expectedContextBreadth: string;
	expectedTier: string;
	expectedThinking: string;
	expectedModel: string;
	acceptableFallbacks: string[];
};

const candidates = normalizeRouteCandidates([
	{
		provider: "anthropic",
		id: "claude-opus-4.6",
		name: "Claude Opus 4.6",
		api: "anthropic-messages",
		baseUrl: "https://api.anthropic.com",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 16384,
	},
	{
		provider: "openai",
		id: "gpt-5.4",
		name: "GPT-5.4",
		api: "openai-responses",
		baseUrl: "https://api.openai.com/v1",
		reasoning: true,
		input: ["text"],
		cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 32768,
	},
	{
		provider: "groq",
		id: "llama-3.3-70b-versatile",
		name: "Llama 3.3 70B Versatile",
		api: "openai-completions",
		baseUrl: "https://api.groq.com/openai/v1",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 32768,
	},
] as never);

describe("adaptive routing engine", () => {
	it("routes design-heavy prompts toward non-Anthropic premium defaults when available", () => {
		const classification = classifyPromptHeuristically(
			"Design a polished dashboard with stronger hierarchy and visual tone.",
		);
		const decision = decideRoute({
			config: {
				...DEFAULT_ADAPTIVE_ROUTING_CONFIG,
				models: {
					ranked: ["openai/gpt-5.4", "anthropic/claude-opus-4.6"],
					excluded: [],
				},
			},
			candidates,
			classification,
			currentThinking: "medium",
			usage: {
				providers: {
					anthropic: { confidence: "authoritative", remainingPct: 55 },
					openai: { confidence: "authoritative", remainingPct: 55 },
				},
				updatedAt: Date.now(),
			},
		});

		expect(decision?.selectedModel).toBe("openai/gpt-5.4");
		expect(decision?.explanation.codes).toContain("premium_allowed");
	});

	it("protects low-quota providers when reserve thresholds are crossed", () => {
		const classification = classifyPromptHeuristically(
			"Think deeply about a cross-provider architecture migration strategy.",
		);
		const decision = decideRoute({
			config: {
				...DEFAULT_ADAPTIVE_ROUTING_CONFIG,
				providerReserves: {
					...DEFAULT_ADAPTIVE_ROUTING_CONFIG.providerReserves,
					openai: {
						minRemainingPct: DEFAULT_ADAPTIVE_ROUTING_CONFIG.providerReserves.openai?.minRemainingPct ?? 15,
						applyToTiers: DEFAULT_ADAPTIVE_ROUTING_CONFIG.providerReserves.openai?.applyToTiers,
						confidence: DEFAULT_ADAPTIVE_ROUTING_CONFIG.providerReserves.openai?.confidence,
						allowOverrideForPeak: false,
					},
				},
			},
			candidates,
			classification,
			usage: {
				providers: {
					openai: { confidence: "authoritative", remainingPct: 5 },
					anthropic: { confidence: "authoritative", remainingPct: 40 },
				},
				updatedAt: Date.now(),
			},
		});

		expect(decision?.selectedModel).not.toBe("openai/gpt-5.4");
		expect(decision?.explanation.codes).toContain("premium_reserved");
	});

	it("evaluates the routing corpus fixtures", () => {
		const corpus = JSON.parse(
			readFileSync(new URL("./fixtures.route-corpus.json", import.meta.url), "utf-8"),
		) as CorpusEntry[];
		for (const fixture of corpus) {
			const classification = classifyPromptHeuristically(fixture.prompt);
			const decision = decideRoute({
				config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
				candidates,
				classification,
				usage: {
					providers: {
						anthropic: { confidence: "authoritative", remainingPct: 60 },
						openai: { confidence: "authoritative", remainingPct: 60 },
						groq: { confidence: "unknown", remainingPct: undefined },
					},
					updatedAt: Date.now(),
				},
			});

			expect(classification.intent, fixture.name).toBe(fixture.expectedIntent);
			expect(decision?.selectedModel, fixture.name).toBe(fixture.expectedModel);
			expect(decision?.selectedThinking, fixture.name).toBe(fixture.expectedThinking);
		}
	});
});

function testClassification(overrides: Partial<PromptRouteClassification> = {}): PromptRouteClassification {
	return {
		classifierMode: "heuristic",
		complexity: 2,
		confidence: 0.5,
		contextBreadth: "medium",
		expectedTurns: "few",
		intent: "implementation",
		reason: "test classification",
		recommendedThinking: "medium",
		recommendedTier: "balanced",
		risk: "medium",
		toolIntensity: "medium",
		...overrides,
	};
}

function tiedModel(provider: string, id: string, contextWindow = 200000) {
	return {
		provider,
		id,
		name: `Model ${id}`,
		api: "openai-responses",
		baseUrl: "https://example.com",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow,
		maxTokens: 8192,
	};
}

describe("routing determinism", () => {
	it("resolves score ties by candidate order instead of the alphabetically first model id", () => {
		const classification = testClassification({
			complexity: 1,
			contextBreadth: "small",
			intent: "implementation",
			recommendedThinking: "minimal",
			recommendedTier: "cheap",
		});
		// "alpha/model-x" sorts before "beta/model-y", so the old `localeCompare`
		// tie-break picked it; the registry order here says the beta model first.
		const tiedCandidates = normalizeRouteCandidates([
			tiedModel("beta", "model-y"),
			tiedModel("alpha", "model-x"),
		] as never);
		const input = {
			config: DEFAULT_ADAPTIVE_ROUTING_CONFIG,
			candidates: tiedCandidates,
			classification,
		} as const;

		const first = decideRoute(input);
		const second = decideRoute(input);

		expect(first?.selectedModel).toBe("beta/model-y");
		expect(first?.selectedModel).not.toBe("alpha/model-x");
		// Identical inputs must produce identical routing, every time.
		expect(second).toEqual(first);
		expect(decideRoute(input)).toEqual(first);
	});

	it("keeps small-context models off wide-context tasks", () => {
		const classification = testClassification({
			complexity: 4,
			contextBreadth: "large",
			intent: "architecture",
			recommendedThinking: "high",
			recommendedTier: "premium",
		});
		const candidates = normalizeRouteCandidates([
			tiedModel("tiny", "ctx-model", 32000),
			tiedModel("wide", "ctx-model", 200000),
		] as never);

		const decision = decideRoute({ config: DEFAULT_ADAPTIVE_ROUTING_CONFIG, candidates, classification });

		expect(decision?.selectedModel).toBe("wide/ctx-model");
		const loser = decision?.explanation.candidates?.find((candidate) => candidate.model === "tiny/ctx-model");
		expect(loser?.reasons).toContain("context-short");
	});

	it("flags context_short when the selected model cannot fit the task's context needs", () => {
		const classification = testClassification({
			complexity: 4,
			contextBreadth: "large",
			intent: "architecture",
			recommendedThinking: "high",
			recommendedTier: "premium",
		});
		const candidates = normalizeRouteCandidates([tiedModel("tiny", "only-model", 32000)] as never);

		const decision = decideRoute({ config: DEFAULT_ADAPTIVE_ROUTING_CONFIG, candidates, classification });

		expect(decision?.selectedModel).toBe("tiny/only-model");
		expect(decision?.explanation.codes).toContain("context_short");
	});

	it("reports thinking_clamped against the policy-requested level, not the classifier recommendation", () => {
		const classification = testClassification({
			complexity: 4,
			contextBreadth: "large",
			intent: "design",
			recommendedThinking: "minimal",
			recommendedTier: "premium",
		});
		const candidates = normalizeRouteCandidates([tiedModel("zeta", "plain-model")] as never);

		const decision = decideRoute({ config: DEFAULT_ADAPTIVE_ROUTING_CONFIG, candidates, classification });

		// The design policy requests "high"; the model supports none of it.
		expect(decision?.selectedThinking).toBe("off");
		expect(decision?.explanation.clampedThinking).toEqual({ requested: "high", applied: "off" });
		expect(decision?.explanation.codes).toContain("thinking_clamped");
	});

	it("does not flag thinking_clamped when the policy level was applied as requested", () => {
		const classification = testClassification({
			complexity: 1,
			contextBreadth: "small",
			intent: "quick-qna",
			recommendedThinking: "xhigh",
			recommendedTier: "cheap",
		});
		const candidates = normalizeRouteCandidates([
			{
				provider: "zeta",
				id: "gpt-5-model",
				name: "GPT-5 Model",
				api: "openai-responses",
				baseUrl: "https://example.com",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 200000,
				maxTokens: 8192,
			},
		] as never);

		const decision = decideRoute({ config: DEFAULT_ADAPTIVE_ROUTING_CONFIG, candidates, classification });

		// The quick-qna policy requests "minimal" and the model supports it; the raw
		// classifier recommendation of "xhigh" must not trigger the clamp code.
		expect(decision?.selectedThinking).toBe("minimal");
		expect(decision?.explanation.clampedThinking).toBeUndefined();
		expect(decision?.explanation.codes).not.toContain("thinking_clamped");
	});
});

describe("classifier response validation", () => {
	it("rejects an unrecognized intent instead of silently disabling its routing policy", () => {
		const response = JSON.stringify({
			complexity: 3,
			intent: "bananas",
			recommendedTier: "balanced",
			recommendedThinking: "medium",
		});
		expect(parseClassifierResponse(response)).toBeUndefined();
	});

	it("falls back to intent-derived defaults for unrecognized enum values", () => {
		const parsed = parseClassifierResponse(
			JSON.stringify({
				complexity: 9,
				contextBreadth: "galaxy",
				expectedTurns: "some",
				intent: "debugging",
				recommendedTier: "cosmic",
				recommendedThinking: "maximum",
				risk: "extreme",
				toolIntensity: "overwhelming",
			}),
		);
		expect(parsed?.intent).toBe("debugging");
		expect(parsed?.complexity).toBe(3);
		expect(parsed?.recommendedTier).toBe("balanced");
		expect(parsed?.recommendedThinking).toBe("medium");
		expect(parsed?.risk).toBe("medium");
		expect(parsed?.toolIntensity).toBe("high");
		expect(parsed?.contextBreadth).toBe("medium");
		expect(parsed?.expectedTurns).toBe("few");
	});

	it("keeps a fully valid classification as-is", () => {
		const parsed = parseClassifierResponse(
			JSON.stringify({
				complexity: 4,
				confidence: 0.8,
				contextBreadth: "large",
				expectedTurns: "many",
				intent: "debugging",
				reason: "stack trace debugging",
				recommendedTier: "premium",
				recommendedThinking: "high",
				risk: "high",
				toolIntensity: "high",
			}),
		);
		expect(parsed).toMatchObject({
			complexity: 4,
			confidence: 0.8,
			contextBreadth: "large",
			expectedTurns: "many",
			intent: "debugging",
			reason: "stack trace debugging",
			recommendedTier: "premium",
			recommendedThinking: "high",
			risk: "high",
			toolIntensity: "high",
		});
	});

	it("rejects answers without a JSON object", () => {
		expect(parseClassifierResponse("no json here")).toBeUndefined();
		expect(parseClassifierResponse("{ broken")).toBeUndefined();
	});
});
