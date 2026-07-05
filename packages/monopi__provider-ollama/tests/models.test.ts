import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadCachedOllamaCloudModels, saveCachedOllamaCloudModels } from "../cache.js";
import {
	discoverOllamaCloudModelList,
	discoverOllamaCloudModels,
	discoverOllamaLocalModels,
	getCredentialModels,
	toOllamaModel,
} from "../models.js";
import { createTestOllamaBackend } from "./test-backend.js";

const envSnapshot = { ...process.env };

afterEach(() => {
	for (const key of Object.keys(process.env)) {
		if (!(key in envSnapshot)) {
			delete process.env[key];
		}
	}
	Object.assign(process.env, envSnapshot);
});

describe("ollama models", () => {
	it("normalizes model defaults", () => {
		const model = toOllamaModel({
			id: "gpt-oss:120b",
			source: "cloud",
			reasoning: true,
			input: ["text"],
		});
		const compat = model.compat as
			| {
					supportsDeveloperRole?: boolean;
					maxTokensField?: string;
			  }
			| undefined;
		expect(model.name).toContain("GPT");
		expect(model.name).toContain("(Cloud)");
		expect(compat?.supportsDeveloperRole).toBe(false);
		expect(compat?.maxTokensField).toBe("max_tokens");
	});

	it("applies authoritative cloud metadata and z.ai compat defaults to glm models", () => {
		const model = toOllamaModel({
			contextWindow: 131_072,
			id: "glm-5.2",
			source: "cloud",
			reasoning: false,
			input: ["text"],
			maxTokens: 25_344,
		});
		const compat = model.compat as
			| {
					supportsReasoningEffort?: boolean;
					thinkingFormat?: string;
					zaiToolStream?: boolean;
			  }
			| undefined;
		expect(model.contextWindow).toBe(1_000_000);
		expect(model.maxTokens).toBe(131_072);
		expect(model.reasoning).toBe(true);
		expect(model.capabilities).toContain("thinking");
		expect(getSupportedThinkingLevels(model as never)).toEqual(["off", "minimal", "low", "medium", "high", "xhigh"]);
		expect(compat?.supportsReasoningEffort).toBe(false);
		expect(compat?.thinkingFormat).toBe("zai");
		expect(compat?.zaiToolStream).toBe(true);
	});

	it("restores thinking levels for known Ollama Cloud reasoning models from stale stored metadata", () => {
		const models = [
			toOllamaModel({ contextWindow: 32_768, id: "kimi-k2.6", maxTokens: 8_192, reasoning: false, source: "cloud" }),
			toOllamaModel({ contextWindow: 32_768, id: "minimax-m3", maxTokens: 8_192, reasoning: false, source: "cloud" }),
			toOllamaModel({ contextWindow: 32_768, id: "qwen3.5:397b", maxTokens: 8_192, reasoning: false, source: "cloud" }),
		];

		expect(models.map((model) => model.reasoning)).toEqual([true, true, true]);
		expect(models.map((model) => getSupportedThinkingLevels(model as never))).toEqual([
			["off", "minimal", "low", "medium", "high", "xhigh"],
			["off", "minimal", "low", "medium", "high", "xhigh"],
			["off", "minimal", "low", "medium", "high", "xhigh"],
		]);
		expect(models.map((model) => model.contextWindow)).toEqual([262_144, 524_288, 262_144]);
	});

	it("sanitizes credential models with authoritative cloud metadata floors", () => {
		const models = getCredentialModels({
			access: "a",
			expires: Date.now() + 1000,
			refresh: "r",
			models: [
				{
					...toOllamaModel({ id: "glm-5.2", source: "cloud" }),
					contextWindow: 131_072,
					maxTokens: 8_192,
					reasoning: false,
				},
			],
		});

		expect(models[0]).toMatchObject({
			contextWindow: 1_000_000,
			id: "glm-5.2",
			maxTokens: 131_072,
			reasoning: true,
		});
	});

	it("discovers cloud model ids before metadata enrichment", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([
			{ id: "brand-new-cloud-model" },
			{
				id: "gpt-oss:120b",
			},
		]);
		backend.setRejectedModelShows(["brand-new-cloud-model", "gpt-oss:120b"]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		const models = await discoverOllamaCloudModelList("test-key");
		expect(models?.map((model) => model.id)).toEqual(["brand-new-cloud-model", "gpt-oss:120b"]);
		expect(models?.[0]?.source).toBe("cloud");
		expect(models?.[1]?.reasoning).toBe(true);
		expect(getSupportedThinkingLevels(models![1]! as never)).toEqual(["minimal", "low", "medium", "high"]);
		expect(backend.getAuthHeaders()).toEqual(["Bearer test-key"]);
		await backend.close();
	});

	it("loads cloud models from the startup cache", async () => {
		const cacheDir = await mkdtemp(join(tmpdir(), "pi-ollama-cache-"));
		process.env.PI_OLLAMA_CLOUD_CACHE_PATH = join(cacheDir, "models.json");
		await saveCachedOllamaCloudModels([
			toOllamaModel({
				id: "brand-new-cloud-model",
				reasoning: true,
				source: "cloud",
			}),
		]);
		const models = loadCachedOllamaCloudModels();
		expect(models.map((model) => model.id)).toEqual(["brand-new-cloud-model"]);
		expect(models[0]?.reasoning).toBe(true);
		await rm(cacheDir, { force: true, recursive: true });
	});

	it("discovers cloud models with bearer auth", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([
			{
				id: "gpt-oss:120b",
				capabilities: ["completion", "tools", "thinking"],
				contextWindow: 131072,
				family: "gpt-oss",
				parameterSize: "120B",
				quantization: "Q4_K_M",
			},
			{
				id: "qwen3-vl:235b",
				capabilities: ["completion", "tools", "thinking", "vision"],
				contextWindow: 262144,
				family: "qwen3-vl",
				parameterSize: "235B",
			},
		]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		const models = await discoverOllamaCloudModels("test-key");
		expect(models?.map((model) => model.id)).toEqual(["gpt-oss:120b", "qwen3-vl:235b"]);
		expect(models?.[0]?.reasoning).toBe(true);
		expect(models?.[0]?.name).toContain("(Cloud)");
		expect(models?.[0]?.parameterSize).toBe("120B");
		expect(models?.[0]?.quantization).toBe("Q4_K_M");
		expect(models?.[1]?.input).toEqual(["text", "image"]);
		expect(backend.getAuthHeaders()).toEqual(["", "", "", "Bearer test-key", "Bearer test-key", "Bearer test-key"]);
		await backend.close();
	});

	it("prefers the public cloud catalog when authenticated discovery is narrower", async () => {
		const backend = await createTestOllamaBackend();
		backend.setPublicModels([
			{
				id: "glm-5.1",
				capabilities: ["completion", "tools", "thinking"],
				contextWindow: 202752,
				family: "glm5.1",
				parameterSize: "756B",
				quantization: "FP8",
			},
			{
				id: "kimi-k2.5",
				capabilities: ["completion", "tools", "thinking", "vision"],
				contextWindow: 262144,
				family: "kimi-k2.5",
				parameterSize: "1T",
			},
			{
				id: "qwen3-next:80b",
				capabilities: ["completion", "tools", "thinking"],
				contextWindow: 262144,
				family: "qwen3-next",
				parameterSize: "80B",
			},
		]);
		backend.setAuthenticatedModels([
			{
				id: "glm-5.1",
				capabilities: ["completion", "tools", "thinking"],
				contextWindow: 202752,
				family: "glm5.1",
				parameterSize: "756B",
				quantization: "FP8",
			},
		]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		const models = await discoverOllamaCloudModels("test-key");
		expect(models?.map((model) => model.id)).toEqual(["glm-5.1", "kimi-k2.5", "qwen3-next:80b"]);
		await backend.close();
	});

	it("discovers public cloud models without auth", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([
			{
				id: "glm-5.1",
				capabilities: ["completion", "tools", "thinking"],
				contextWindow: 202752,
				family: "glm5.1",
				parameterSize: "756B",
				quantization: "FP8",
			},
			{
				id: "kimi-k2.5",
				capabilities: ["completion", "tools", "thinking", "vision"],
				contextWindow: 262144,
				family: "kimi-k2.5",
				parameterSize: "1T",
			},
		]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		const models = await discoverOllamaCloudModels();
		const glmCompat = models?.[0]?.compat as
			| {
					supportsReasoningEffort?: boolean;
					thinkingFormat?: string;
					zaiToolStream?: boolean;
			  }
			| undefined;
		expect(models?.map((model) => model.id)).toEqual(["glm-5.1", "kimi-k2.5"]);
		expect(models?.[0]?.reasoning).toBe(true);
		expect(models?.[0]?.maxTokens).toBe(131_072);
		expect(glmCompat?.supportsReasoningEffort).toBe(false);
		expect(glmCompat?.thinkingFormat).toBe("zai");
		expect(glmCompat?.zaiToolStream).toBe(true);
		expect(models?.[1]?.input).toEqual(["text", "image"]);
		expect(backend.getAuthHeaders()).toEqual(["", "", ""]);
		await backend.close();
	});

	it("discovers local models without auth", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([
			{
				id: "gemma3:4b",
				capabilities: ["completion", "vision"],
				contextWindow: 131072,
				family: "gemma3",
				parameterSize: "4.3B",
			},
			{
				id: "qwen2.5-coder:7b",
				capabilities: ["completion"],
				contextWindow: 32768,
				family: "qwen2.5-coder",
				parameterSize: "7B",
			},
		]);
		process.env.OLLAMA_HOST = backend.origin;
		const models = await discoverOllamaLocalModels();
		expect(models?.map((model) => model.id)).toEqual(["gemma3:4b", "qwen2.5-coder:7b"]);
		expect(models?.[0]?.name).toContain("(Local)");
		expect(models?.[0]?.input).toEqual(["text", "image"]);
		expect(models?.[0]?.parameterSize).toBe("4.3B");
		expect(backend.getAuthHeaders()).toEqual(["", "", ""]);
		await backend.close();
	});

	it("uses Ollama show metadata and catalog heuristics for thinking and token limits", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([
			{
				id: "qwen3:32b",
				capabilities: ["completion", "tools"],
				contextWindow: 32768,
				family: "qwen3",
				maxTokens: 8192,
				parameters: "temperature 0.7\nnum_ctx 65536\nnum_predict 12288",
			},
		]);
		process.env.OLLAMA_HOST = backend.origin;
		const models = await discoverOllamaLocalModels();
		expect(models?.[0]?.reasoning).toBe(true);
		expect(models?.[0]?.contextWindow).toBe(32768);
		expect(models?.[0]?.maxTokens).toBe(8192);
		expect(getSupportedThinkingLevels(models![0]! as never)).toEqual([
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
		]);
		await backend.close();
	});

	it("uses default metadata when show discovery fails", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([
			{
				id: "gpt-oss:120b",
				capabilities: ["completion", "tools", "thinking"],
				contextWindow: 131072,
			},
			{
				id: "qwen3-vl:235b",
				capabilities: ["completion", "tools", "thinking", "vision"],
				contextWindow: 262144,
			},
		]);
		backend.setRejectedModelShows(["qwen3-vl:235b"]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		const models = await discoverOllamaCloudModels("test-key");
		expect(models?.map((model) => model.id)).toEqual(["gpt-oss:120b", "qwen3-vl:235b"]);
		expect(models?.[1]?.input).toEqual(["text"]);
		expect(models?.[1]?.reasoning).toBe(true);
		await backend.close();
	});

	it("preserves cached cloud metadata when model show metadata is incomplete", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([{ id: "new-cloud-model", capabilities: ["completion"] }]);
		backend.setRejectedModelShows(["new-cloud-model"]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		const models = await discoverOllamaCloudModels("test-key", {
			cachedModels: new Map([
				[
					"new-cloud-model",
					toOllamaModel({
						contextWindow: 524_288,
						family: "cached-family",
						id: "new-cloud-model",
						input: ["text", "image"],
						maxTokens: 65_536,
						parameterSize: "999B",
						reasoning: true,
						source: "cloud",
					}),
				],
			]),
		});

		expect(models?.[0]).toMatchObject({
			contextWindow: 524_288,
			family: "cached-family",
			input: ["text", "image"],
			maxTokens: 65_536,
			parameterSize: "999B",
			reasoning: true,
		});
		await backend.close();
	});

	it("prefers models stored with the login credential", () => {
		const models = getCredentialModels({
			refresh: "r",
			access: "a",
			expires: Date.now() + 1000,
			models: [
				toOllamaModel({
					id: "qwen3-next:80b",
					source: "cloud",
					reasoning: true,
					input: ["text"],
					contextWindow: 262144,
					maxTokens: 32768,
				}),
			],
		});
		expect(models).toHaveLength(1);
		expect(models[0]?.id).toBe("qwen3-next:80b");
	});
});
