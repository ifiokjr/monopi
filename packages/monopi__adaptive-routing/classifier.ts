import type { Api, AssistantMessage, Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { completeSimple } from "@earendil-works/pi-ai/compat";

import type {
	AdaptiveRoutingConfig,
	NormalizedRouteCandidate,
	PromptRouteClassification,
	RouteComplexity,
	RouteContextBreadth,
	RouteExpectedTurns,
	RouteIntent,
	RouteRisk,
	RouteThinkingLevel,
	RouteTier,
	RouteToolIntensity,
} from "./types.js";

import { buildFallbackClassification } from "./engine.js";
import { matchesModelRef } from "./normalize.js";

export async function classifyPrompt(
	prompt: string,
	config: AdaptiveRoutingConfig,
	ctx: Pick<ExtensionContext, "modelRegistry">,
	candidates: NormalizedRouteCandidate[],
): Promise<PromptRouteClassification> {
	const heuristic = classifyPromptHeuristically(prompt);
	const routerModel = pickRouterModel(config.routerModels, candidates);
	if (!routerModel) {
		return heuristic;
	}

	const apiKey = await resolveApiKey(routerModel.model, ctx);
	if (!apiKey) {
		return heuristic;
	}

	try {
		const response = await completeSimple(
			routerModel.model,
			{
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: buildClassifierPrompt(prompt) }],
						timestamp: Date.now(),
					},
				],
				systemPrompt:
					"You classify coding-agent prompts. Return strict JSON only with keys: intent, complexity, risk, expectedTurns, toolIntensity, contextBreadth, recommendedTier, recommendedThinking, confidence, reason. Use only allowed values. Keep reason short.",
			},
			{
				apiKey,
				reasoning: routerModel.reasoning ? "minimal" : undefined,
			},
		);

		const parsed = parseClassifierResponse(extractAnswer(response));
		if (!parsed) {
			return {
				...heuristic,
				classifierMode: "heuristic",
				reason: `${heuristic.reason} (classifier fallback)`,
			};
		}
		return {
			...parsed,
			classifierMode: "llm",
			classifierModel: routerModel.fullId,
		};
	} catch {
		return {
			...heuristic,
			classifierMode: "heuristic",
			reason: `${heuristic.reason} (classifier unavailable)`,
		};
	}
}

export function classifyPromptHeuristically(prompt: string): PromptRouteClassification {
	const text = prompt.toLowerCase();
	const intent = detectIntent(text);
	const complexity = detectComplexity(text, intent);
	const recommendedTier = detectTier(intent, complexity);
	const recommendedThinking = detectThinking(recommendedTier);

	return {
		classifierMode: "heuristic",
		complexity,
		confidence: 0.5,
		contextBreadth: complexity >= 4 || intent === "architecture" ? "large" : complexity >= 3 ? "medium" : "small",
		expectedTurns: intent === "quick-qna" ? "one" : complexity >= 4 ? "many" : "few",
		intent,
		reason: `heuristic ${intent} classification`,
		recommendedThinking,
		recommendedTier,
		risk: intent === "quick-qna" ? "low" : complexity >= 4 ? "high" : "medium",
		toolIntensity: ["implementation", "debugging", "refactor", "autonomous"].includes(intent)
			? "high"
			: intent === "quick-qna"
				? "low"
				: "medium",
	};
}

function detectIntent(text: string): RouteIntent {
	if (/(design|ui|ux|layout|visual|styling|theme|color|aesthetic)/.test(text)) {
		return "design";
	}

	if (/(architecture|system design|tradeoff|approach|deep refactor|cross-cutting)/.test(text)) {
		return "architecture";
	}

	if (/(debug|failing|error|stack trace|why is|broken|fix)/.test(text)) {
		return "debugging";
	}

	if (/(review|audit|look over|inspect this change|code review)/.test(text)) {
		return "review";
	}

	if (/(refactor|clean up|restructure)/.test(text)) {
		return "refactor";
	}

	if (/(plan|roadmap|spec|outline|break down|approach this)/.test(text)) {
		return "planning";
	}

	if (/(research|investigate|compare|look up|search)/.test(text)) {
		return "research";
	}

	if (/(autonomous|work through|handle all of|keep going until)/.test(text)) {
		return "autonomous";
	}

	if (/(implement|build|add|create|wire up|integrate)/.test(text)) {
		return "implementation";
	}

	return text.split(/\s+/).length < 18 ? "quick-qna" : "implementation";
}

function detectComplexity(text: string, intent: RouteIntent): 1 | 2 | 3 | 4 | 5 {
	let score = 1;
	const { length } = text.split(/\s+/);

	if (length > 20) {
		score += 1;
	}

	if (length > 50) {
		score += 1;
	}

	if (/(multiple|across|migration|all of these|thoroughly|deeply|telemetry|fallback|quota|policy)/.test(text)) {
		score += 1;
	}

	if (["architecture", "autonomous", "design"].includes(intent)) {
		score += 1;
	}

	return Math.min(score, 5) as 1 | 2 | 3 | 4 | 5;
}

