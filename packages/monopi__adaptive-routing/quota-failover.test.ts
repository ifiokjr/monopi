import { describe, expect, it } from "vitest";

import type { NormalizedRouteCandidate, ProviderUsageState, QuotaFailoverConfig } from "./types.js";

import { normalizeAdaptiveRoutingConfig } from "./config.js";
import { DEFAULT_QUOTA_FAILOVER_CONFIG } from "./defaults.js";
import { deriveMirrorSets, normalizeMirrorModelId, resolveQuotaFailover, type MirrorSet } from "./quota-failover.js";

function candidate(provider: string, id: string): NormalizedRouteCandidate {
	return {
		authenticated: true,
		available: true,
		contextWindow: 200_000,
		costKnown: true,
		fallbackGroups: [],
		family: undefined,
		fullId: `${provider}/${id}`,
		input: ["text"],
		label: `${provider}/${id}`,
		maxThinkingLevel: "high",
		maxTokens: 32_768,
		model: { id, provider } as NormalizedRouteCandidate["model"],
		modelId: id,
		provider,
		reasoning: true,
		tags: [],
		tier: "cheap",
	};
}

const GLM_CANDIDATES = [
	candidate("ollama-cloud", "glm-5.3-flash"),
	candidate("zai", "glm-5.3-flash"),
	candidate("opencode-go", "glm-5.3-flash"),
];

const GLM_SET: MirrorSet = {
	explicit: true,
	home: "ollama-cloud/glm-5.3-flash",
	members: ["ollama-cloud/glm-5.3-flash", "zai/glm-5.3-flash", "opencode-go/glm-5.3-flash"],
};

function quota(
	entries: Record<string, { remainingPct?: number; probedAt?: number; windowLabel?: string }>,
): ProviderUsageState["providers"] {
	const providers: ProviderUsageState["providers"] = {};
	for (const [provider, value] of Object.entries(entries)) {
		providers[provider] = { confidence: value.remainingPct === undefined ? "unknown" : "authoritative", ...value };
	}
	return providers;
}

function resolve(
	overrides: Partial<Parameters<typeof resolveQuotaFailover>[0]> = {},
	currentFullId = "ollama-cloud/glm-5.3-flash",
	providers: ProviderUsageState["providers"] = quota({
		"ollama-cloud": { probedAt: Date.now(), remainingPct: 0.4, windowLabel: "Session (5h)" },
		"opencode-go": { probedAt: Date.now(), remainingPct: 88 },
		zai: { probedAt: Date.now(), remainingPct: 97.1 },
	}),
) {
	return resolveQuotaFailover({
		config: DEFAULT_QUOTA_FAILOVER_CONFIG,
		currentFullId,
		now: Date.now(),
		quota: providers,
		sets: [GLM_SET],
		...overrides,
	});
}

describe("normalizeMirrorModelId", () => {
	it("strips provider tags and normalizes case", () => {
		expect(normalizeMirrorModelId("Glm-5.3-Flash:cloud")).toBe("glm-5.3-flash");
		expect(normalizeMirrorModelId("glm-5.3-flash")).toBe("glm-5.3-flash");
	});
});

