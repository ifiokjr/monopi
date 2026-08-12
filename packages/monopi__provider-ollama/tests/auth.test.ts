import { afterEach, describe, expect, it, vi } from "vitest";

import { createOllamaCloudOAuthProvider, loginOllamaCloud, refreshOllamaCloudCredential } from "../auth.js";
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

describe("ollama cloud auth", () => {
	it("opens the keys page and exchanges a pasted API key for a static credential with discovered models", async () => {
		const backend = await createTestOllamaBackend();
		backend.setModels([
			{
				id: "gpt-oss:120b",
				capabilities: ["completion", "tools", "thinking"],
				contextWindow: 131072,
			},
		]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;
		process.env.PI_OLLAMA_CLOUD_KEYS_URL = backend.keysUrl;

		let openedUrl = "";
		const credential = await loginOllamaCloud({
			onAuth(params) {
				openedUrl = params.url;
			},
			onDeviceCode: vi.fn(),
			onPrompt: vi.fn(async () => "test-key"),
			onSelect: vi.fn(async () => undefined),
		});

		expect(openedUrl).toBe(backend.keysUrl);
		expect(credential.access).toBe("test-key");
		expect(credential.models?.[0]?.id).toBe("gpt-oss:120b");
		await backend.close();
	});

	it("refreshes credentials and preserves discovered models when discovery fails", async () => {
		const backend = await createTestOllamaBackend();
		backend.setRejectAuth(true);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.origin}/api/show`;

		const refreshed = await refreshOllamaCloudCredential({
			refresh: "test-key",
			access: "test-key",
			expires: Date.now() - 1000,
			models: [
				{
					id: "qwen3-next:80b",
					name: "Qwen3 Next 80B",
					reasoning: true,
					input: ["text"],
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
					contextWindow: 262144,
					maxTokens: 32768,
					source: "cloud",
				},
			],
		} as never);

		expect(refreshed.models?.[0]?.id).toBe("qwen3-next:80b");
		await backend.close();
	});

	it("delegates model discovery to the provider refresh hook", () => {
		expect(createOllamaCloudOAuthProvider(() => []).modifyModels).toBeUndefined();
	});
});
