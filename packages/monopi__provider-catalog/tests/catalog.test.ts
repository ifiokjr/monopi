import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearModelsDevCatalogCache, getCatalogModels, resolveProviderModels } from "../catalog.js";
import { getSupportedProvider, SUPPORTED_PROVIDERS } from "../config.js";

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

const sampleCatalog = {
	opencode: {
		models: {
			"kimi-k2.5": {
				id: "kimi-k2.5",
				name: "Kimi K2.5",
				reasoning: true,
				attachment: true,
				cost: { input: 0.6, output: 3, cache_read: 0.1, cache_write: 0 },
				limit: { context: 262144, output: 32768 },
				modalities: { input: ["text", "image"], output: ["text"] },
			},
			"qwen3.6-plus": {
				id: "qwen3.6-plus",
				name: "Qwen3.6 Plus",
				reasoning: true,
				cost: {
					input: 0.5,
					output: 3,
					cache_read: 0.05,
					cache_write: 0.625,
					tiers: [
						{
							input: 2,
							output: 6,
							cache_read: 0.2,
							cache_write: 2.5,
							tier: { type: "context", size: 256000 },
						},
						// Models.dev occasionally omits `tier.size`; those entries are skipped.
						{ input: 9, output: 9, tier: { type: "context" } },
					],
				},
				limit: { context: 1000000, output: 65536 },
				modalities: { input: ["text"], output: ["text"] },
			},
			"text-embedding-3-large": {
				id: "text-embedding-3-large",
				name: "Embedding",
				reasoning: false,
				attachment: false,
				limit: { context: 8192, output: 0 },
				modalities: { input: ["text"], output: [] },
			},
		},
	},
	minimax: {
		models: {
			"minimax-m2.5": {
				id: "minimax-m2.5",
				name: "MiniMax M2.5",
				reasoning: true,
				attachment: true,
				limit: { context: 200000, output: 20000 },
				modalities: { input: ["text", "image"], output: ["text"] },
			},
		},
	},
} satisfies Record<string, unknown>;

beforeEach(() => {
	clearModelsDevCatalogCache();
	vi.restoreAllMocks();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("provider catalog", () => {
	it("includes upstream-backed providers like xAI, OpenCode Go, and Moonshot while excluding Ollama Cloud", () => {
		const ids = new Set(SUPPORTED_PROVIDERS.map((provider) => provider.id));
		expect(ids.has("xai")).toBe(true);
		expect(ids.has("opencode-go")).toBe(true);
		expect(ids.has("moonshotai")).toBe(true);
		expect(ids.has("ollama-cloud")).toBe(false);
	});

	it("maps native Mistral to the Mistral conversations API", () => {
		const provider = getSupportedProvider("mistral");
		expect(provider.api).toBe("mistral-conversations");
		expect(provider.baseUrl).toBe("https://api.mistral.ai");
	});

	it("filters the models.dev catalog down to pi-usable text models", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse(sampleCatalog)),
		);

		const models = await getCatalogModels(getSupportedProvider("opencode"));
		expect(models.map((model) => model.id)).toEqual(["kimi-k2.5", "qwen3.6-plus"]);
		expect(models[0]?.input).toEqual(["text", "image"]);
		expect(models[0]?.reasoning).toBe(true);
	});

	it("keeps fractional per-token prices instead of rounding them to whole dollars", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse(sampleCatalog)),
		);

		const models = await getCatalogModels(getSupportedProvider("opencode"));
		const kimi = models.find((model) => model.id === "kimi-k2.5");
		expect(kimi?.cost).toEqual({ cacheRead: 0.1, cacheWrite: 0, input: 0.6, output: 3 });
	});

	it("maps models.dev context tiers onto pi request-wide pricing tiers", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse(sampleCatalog)),
		);

		const models = await getCatalogModels(getSupportedProvider("opencode"));
		const qwen = models.find((model) => model.id === "qwen3.6-plus");
		expect(qwen?.cost).toEqual({
			cacheRead: 0.05,
			cacheWrite: 0.625,
			input: 0.5,
			output: 3,
			tiers: [{ cacheRead: 0.2, cacheWrite: 2.5, input: 2, inputTokensAbove: 256000, output: 6 }],
		});
	});

	it("re-prices persisted models from the catalog when live discovery is unavailable", async () => {
		const fetch = vi
			.fn<() => Promise<Response>>()
			.mockResolvedValueOnce(jsonResponse(sampleCatalog))
			.mockRejectedValueOnce(new Error("boom"));
		vi.stubGlobal("fetch", fetch);

		const models = await resolveProviderModels(getSupportedProvider("opencode"), "test-key", {
			previous: [
				{
					cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
					contextWindow: 262144,
					id: "kimi-k2.5",
					input: ["text", "image"],
					maxTokens: 32768,
					name: "Kimi K2.5",
					reasoning: true,
				},
			],
		});

		expect(models.map((model) => model.id)).toEqual(["kimi-k2.5"]);
		expect(models[0]?.cost).toEqual({ cacheRead: 0.1, cacheWrite: 0, input: 0.6, output: 3 });
		expect(models[0]?.contextWindow).toBe(262144);
	});

	it("keeps persisted models unchanged when the catalog is unavailable", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("offline");
			}),
		);

		const stored = {
			cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
			contextWindow: 262144,
			id: "kimi-k2.5",
			input: ["text"] as ("text" | "image")[],
			maxTokens: 32768,
			name: "Kimi K2.5",
			reasoning: true,
		};
		const models = await resolveProviderModels(getSupportedProvider("opencode"), "test-key", { previous: [stored] });

		expect(models[0]?.cost).toEqual(stored.cost);
	});

	it("merges anthropic-style live discovery with catalog metadata for providers like MiniMax", async () => {
		const fetch = vi
			.fn<() => Promise<Response>>()
			.mockImplementationOnce(async () => jsonResponse(sampleCatalog))
			.mockImplementationOnce(async () =>
				jsonResponse({
					data: [
						{
							id: "minimax-m2.5",
							thinking_enabled: true,
							max_tokens: 8192,
						},
					],
				}),
			);
		vi.stubGlobal("fetch", fetch);

		const models = await resolveProviderModels(getSupportedProvider("minimax"), "test-key");
		expect(models.map((model) => model.id)).toEqual(["minimax-m2.5"]);
		expect(models[0]?.input).toEqual(["text", "image"]);
		expect(models[0]?.contextWindow).toBe(200000);
	});

	it("falls back to catalog models when live discovery fails", async () => {
		const fetch = vi
			.fn<() => Promise<Response>>()
			.mockImplementationOnce(async () => jsonResponse(sampleCatalog))
			.mockRejectedValueOnce(new Error("boom"));
		vi.stubGlobal("fetch", fetch);

		const models = await resolveProviderModels(getSupportedProvider("opencode"), "test-key");
		expect(models.map((model) => model.id)).toEqual(["kimi-k2.5", "qwen3.6-plus"]);
	});
});