describe("deriveMirrorSets", () => {
	it("resolves explicit config sets against available candidates", () => {
		const config: QuotaFailoverConfig = {
			...DEFAULT_QUOTA_FAILOVER_CONFIG,
			autoMirror: false,
			mirrorSets: [
				["ollama-cloud/glm-5.3-flash", "zai/glm-5.3-flash", "opencode-go/glm-5.3-flash", "groq/not-available"],
			],
		};
		const sets = deriveMirrorSets(GLM_CANDIDATES, config);
		expect(sets).toHaveLength(1);
		expect(sets[0]).toEqual({
			explicit: true,
			home: "ollama-cloud/glm-5.3-flash",
			members: ["ollama-cloud/glm-5.3-flash", "zai/glm-5.3-flash", "opencode-go/glm-5.3-flash"],
		});
	});

	it("drops explicit sets with fewer than two available members", () => {
		const config: QuotaFailoverConfig = {
			...DEFAULT_QUOTA_FAILOVER_CONFIG,
			autoMirror: false,
			mirrorSets: [["ollama-cloud/glm-5.3-flash", "groq/gone"]],
		};
		expect(deriveMirrorSets(GLM_CANDIDATES, config)).toHaveLength(0);
	});

	it("dedupes identical explicit sets", () => {
		const config: QuotaFailoverConfig = {
			...DEFAULT_QUOTA_FAILOVER_CONFIG,
			autoMirror: false,
			mirrorSets: [
				["ollama-cloud/glm-5.3-flash", "zai/glm-5.3-flash"],
				["zai/glm-5.3-flash", "ollama-cloud/glm-5.3-flash"],
			],
		};
		expect(deriveMirrorSets(GLM_CANDIDATES, config)).toHaveLength(1);
	});

	it("auto-derives sets from identical model ids across providers", () => {
		const config = { ...DEFAULT_QUOTA_FAILOVER_CONFIG, autoMirror: true };
		const sets = deriveMirrorSets(GLM_CANDIDATES, config);
		expect(sets).toHaveLength(1);
		expect(sets[0]?.explicit).toBe(false);
		expect(sets[0]?.home).toBeUndefined();
		expect(sets[0]?.members).toHaveLength(3);
	});

	it("skips auto groups confined to one provider and dedupes against explicit sets", () => {
		const candidates = [
			...GLM_CANDIDATES,
			candidate("ollama-cloud", "qwen3-coder:397b"),
			candidate("zai", "other-model"),
		];
		const config: QuotaFailoverConfig = {
			...DEFAULT_QUOTA_FAILOVER_CONFIG,
			autoMirror: true,
			mirrorSets: [["ollama-cloud/glm-5.3-flash", "zai/glm-5.3-flash", "opencode-go/glm-5.3-flash"]],
		};
		const sets = deriveMirrorSets(candidates, config);
		// Explicit glm set + no auto duplicates; the unrelated same-provider pairs add nothing.
		expect(sets).toHaveLength(1);
		expect(sets[0]?.explicit).toBe(true);
	});

	it("matches tagged ollama ids to untagged set members", () => {
		const candidates = [candidate("ollama-cloud", "glm-5.3-flash:cloud"), candidate("zai", "glm-5.3-flash")];
		const config: QuotaFailoverConfig = {
			...DEFAULT_QUOTA_FAILOVER_CONFIG,
			autoMirror: true,
			mirrorSets: [],
		};
		const sets = deriveMirrorSets(candidates, config);
		expect(sets).toHaveLength(1);
		expect(sets[0]?.members).toContain("ollama-cloud/glm-5.3-flash:cloud");
	});
});