function detectTier(intent: RouteIntent, complexity: number) {
	if (intent === "quick-qna" && complexity <= 2) {
		return "cheap" as const;
	}

	if ((intent === "design" || intent === "architecture" || intent === "autonomous") && complexity >= 4) {
		return "peak" as const;
	}

	if (complexity >= 4 || intent === "debugging" || intent === "refactor") {
		return "premium" as const;
	}

	return complexity <= 2 ? ("cheap" as const) : ("balanced" as const);
}

function detectThinking(tier: PromptRouteClassification["recommendedTier"]): RouteThinkingLevel {
	if (tier === "cheap") {
		return "minimal";
	}

	if (tier === "balanced") {
		return "medium";
	}

	if (tier === "premium") {
		return "high";
	}

	return "xhigh";
}

function pickRouterModel(
	routerModels: string[],
	candidates: NormalizedRouteCandidate[],
): NormalizedRouteCandidate | undefined {
	for (const ref of routerModels) {
		const match = candidates.find((candidate) => matchesModelRef(ref, candidate));
		if (match) {
			return match;
		}
	}
	return candidates.find((candidate) => candidate.tier === "cheap") ?? candidates[0];
}

function resolveApiKey(model: Model<Api>, ctx: Pick<ExtensionContext, "modelRegistry">): Promise<string | undefined> {
	return ctx.modelRegistry.getApiKeyForProvider(model.provider);
}

function buildClassifierPrompt(prompt: string): string {
	return [
		"Classify this coding-agent prompt.",
		"Allowed intent values: quick-qna, planning, research, implementation, debugging, design, architecture, review, refactor, autonomous.",
		"Allowed complexity values: 1, 2, 3, 4, 5.",
		"Allowed risk values: low, medium, high.",
		"Allowed expectedTurns values: one, few, many.",
		"Allowed toolIntensity values: low, medium, high.",
		"Allowed contextBreadth values: small, medium, large.",
		"Allowed recommendedTier values: cheap, balanced, premium, peak.",
		"Allowed recommendedThinking values: off, minimal, low, medium, high, xhigh.",
		"Return JSON only.",
		`Prompt: ${prompt}`,
	].join("\n");
}

const VALID_INTENTS = new Set<RouteIntent>([
	"quick-qna",
	"planning",
	"research",
	"implementation",
	"debugging",
	"design",
	"architecture",
	"review",
	"refactor",
	"autonomous",
]);
const VALID_TIERS = new Set<RouteTier>(["cheap", "balanced", "premium", "peak"]);
const VALID_THINKING = new Set<RouteThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh"]);
const VALID_RISKS = new Set<RouteRisk>(["low", "medium", "high"]);
const VALID_TURNS = new Set<RouteExpectedTurns>(["one", "few", "many"]);
const VALID_TOOL_INTENSITY = new Set<RouteToolIntensity>(["low", "medium", "high"]);
const VALID_CONTEXT_BREADTH = new Set<RouteContextBreadth>(["small", "medium", "large"]);

/**
 * Parse the classifier's answer, rejecting values that would silently poison routing.
 *
 * An unrecognized intent would look up to `undefined` in the intent policy table and
 * disable that intent's configured routing, so an unknown intent rejects the whole
 * response and classification falls back to heuristics. Other enum fields fall back to
 * the deterministic intent-derived defaults instead of trusting the LLM verbatim.
 */
export function parseClassifierResponse(text: string): PromptRouteClassification | undefined {
	try {
		const match = text.match(/\{[\s\S]*\}/);
		if (!match) {
			return undefined;
		}
		const parsed = JSON.parse(match[0]) as Partial<PromptRouteClassification>;
		if (!(typeof parsed.intent === "string" && VALID_INTENTS.has(parsed.intent as RouteIntent))) {
			return undefined;
		}
		const base = buildFallbackClassification(parsed.intent as RouteIntent);
		const complexity = parseComplexity(parsed.complexity);
		return {
			...base,
			...parsed,
			complexity: complexity ?? base.complexity,
			confidence: clampConfidence(parsed.confidence),
			contextBreadth: enumOrFallback(parsed.contextBreadth, VALID_CONTEXT_BREADTH, base.contextBreadth),
			expectedTurns: enumOrFallback(parsed.expectedTurns, VALID_TURNS, base.expectedTurns),
			intent: base.intent,
			recommendedTier: enumOrFallback(parsed.recommendedTier, VALID_TIERS, base.recommendedTier),
			recommendedThinking: enumOrFallback(parsed.recommendedThinking, VALID_THINKING, base.recommendedThinking),
			reason: typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim() : "llm classification",
			risk: enumOrFallback(parsed.risk, VALID_RISKS, base.risk),
			toolIntensity: enumOrFallback(parsed.toolIntensity, VALID_TOOL_INTENSITY, base.toolIntensity),
		};
	} catch {
		return undefined;
	}
}

function enumOrFallback<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
	return typeof value === "string" && (allowed as Set<string>).has(value) ? (value as T) : fallback;
}

function parseComplexity(value: unknown): RouteComplexity | undefined {
	return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5
		? (value as RouteComplexity)
		: undefined;
}

function extractAnswer(message: AssistantMessage): string {
	return message.content
		.filter((part): part is Extract<AssistantMessage["content"][number], { type: "text" }> => part.type === "text")
		.map((part) => part.text)
		.join("")
		.trim();
}

function clampConfidence(value: unknown): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return 0.65;
	}
	return Math.max(0, Math.min(1, parsed));
}