describe("resolveQuotaFailover", () => {
	it("keeps models outside any mirror set", () => {
		const action = resolve({}, "anthropic/claude-sonnet-4");
		expect(action).toEqual({ reason: "no-set", type: "keep" });
	});

	it("keeps the current model while quota is healthy", () => {
		const action = resolve(
			{},
			"ollama-cloud/glm-5.3-flash",
			quota({ "ollama-cloud": { probedAt: Date.now(), remainingPct: 42 } }),
		);
		expect(action).toEqual({ reason: "healthy", type: "keep" });
	});

	it("switches to the healthiest mirror when the active provider is exhausted", () => {
		const action = resolve();
		expect(action).toMatchObject({
			from: "ollama-cloud/glm-5.3-flash",
			fromRemainingPct: 0.4,
			reason: "exhausted",
			to: "zai/glm-5.3-flash",
			toRemainingPct: 97.1,
			type: "switch",
			windowLabel: "Session (5h)",
		});
	});

	it("prefers earlier set order when mirrors tie on remaining quota", () => {
		const action = resolve(
			{},
			"ollama-cloud/glm-5.3-flash",
			quota({
				"ollama-cloud": { probedAt: Date.now(), remainingPct: 0.2 },
				"opencode-go": { probedAt: Date.now(), remainingPct: 50 },
				zai: { probedAt: Date.now(), remainingPct: 50 },
			}),
		);
		expect(action).toMatchObject({ to: "zai/glm-5.3-flash", type: "switch" });
	});

	it("skips mirrors below the required threshold", () => {
		const action = resolve(
			{ config: { ...DEFAULT_QUOTA_FAILOVER_CONFIG, requireMirrorAbovePct: 60 } },
			"ollama-cloud/glm-5.3-flash",
			quota({
				"ollama-cloud": { probedAt: Date.now(), remainingPct: 0.2 },
				"opencode-go": { probedAt: Date.now(), remainingPct: 50 },
				zai: { probedAt: Date.now(), remainingPct: 55 },
			}),
		);
		expect(action).toEqual({ reason: "no-mirror", type: "keep" });
	});

	it("keeps the current model when quota is unknown and the policy is stay", () => {
		const action = resolve(
			{},
			"ollama-cloud/glm-5.3-flash",
			quota({ "ollama-cloud": {}, zai: { probedAt: Date.now(), remainingPct: 90 } }),
		);
		expect(action).toEqual({ reason: "quota-unknown", type: "keep" });
	});

	it("treats unknown quota as exhausted when the policy is switch", () => {
		const action = resolve(
			{ config: { ...DEFAULT_QUOTA_FAILOVER_CONFIG, onUnknownQuota: "switch" } },
			"ollama-cloud/glm-5.3-flash",
			quota({ "ollama-cloud": {}, zai: { probedAt: Date.now(), remainingPct: 90 } }),
		);
		expect(action).toMatchObject({ reason: "exhausted", to: "zai/glm-5.3-flash", type: "switch" });
	});

	it("treats stale snapshots as unknown", () => {
		const stale = Date.now() - (DEFAULT_QUOTA_FAILOVER_CONFIG.staleAfterMinutes + 1) * 60_000;
		const action = resolve(
			{},
			"ollama-cloud/glm-5.3-flash",
			quota({
				"ollama-cloud": { probedAt: stale, remainingPct: 0.1 },
				zai: { probedAt: Date.now(), remainingPct: 90 },
			}),
		);
		expect(action).toEqual({ reason: "quota-unknown", type: "keep" });
	});

	it("trusts snapshots without a probe timestamp", () => {
		const action = resolve(
			{},
			"ollama-cloud/glm-5.3-flash",
			quota({ "ollama-cloud": { remainingPct: 0.1 }, zai: { remainingPct: 90 } }),
		);
		expect(action).toMatchObject({ reason: "exhausted", to: "zai/glm-5.3-flash", type: "switch" });
	});

	it("returns home once the home provider recovers", () => {
		const action = resolve(
			{},
			"zai/glm-5.3-flash",
			quota({
				"ollama-cloud": { probedAt: Date.now(), remainingPct: 80, windowLabel: "Session (5h)" },
				zai: { probedAt: Date.now(), remainingPct: 40 },
			}),
		);
		expect(action).toMatchObject({
			from: "zai/glm-5.3-flash",
			reason: "return-home",
			to: "ollama-cloud/glm-5.3-flash",
			toRemainingPct: 80,
			type: "switch",
		});
	});

	it("stays away from home while it is still exhausted", () => {
		const action = resolve(
			{},
			"zai/glm-5.3-flash",
			quota({
				"ollama-cloud": { probedAt: Date.now(), remainingPct: 1 },
				"opencode-go": { probedAt: Date.now(), remainingPct: 30 },
				zai: { probedAt: Date.now(), remainingPct: 40 },
			}),
		);
		expect(action).toEqual({ reason: "healthy", type: "keep" });
	});

	it("never switches while a manual lock is active", () => {
		const action = resolve({ locked: true });
		expect(action).toEqual({ reason: "locked", type: "keep" });
	});

	it("never switches to a mirror on the same provider as the current model", () => {
		const action = resolve(
			{
				sets: [{ explicit: true, home: "zai/glm-5.3-flash", members: ["zai/glm-5.3-flash", "zai/glm-5.3-flash:pro"] }],
			},
			"zai/glm-5.3-flash",
			quota({ zai: { probedAt: Date.now(), remainingPct: 0.1 } }),
		);
		expect(action).toEqual({ reason: "no-mirror", type: "keep" });
	});

	it("ignores members without a provider prefix when matching", () => {
		const action = resolve(
			{
				sets: [{ explicit: true, members: ["ollama-cloud/glm-5.3-flash", "glm-5.3-flash"] }],
			},
			"ollama-cloud/glm-5.3-flash",
			quota({ "ollama-cloud": { probedAt: Date.now(), remainingPct: 0.1 } }),
		);
		expect(action).toEqual({ reason: "no-mirror", type: "keep" });
	});
});

describe("quotaFailover config normalization", () => {
	it("fills defaults for a missing section", () => {
		const config = normalizeAdaptiveRoutingConfig({});
		expect(config.quotaFailover).toEqual(DEFAULT_QUOTA_FAILOVER_CONFIG);
		expect(config.quotaFailover.enabled).toBe(false);
	});

	it("falls back when the section is not an object", () => {
		const config = normalizeAdaptiveRoutingConfig({ quotaFailover: "nope" });
		expect(config.quotaFailover).toEqual(DEFAULT_QUOTA_FAILOVER_CONFIG);
	});

	it("normalizes thresholds, sets, and flags", () => {
		const config = normalizeAdaptiveRoutingConfig({
			quotaFailover: {
				autoMirror: false,
				enabled: true,
				mirrorSets: [["ollama-cloud/glm-5.3-flash", "zai/glm-5.3-flash"]],
				onUnknownQuota: "switch",
				requireMirrorAbovePct: "30",
				staleAfterMinutes: 5,
				switchBelowPct: "not-a-number",
			},
		});
		expect(config.quotaFailover).toEqual({
			autoMirror: false,
			enabled: true,
			mirrorSets: [["ollama-cloud/glm-5.3-flash", "zai/glm-5.3-flash"]],
			onUnknownQuota: "switch",
			requireMirrorAbovePct: 30,
			returnHome: true,
			staleAfterMinutes: 5,
			switchBelowPct: 5,
		});
	});

	it("drops mirror sets with fewer than two valid ids", () => {
		const config = normalizeAdaptiveRoutingConfig({
			quotaFailover: {
				enabled: true,
				mirrorSets: [["only-one"], "nope", ["a", "b"]],
			},
		});
		expect(config.quotaFailover.mirrorSets).toEqual([["a", "b"]]);
	});
});
